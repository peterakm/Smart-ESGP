# Smart-ESGP Production Readiness

Smart-ESGP now has explicit readiness checks for the FELDA dashboard server and the standalone WhatsApp chatbot service.

Container and compose deployment instructions live in `docs/deployment.md`.

## Endpoints

```text
GET /health
GET /ready
```

`/health` is a lightweight liveness check.

`/ready` returns:

```text
200 -> service is ready
503 -> service is alive but not ready for production traffic
```

## Production Mode

Readiness uses production rules when either value is set:

```text
NODE_ENV=production
SMART_ESGP_DEPLOYMENT_ENV=production
```

## Dashboard Requirements

The FELDA dashboard/certification server requires:

- valid `SMART_ESGP_REPOSITORY` mode
- `DATABASE_URL` when `SMART_ESGP_REPOSITORY=postgres`, or `SMART_ESGP_DATA_FILE` when using file mode
- valid file repository retention limits when using file mode
- live repository connectivity
- HTTPS redirect and HSTS policy configured for production traffic
- dashboard authentication enabled
- non-placeholder auditor-level credential or FELDA/OIDC role-claim integration
- no browser-bundled API token
- WhatsApp webhook and manual send routes left disabled unless this is a controlled demo deployment

Recommended environment:

```text
SMART_ESGP_DEPLOYMENT_ENV=production
SMART_ESGP_ALLOWED_ORIGINS=https://dashboard.smart-esgp.example
SMART_ESGP_TRUST_PROXY=true
SMART_ESGP_FORCE_HTTPS=true
SMART_ESGP_HSTS_MAX_AGE_SECONDS=31536000
SMART_ESGP_ACCESS_LOGS=true
SMART_ESGP_CHAT_RATE_LIMIT_PER_MINUTE=30
SMART_ESGP_CERTIFICATE_VERIFY_RATE_LIMIT_PER_MINUTE=60
SMART_ESGP_REPOSITORY=postgres
DATABASE_URL=replace-with-managed-postgres-url
SMART_ESGP_REQUIRE_AUTH=true
SMART_ESGP_AUDITOR_TOKEN=replace-with-secret
SMART_ESGP_DASHBOARD_ENABLE_WHATSAPP_WEBHOOK=false
SMART_ESGP_DASHBOARD_ENABLE_WHATSAPP_MANUAL_SEND=false
```

For FELDA SSO/JWT access instead of static role tokens:

```text
SMART_ESGP_OIDC_ISSUER=https://identity.felda.example
SMART_ESGP_OIDC_AUDIENCE=smart-esgp-dashboard
SMART_ESGP_OIDC_JWKS_URI=https://identity.felda.example/.well-known/jwks.json
SMART_ESGP_OIDC_ROLE_CLAIM=roles
SMART_ESGP_OIDC_AUDITOR_ROLES=smart-esgp.auditor
```

For a managed database that requires TLS:

```text
SMART_ESGP_POSTGRES_SSL=true
```

File mode remains useful for local demos, but production should use PostgreSQL so the WhatsApp chatbot and dashboard share the same source of truth.

## WhatsApp Service Requirements

The standalone WhatsApp chatbot service requires:

- valid `SMART_ESGP_REPOSITORY` mode
- `DATABASE_URL` when `SMART_ESGP_REPOSITORY=postgres`, or `SMART_ESGP_DATA_FILE` when using file mode
- valid file repository retention limits when using file mode
- live repository connectivity
- HTTPS redirect and HSTS policy configured for production traffic
- `SMART_ESGP_MEDIA_STORAGE`
- `SMART_ESGP_S3_BUCKET` when `SMART_ESGP_MEDIA_STORAGE=s3`, or `SMART_ESGP_MEDIA_DIR` when using local media mode
- non-placeholder `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` when using an S3-compatible endpoint such as MinIO
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_APP_SECRET`
- `WHATSAPP_ACCESS_TOKEN`
- numeric `WHATSAPP_PHONE_NUMBER_ID` from Meta WhatsApp Manager
- valid `WHATSAPP_GRAPH_API_VERSION`, for example `v23.0`
- valid `WHATSAPP_REQUEST_TIMEOUT_MS` between 1000 and 60000 milliseconds
- explicit `SMART_ESGP_RETAIN_WHATSAPP_RAW_PAYLOADS=false` unless raw Meta payloads are needed for controlled incident debugging
- valid `SMART_ESGP_WHATSAPP_CLAIM_TTL_SECONDS` between 30 and 3600 seconds
- non-placeholder auditor-level credential for manual outbound sends

Production readiness rejects obvious placeholder secret values such as `change-me-*`, `replace-with-*`, and `placeholder`.

Recommended environment:

```text
SMART_ESGP_DEPLOYMENT_ENV=production
SMART_ESGP_ALLOWED_ORIGINS=https://dashboard.smart-esgp.example
SMART_ESGP_TRUST_PROXY=true
SMART_ESGP_FORCE_HTTPS=true
SMART_ESGP_HSTS_MAX_AGE_SECONDS=31536000
SMART_ESGP_ACCESS_LOGS=true
SMART_ESGP_WHATSAPP_WEBHOOK_RATE_LIMIT_PER_MINUTE=300
SMART_ESGP_WHATSAPP_MANUAL_SEND_RATE_LIMIT_PER_MINUTE=60
SMART_ESGP_WHATSAPP_CLAIM_TTL_SECONDS=300
SMART_ESGP_RETAIN_WHATSAPP_RAW_PAYLOADS=false
SMART_ESGP_REPOSITORY=postgres
DATABASE_URL=replace-with-managed-postgres-url
SMART_ESGP_MEDIA_STORAGE=s3
SMART_ESGP_S3_BUCKET=smart-esgp-private-evidence
SMART_ESGP_S3_REGION=ap-southeast-1
SMART_ESGP_S3_ENDPOINT=https://object-storage.example
AWS_ACCESS_KEY_ID=replace-with-object-storage-access-key
AWS_SECRET_ACCESS_KEY=replace-with-object-storage-secret-key
WHATSAPP_VERIFY_TOKEN=replace-with-secret
WHATSAPP_APP_SECRET=replace-with-secret
WHATSAPP_ACCESS_TOKEN=replace-with-secret
WHATSAPP_PHONE_NUMBER_ID=123456789012345
WHATSAPP_GRAPH_API_VERSION=v23.0
WHATSAPP_REQUEST_TIMEOUT_MS=10000
SMART_ESGP_AUDITOR_TOKEN=replace-with-secret
```

Use the same managed database for both services so WhatsApp evidence, consent records, audit events, and certificates appear in the FELDA dashboard.

For local/demo media storage instead of S3:

```text
SMART_ESGP_MEDIA_STORAGE=local-filesystem
SMART_ESGP_MEDIA_DIR=/secure/path/media
```

## Verification

Run:

```text
npm run smoke:api-errors
```

This proves malformed JSON and async API failures return controlled JSON errors on both services.
It also proves error responses include an `x-request-id` correlation value.

Run:

```text
npm run smoke:evidence-correction
```

This proves a mistaken evidence approval can be corrected, farmer compliance is reduced, and an issued certificate is suspended when the correction removes eligibility.

Run:

```text
npm run smoke:oidc-auth
```

This proves FELDA/OIDC JWT verification and role enforcement using a local JWKS issuer.

Run:

```text
npm run smoke:migration-runner
```

This validates the migration runner safeguards used by `npm run db:migrate`.

Run:

```text
npm run smoke:deployment-config
```

This validates the separate Dockerfiles, compose rehearsal stack, and production environment template.

Run:

```text
npm run smoke:graceful-shutdown
```

This proves both compiled service entrypoints handle `SIGTERM` cleanly for container rollouts.

Run:

```text
npm run smoke:readiness
```

This proves that misconfigured production services return `503`, a configured WhatsApp service returns `200`, and common Meta provider mistakes such as using a display phone number instead of the numeric phone-number ID are rejected.
It also checks `repository-connectivity`, which verifies the active repository can respond independently from static environment validation.

Run:

```text
npm run smoke:file-retention
```

This proves the file-backed repository prunes old evidence, normalized WhatsApp events, webhook message claims, and system audit events according to configured retention caps.

Run:

```text
npm run smoke:whatsapp-provider-config
```

This proves the WhatsApp Cloud API config summary reports deliberate local dry-run mode, live sender mode, invalid phone-number IDs, and invalid Graph API version strings.

Run:

```text
npm run smoke:whatsapp-cloud-api-send
```

This proves Cloud API success, non-JSON provider failures, network errors, and request timeouts return controlled send results.

Run:

```text
npm run smoke:whatsapp-delivery-status
```

This proves Meta delivery status callbacks are accepted through the signed WhatsApp webhook and recorded as sanitized audit events, with failed statuses visible as operational errors.

Run:

```text
npm run smoke:service-boundaries
```

This proves the production dashboard does not expose WhatsApp webhook/manual send routes while the standalone WhatsApp service does not expose FELDA dashboard routes.

Run:

```text
npm run smoke:whatsapp-monitoring-filters
```

This proves FELDA monitoring APIs can load failed outbound sends and other send-mode-specific WhatsApp events without exposing raw provider payloads or outbound message bodies.

Run:

```text
npm run smoke:whatsapp-raw-payload-retention
```

This proves raw Meta message payloads can be retained for local debugging or stripped before persistence for production privacy.

Run:

```text
npm run smoke:whatsapp-identity-conflicts
```

This proves one MPOB licence cannot be silently linked to multiple WhatsApp numbers. Conflicted sessions stay unlinked, require FELDA review, and write `whatsapp.identity.conflict` warnings to the audit stream.

An MPOB licence number alone never links a WhatsApp number. Every new link is a `first_link_review` request that a FELDA officer must approve, and the bot reply does not reveal whose licence was entered. After five wrong licence numbers a phone is locked out of licence entry for 30 minutes. `npm run smoke:whatsapp-identity-conflict-resolution` covers first-link approval, the pending-request lock, the lockout, and refusal to approve a second phone for an already-linked farmer.

Run:

```text
npm run smoke:security-baseline
```

This proves both service entrypoints remove Express fingerprinting, set baseline security headers, enforce configured HTTPS redirects/HSTS, and only allow configured exact CORS origins.

Run:

```text
npm run smoke:rate-limits
```

This proves public certificate verification, WhatsApp webhook ingress, and manual WhatsApp sends return controlled `429` responses when their configured limits are exceeded.

## Request Body Limits

Set JSON body limits for both deployable services:

```text
SMART_ESGP_JSON_BODY_LIMIT=256kb
SMART_ESGP_DASHBOARD_JSON_BODY_LIMIT=256kb
SMART_ESGP_WHATSAPP_JSON_BODY_LIMIT=256kb
```

The service-specific values override the shared default. Oversized JSON requests return a controlled `413` JSON error with the request ID, which is verified by:

```text
npm run smoke:api-errors
```

## List Response Limits

Set a maximum applied limit for dashboard list/read APIs:

```text
SMART_ESGP_API_LIST_LIMIT_MAX=100
```

This caps routes such as evidence, audit events, certificates, consent records, and WhatsApp monitoring even when the caller passes a very large `?limit=` value. The cap is verified by:

```text
npm run smoke:list-limits
```

Run:

```text
npm run smoke:repository-mode
```

This proves repository mode selection fails clearly for unsupported modes and missing PostgreSQL configuration.

When a disposable PostgreSQL database is available, also run:

```text
$env:SMART_ESGP_POSTGRES_SMOKE_DATABASE_URL="postgres://user:password@host:5432/db"
npm run smoke:postgres
```

This validates the live PostgreSQL adapter against a temporary schema and drops that schema after the test.

Run:

```text
npm run smoke:media-access
```

This proves protected evidence media access for both local filesystem evidence and S3 presigned evidence URLs.
