# WhatsApp Deployment Runbook

This runbook is for deploying the standalone Smart-ESGP WhatsApp chatbot as the farmer-facing data-collection service while keeping the FELDA dashboard and certification system private.

## Service Boundary

Production should expose two different service surfaces:

- FELDA dashboard/certification server: private, authenticated, used by FELDA operators and auditors.
- WhatsApp chatbot service: public webhook endpoint only, used by Meta WhatsApp callbacks.

Both services must use the same PostgreSQL database so farmer submissions, evidence, consent records, audit events, and certificate state remain visible to FELDA without coupling the public WhatsApp endpoint to dashboard routes.

## Required Meta Values

Collect these values from Meta before deployment:

- WhatsApp webhook verify token: your own secret value configured in both Meta and `WHATSAPP_VERIFY_TOKEN`.
- Meta app secret: configured as `WHATSAPP_APP_SECRET` for `X-Hub-Signature-256` validation.
- WhatsApp Cloud API access token: configured as `WHATSAPP_ACCESS_TOKEN`.
- Numeric phone-number ID: configured as `WHATSAPP_PHONE_NUMBER_ID`.
- Graph API version: configured as `WHATSAPP_GRAPH_API_VERSION`, for example `v23.0`.
- Cloud API request timeout: configured as `WHATSAPP_REQUEST_TIMEOUT_MS`.

`WHATSAPP_PHONE_NUMBER_ID` must be the numeric phone-number ID from WhatsApp Manager. It is not the display phone number farmers see.

## Environment Checklist

Set the shared production posture:

```text
SMART_ESGP_DEPLOYMENT_ENV=production
SMART_ESGP_REPOSITORY=postgres
DATABASE_URL=replace-with-managed-postgres-url
SMART_ESGP_MEDIA_STORAGE=s3
SMART_ESGP_S3_BUCKET=replace-with-private-evidence-bucket
SMART_ESGP_ACCESS_LOGS=true
SMART_ESGP_TRUST_PROXY=true
SMART_ESGP_FORCE_HTTPS=true
SMART_ESGP_HSTS_MAX_AGE_SECONDS=31536000
```

Keep dashboard WhatsApp ingress disabled:

```text
SMART_ESGP_DASHBOARD_ENABLE_WHATSAPP_WEBHOOK=false
SMART_ESGP_DASHBOARD_ENABLE_WHATSAPP_MANUAL_SEND=false
```

Set WhatsApp service secrets:

```text
WHATSAPP_VERIFY_TOKEN=replace-with-meta-webhook-verify-token
WHATSAPP_APP_SECRET=replace-with-meta-app-secret
WHATSAPP_ACCESS_TOKEN=replace-with-meta-access-token
WHATSAPP_PHONE_NUMBER_ID=123456789012345
WHATSAPP_GRAPH_API_VERSION=v23.0
WHATSAPP_REQUEST_TIMEOUT_MS=10000
```

Protect manual outbound sends:

```text
SMART_ESGP_REQUIRE_AUTH=true
SMART_ESGP_AUDITOR_TOKEN=replace-with-auditor-token
```

Tune traffic controls:

```text
SMART_ESGP_WHATSAPP_WEBHOOK_RATE_LIMIT_PER_MINUTE=300
SMART_ESGP_WHATSAPP_MANUAL_SEND_RATE_LIMIT_PER_MINUTE=60
SMART_ESGP_WHATSAPP_CLAIM_TTL_SECONDS=300
SMART_ESGP_WHATSAPP_JSON_BODY_LIMIT=256kb
SMART_ESGP_RETAIN_WHATSAPP_RAW_PAYLOADS=false
```

## Deploy

1. Build the application:

   ```text
   npm.cmd run build
   ```

2. Apply database migrations before routing traffic:

   ```text
   npm.cmd run db:migrate
   ```

3. Start the standalone WhatsApp service:

   ```text
   npm.cmd run start:whatsapp
   ```

4. Confirm readiness:

   ```text
   curl https://<whatsapp-service-host>/ready
   ```

The readiness response must return `200` and `ok: true` before Meta webhook traffic is enabled. A `503` means the service is alive but should not receive production traffic yet.

## Configure Meta Webhook

Use this callback URL:

```text
https://<whatsapp-service-host>/api/whatsapp/webhook
```

Use the same verify token stored in `WHATSAPP_VERIFY_TOKEN`.

Subscribe the app to message and status events for the WhatsApp Business Account. Meta's verification request should return the challenge with HTTP `200`. A wrong verify token should return HTTP `403`.

## Acceptance Test

After Meta accepts the webhook:

1. Send a test WhatsApp message from an allowlisted/test farmer phone number.
2. Confirm the WhatsApp service returns HTTP `200` to Meta.
3. Confirm `/ready` remains `200`.
4. Confirm the FELDA dashboard audit stream shows `whatsapp.webhook.processed`.
5. Confirm the FELDA dashboard audit stream can show `whatsapp.delivery.status` when Meta sends delivery status callbacks.
6. Confirm the dashboard WhatsApp monitoring view shows a sanitized event without raw provider payloads or recipient message text.
7. Submit an evidence image with location metadata where supported.
8. Confirm the FELDA dashboard evidence queue shows the evidence, review status, and GPS validation status.

## Rollback

If the WhatsApp service is unhealthy:

1. Stop routing Meta callbacks to the new deployment.
2. Keep the dashboard service running against the same database.
3. Inspect service logs using `x-request-id`.
4. Check `/ready` for failing checks.
5. Redeploy the previous WhatsApp service version after confirming database migrations are backward compatible for the affected flow.

## Operator Checks

Use these commands before go-live:

```text
npm.cmd run smoke:deployment-config
npm.cmd run smoke:readiness
npm.cmd run smoke:file-retention
npm.cmd run smoke:whatsapp-provider-config
npm.cmd run smoke:whatsapp-cloud-api-send
npm.cmd run smoke:whatsapp-delivery-status
npm.cmd run smoke:whatsapp-monitoring-filters
npm.cmd run smoke:whatsapp-raw-payload-retention
npm.cmd run smoke:whatsapp-identity-conflicts
npm.cmd run smoke:whatsapp-service
npm.cmd run smoke:service-boundaries
```

For a full local production rehearsal with PostgreSQL and MinIO, use `docs/deployment.md`.
