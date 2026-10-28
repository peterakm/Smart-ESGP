# Smart-ESGP Access Control

This project supports protected dashboard APIs with local role tokens or FELDA/OIDC JWTs verified through JWKS.

## Modes

Local development is open by default:

```text
SMART_ESGP_REQUIRE_AUTH=false
```

Auth becomes active when any of these are true:

- `SMART_ESGP_REQUIRE_AUTH=true`, or
- any role token is configured, or
- `SMART_ESGP_OIDC_ISSUER`, `SMART_ESGP_OIDC_AUDIENCE`, and `SMART_ESGP_OIDC_JWKS_URI` are configured.

## Roles

```text
viewer  -> read dashboard, evidence, WhatsApp monitoring, compliance evaluation
dealer  -> reserved for dealer workflows; currently equivalent to viewer for protected reads
auditor -> can perform protected write/update actions
```

Configured by:

```text
SMART_ESGP_VIEWER_TOKEN=
SMART_ESGP_DEALER_TOKEN=
SMART_ESGP_AUDITOR_TOKEN=
```

Requests use:

```text
Authorization: Bearer <token>
```

or:

```text
x-smart-esgp-token: <token>
```

## Frontend Token

The frontend must not read `VITE_*` API tokens. Vite embeds those values into the browser bundle, so they are not suitable for private credentials.

For development or controlled demos only, the frontend can send a short-lived token from browser local storage:

```text
smartEsgpApiToken
```

Production should use FELDA SSO/OIDC or a server-side session layer. Do not bake long-lived production secrets into a browser bundle.

## FELDA SSO / OIDC

Smart-ESGP can validate bearer JWTs from a FELDA identity provider:

```text
SMART_ESGP_OIDC_ISSUER=
SMART_ESGP_OIDC_AUDIENCE=
SMART_ESGP_OIDC_JWKS_URI=
SMART_ESGP_OIDC_ROLE_CLAIM=roles
SMART_ESGP_OIDC_VIEWER_ROLES=smart-esgp.viewer,smart-esgp.dealer,smart-esgp.auditor
SMART_ESGP_OIDC_DEALER_ROLES=smart-esgp.dealer,smart-esgp.auditor
SMART_ESGP_OIDC_AUDITOR_ROLES=smart-esgp.auditor
```

The JWT must pass issuer, audience, signature, and expiry validation. Smart-ESGP then maps the configured claim values to `viewer`, `dealer`, or `auditor`.

## Protected APIs

Viewer or higher:

- `GET /api/farmers`
- `GET /api/farmers/:farmerId`
- `GET /api/evidence`
- `GET /api/evidence/:evidenceId/media-url`
- `GET /api/evidence/:evidenceId/media`
- `GET /api/consents`
- `GET /api/audit/events`
- `GET /api/certificates`
- `GET /api/compliance/farmers/:farmerId/evaluation`
- `GET /api/whatsapp/events`
- `GET /api/whatsapp/farmers/:farmerId/events`
- `GET /api/whatsapp/sessions`
- `POST /api/chat`

WhatsApp monitoring event reads return sanitized monitoring records for dashboard use. Raw provider webhook payloads stay in backend storage and are not returned by these viewer APIs.

Auditor:

- `PUT /api/farmers/:farmerId`
- `PATCH /api/evidence/:evidenceId/review`
- `POST /api/certificates/issue`

Public or external:

- `GET /api/claude-status`
- `GET /api/auth/status`
- `GET /api/certificates/verify/:verificationHash`

The WhatsApp webhook is public/external on the standalone WhatsApp service, not on the production dashboard. The dashboard can mount the webhook only for local development or explicit demo compatibility:

```text
SMART_ESGP_DASHBOARD_ENABLE_WHATSAPP_WEBHOOK=true
```

Standalone WhatsApp service:

- `GET /health`
- `GET /ready`
- `GET /api/whatsapp/webhook`
- `POST /api/whatsapp/webhook`
- `POST /api/whatsapp/messages`

The standalone WhatsApp service does not expose FELDA dashboard read APIs such as `/api/farmers`, `/api/evidence`, `/api/whatsapp/events`, or `/api/whatsapp/farmers/:farmerId/events`.

Manual WhatsApp sends require auditor-level access. The response returns delivery status only and does not echo the recipient phone number or message body.
The `toPhone` value must be an international number with 8 to 15 digits after optional formatting characters.

In production, keep the dashboard manual WhatsApp send route disabled unless a demo requires it:

```text
SMART_ESGP_DASHBOARD_ENABLE_WHATSAPP_MANUAL_SEND=false
```

Public and high-risk routes have per-source rate limits:

```text
SMART_ESGP_CHAT_RATE_LIMIT_PER_MINUTE=30
SMART_ESGP_CERTIFICATE_VERIFY_RATE_LIMIT_PER_MINUTE=60
SMART_ESGP_WHATSAPP_WEBHOOK_RATE_LIMIT_PER_MINUTE=300
SMART_ESGP_WHATSAPP_MANUAL_SEND_RATE_LIMIT_PER_MINUTE=60
```

## WhatsApp Webhook Signature

For real WhatsApp deployments, configure:

```text
WHATSAPP_APP_SECRET=
```

When set, `POST /api/whatsapp/webhook` requires Meta's `X-Hub-Signature-256` header and validates it against the raw request body.

## Production Next Steps

- Use short-lived server-side sessions or JWTs.
- Add user IDs to audit logs.
- Split dealer and auditor permissions more precisely.
- Require WhatsApp signature validation in production.
- Use `/ready` as the deployment gate before routing production traffic.
