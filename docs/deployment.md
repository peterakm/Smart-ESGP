# Smart-ESGP Deployment

Smart-ESGP has two production services:

- FELDA dashboard and certification server: `dist/server.mjs`
- WhatsApp chatbot data-collection service: `dist/whatsapp-server.mjs`

Both services should use the same PostgreSQL database. The WhatsApp service stores evidence media in private S3-compatible storage, and the dashboard reads media through authenticated/audited access APIs.

For the Meta webhook setup and go-live checklist, use `docs/whatsapp-deployment-runbook.md`. For local demo acceptance and handoff, use `docs/demo-handoff-checklist.md`.

## Container Images

Build the dashboard image:

```text
docker build -f Dockerfile.dashboard -t smart-esgp-dashboard .
```

Build the WhatsApp chatbot image:

```text
docker build -f Dockerfile.whatsapp -t smart-esgp-whatsapp .
```

## Local Production Rehearsal

Copy the production environment template:

```text
copy .env.production.example .env.production
```

Edit `.env.production` and replace every `replace-with-*` value.

Start the rehearsal stack:

```text
docker compose --env-file .env.production -f docker-compose.production.example.yml up --build
```

The compose stack includes:

- PostgreSQL
- MinIO as S3-compatible private media storage
- Smart-ESGP migration runner for `db/migrations/*.sql`
- dashboard service on port `3000`
- WhatsApp service on port `3100`

Check readiness:

```text
curl http://localhost:3000/ready
curl http://localhost:3100/ready
```

## Production Notes

- Run `npm run smoke:deployment-config` before publishing deployment changes.
- Run `npm run db:migrate` before deploying a new application version.
- Use a managed PostgreSQL service for production.
- Use managed private object storage for production media.
- Keep the dashboard private behind FELDA identity controls.
- Expose only the WhatsApp webhook routes publicly.
- Configure Meta to call `https://<whatsapp-service-host>/api/whatsapp/webhook`.
- Set `WHATSAPP_PHONE_NUMBER_ID` to the numeric Meta phone-number ID, not the public display number.
- Follow `docs/whatsapp-deployment-runbook.md` before routing real farmer messages to the service.
- Set `SMART_ESGP_ALLOWED_ORIGINS` to exact FELDA dashboard origins only when browser cross-origin API access is required.
- Set `SMART_ESGP_TRUST_PROXY=true` only behind a trusted reverse proxy or load balancer.
- Set `SMART_ESGP_FORCE_HTTPS=true` in production so HTTP requests redirect to HTTPS outside localhost.
- Keep `SMART_ESGP_HSTS_MAX_AGE_SECONDS` at `31536000` after confirming every production subdomain is HTTPS-ready.
- Keep `SMART_ESGP_ACCESS_LOGS=true` in production so FELDA support can correlate responses, errors, and service logs through `x-request-id`.
- Tune `SMART_ESGP_*_RATE_LIMIT_PER_MINUTE` values for expected FELDA dashboard traffic and Meta webhook volume.
- Use `/ready` as the load balancer readiness gate for both services.
- Let containers receive `SIGTERM` during rollouts; both Node services close their HTTP listener and repository connection before exiting.
