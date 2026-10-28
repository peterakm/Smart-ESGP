# Smart-ESGP System Audit Events

Smart-ESGP records an append-only operational audit stream across the dashboard and WhatsApp services.

## Purpose

Farmer-level audit logs describe certification changes on a single farmer record. System audit events describe service-level operations across the whole platform:

- WhatsApp webhook processing
- WhatsApp inbound message handling
- WhatsApp evidence collection
- manual outbound WhatsApp sends
- FELDA evidence review decisions
- compliance updates and corrections caused by evidence review
- farmer updates through the dashboard API
- certificate issuance, suspension, and duplicate issuance reuse

## API

```text
GET /api/audit/events?limit=50
GET /api/audit/events?service=dashboard&severity=warning&limit=50
GET /api/audit/events?action=evidence.collected&entityType=evidence&limit=50
```

Required role:

```text
viewer
```

The standalone WhatsApp service writes audit events but intentionally does not expose this read API. FELDA reads the audit stream through the dashboard/certification server.

Supported filters:

- `service`: `dashboard` or `whatsapp`
- `severity`: `info`, `warning`, or `error`
- `entityType`: `service`, `farmer`, `evidence`, `certificate`, `whatsapp_message`, or `whatsapp_session`
- `action`: exact audit action name

Responses echo the applied `filters` object so FELDA operators and smoke tests can verify which backend filter was used.

The dashboard uses the unfiltered audit feed for recent history and filtered `severity=warning` / `severity=error` reads for the operational alert strip.

## Data Protection

Audit metadata avoids raw WhatsApp message text and secrets. Farmer WhatsApp numbers are masked:

```text
wa-****0123
```

Production should store these events in an append-only table with reviewer user IDs from FELDA/OIDC tokens.

## Current Event Actions

```text
whatsapp.webhook.processed
whatsapp.webhook.duplicate_ignored
whatsapp.message.received
whatsapp.manual_send
evidence.collected
evidence.review.approved
evidence.review.flagged
evidence.review.rejected
evidence.review.pending
farmer.compliance.updated
farmer.compliance.corrected
farmer.updated
certificate.issued
certificate.suspended
certificate.issue.reused
certificate.issue.rejected
certificate.verify.valid
certificate.verify.invalid
certificate.verify.invalid_request
```
