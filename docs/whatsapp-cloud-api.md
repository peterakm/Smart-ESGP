# WhatsApp Cloud API Outbound Messaging

The webhook now generates replies and sends them through a WhatsApp Cloud API sender service.

## Local Behavior

If either value is missing, outbound messages run in `dry_run` mode:

```text
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
```

Dry-run mode records what would have been sent without calling Meta. This is the default local development behavior.

## Real Sending

Configure:

```text
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_GRAPH_API_VERSION=v23.0
WHATSAPP_REQUEST_TIMEOUT_MS=10000
```

`WHATSAPP_PHONE_NUMBER_ID` is the numeric Meta phone-number ID from WhatsApp Manager, not the farmer-facing display number. Values such as `+60123456789` are rejected by readiness because the Graph API send URL requires the ID form.

`WHATSAPP_GRAPH_API_VERSION` must use Meta's version format, for example `v23.0`.

`WHATSAPP_REQUEST_TIMEOUT_MS` controls the Cloud API HTTP request timeout. The value must be an integer between `1000` and `60000`; the default is `10000`.

The sender calls:

```text
POST https://graph.facebook.com/{version}/{phone-number-id}/messages
```

with a text payload containing:

```json
{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "60123456789",
  "type": "text",
  "text": {
    "preview_url": false,
    "body": "message text"
  }
}
```

## Webhook Replies

`POST /api/whatsapp/webhook` now:

1. parses inbound WhatsApp messages
1. parses WhatsApp delivery status callbacks
2. requires a Meta message ID and valid international sender number
3. advances onboarding/check-in state
4. creates reply text
5. sends the reply through the Cloud API sender
6. stores outbound send status on the webhook event

Malformed messages without a stable `messages[].id` or valid sender number are ignored before sessions, evidence, consent, or WhatsApp event records are created.

The public webhook response is intentionally a processing summary only. It includes counts such as `inboundCount`, `ignoredCount`, `deliveryStatusCount`, `claimedCount`, `processedCount`, `duplicateCount`, `replyCount`, and outbound mode totals, but it does not echo chatbot reply text, recipient phone numbers, raw provider payloads, or full send-result objects. `inboundCount` counts valid parsed inbound messages only, `ignoredCount` counts malformed message/status objects ignored before state changes, and `claimedCount` counts provider message IDs this request acquired before side effects.

Delivery status callbacks are written to the cross-service audit stream as `whatsapp.delivery.status`. Failed delivery statuses are recorded with `severity=error`, so the FELDA dashboard operational alerts can surface them quickly.

Raw Meta message payload retention is controlled by:

```text
SMART_ESGP_RETAIN_WHATSAPP_RAW_PAYLOADS=false
```

Production defaults to stripping raw provider payloads before persistence. Local development defaults to retaining them for debugging unless this value is set to `false`.

Recent dashboard events show send mode:

- `sent`
- `dry_run`
- `failed`

Network errors, timeouts, and non-JSON Meta error responses are recorded as `failed` send results instead of crashing the webhook handler. The public webhook response only reports the outbound mode counts.

FELDA monitoring APIs can load failed sends directly:

```text
GET /api/whatsapp/events?outboundMode=failed
GET /api/whatsapp/farmers/:farmerId/events?outboundMode=failed
```

The returned records stay sanitized and omit raw provider payloads, outbound message text, and recipient phone numbers.

FELDA can inspect detailed chatbot replies through the authenticated dashboard monitoring APIs, not through the public webhook response.

## Manual Send API

Auditor-protected:

```text
POST /api/whatsapp/messages
```

Body:

```json
{
  "toPhone": "60123456789",
  "text": "Reminder text"
}
```

`toPhone` must be an international WhatsApp number, 8 to 15 digits after an optional leading `+`. Spaces, hyphens, and parentheses are accepted in the request and normalized away before sending.

The response returns sanitized send status only. It includes fields such as `mode`, `providerMessageId`, `statusCode`, `error`, and `sentAt`, but it does not echo `toPhone` or message `text`.

## Signature Validation

For production, also configure:

```text
WHATSAPP_APP_SECRET=
```

This enables `X-Hub-Signature-256` validation on inbound webhook POSTs.

## Important Production Note

Free-form WhatsApp messages are generally used inside the customer service window after a farmer contacts the bot. Proactive reminders outside that window should use approved WhatsApp message templates.

## Verification

Run:

```text
npm run smoke:whatsapp-provider-config
npm run smoke:whatsapp-cloud-api-send
npm run smoke:whatsapp-delivery-status
npm run smoke:whatsapp-monitoring-filters
npm run smoke:whatsapp-raw-payload-retention
npm run smoke:readiness
```

These checks prove the service can distinguish local dry-run mode from a live Cloud API sender, rejects common provider configuration mistakes before deployment, and records controlled failed-send results for Cloud API errors and timeouts.
