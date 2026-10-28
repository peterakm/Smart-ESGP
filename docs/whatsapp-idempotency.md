# WhatsApp Webhook Idempotency

Meta can retry webhook delivery. Smart-ESGP treats the WhatsApp provider message ID as the idempotency key.

## Behavior

For each inbound WhatsApp message:

1. Parse the webhook payload.
2. Require a stable Meta `messages[].id` value and a valid international sender number.
3. Ignore malformed messages before session, evidence, consent, or audit state is created.
4. Claim each provider message ID in the shared repository before chatbot side effects.
5. Process only message IDs that were successfully claimed.
6. Ignore duplicates without sending another chatbot reply.
7. Record an audit event for duplicate delivery.

Duplicate audit action:

```text
whatsapp.webhook.duplicate_ignored
```

The webhook response includes:

```text
inboundCount
ignoredCount
claimedCount
processedCount
duplicateCount
replyCount
outbound.sent
outbound.dryRun
outbound.failed
```

The webhook response does not include full reply text or detailed send results. Those are stored for authenticated FELDA monitoring and audit views.

`ignoredCount` is a sanitized operations counter for malformed inbound message objects. Smart-ESGP does not store raw malformed message bodies, start sessions, create evidence, or send replies for those ignored messages.

`claimedCount` is the count of valid provider message IDs this request acquired before side effects. If a retry or concurrent duplicate already claimed the same ID, the later request reports it as a duplicate and sends no reply.

## Database Enforcement

PostgreSQL uses a provider-message claim table:

```text
whatsapp_provider_message_claims
```

The chatbot inserts into this table before sending replies, creating evidence, or updating sessions. Concurrent retry deliveries racing for the same provider message ID can only acquire one claim.

Unprocessed claims are leases, not permanent locks. `SMART_ESGP_WHATSAPP_CLAIM_TTL_SECONDS` controls how long an unprocessed claim blocks retries before a later Meta retry can reclaim it. The default is `300` seconds. Production readiness requires an integer value between `30` and `3600` seconds. Processed claims remain final and are never reclaimed.

Claims are marked `processed` after the webhook event is stored. Duplicate deliveries increment `duplicate_count` and `last_duplicate_at`, giving FELDA operators a way to inspect retry pressure and detect stuck claimed messages through the authenticated dashboard monitoring API:

```text
GET /api/whatsapp/message-claims
```

The dashboard classifies open claims as active or expired using `claimExpiresAt`, so operators can separate normal in-flight processing from stale claims that are eligible for recovery on the next Meta retry.

PostgreSQL also enforces a unique webhook event index:

```text
idx_whatsapp_webhook_events_provider_message_id
```

This prevents duplicate webhook event rows as a second enforcement layer.

## Verification

Run:

```text
npm run smoke:whatsapp-idempotency
npm run smoke:whatsapp-claim-lease
npm run smoke:whatsapp-claim-summary
```

This sends duplicate onboarding and consent messages and verifies:

- messages without provider IDs or valid sender numbers are ignored
- the first delivery is processed
- the duplicate delivery sends no reply
- concurrent duplicate deliveries generate only one reply
- webhook events are stored once per provider message ID
- consent records are stored once
- duplicate deliveries are audited

The claim-lease smoke verifies:

- unprocessed claims block immediate retries
- expired unprocessed claims can be reacquired
- processed claims cannot be reacquired
- duplicate counters survive stale reclaim
