# Smart-ESGP Demo + Handoff Checklist

Use this checklist when handing the current system to FELDA stakeholders, another engineer, or a deployment operator.

## Local Demo Acceptance

Run these commands from the project root:

```text
npm.cmd run lint
npm.cmd run build
npm.cmd run smoke:migration
npm.cmd run smoke:repository-mode
npm.cmd run smoke:readiness
npm.cmd run smoke:service-boundaries
npm.cmd run smoke:whatsapp-service
npm.cmd run smoke:whatsapp-identity-conflicts
npm.cmd run smoke:farmer-feedback
npm.cmd run smoke:geofence
npm.cmd run smoke:evidence-review
npm.cmd run smoke:certificates
npm.cmd run smoke:deployment-config
```

The demo is acceptable when all commands pass. `smoke:postgres` and `smoke:whatsapp-cloud-api-send` are live-pilot gates and require external credentials.

## Demo Storyline

1. Start the dashboard/certification server and the standalone WhatsApp chatbot service separately.
2. Show that the WhatsApp service accepts Meta-style webhook traffic while the dashboard keeps FELDA-only read/review/certification routes.
3. Complete farmer onboarding: language, consent, MPOB licence, FELDA approval of the new link ("Approve link" in the WhatsApp operations panel), GPS, and photo evidence.
4. Show the evidence entering the FELDA review queue with intake metadata, GPS validation, media metadata, and pending review status.
5. Approve evidence through the FELDA dashboard and confirm certification state changes only after FELDA review.
6. Trigger an MPOB identity conflict and show the session marked for FELDA review instead of being relinked automatically.
7. Show operational alerts for failed sends, delivery status failures, GPS review items, and identity conflicts.

## Production Defaults

- Use `SMART_ESGP_REPOSITORY=postgres` for both services.
- Use private S3-compatible media storage for WhatsApp evidence media.
- Keep `SMART_ESGP_RETAIN_WHATSAPP_RAW_PAYLOADS=false` unless debugging a controlled incident.
- Keep dashboard WhatsApp webhook/manual-send routes disabled in production.
- Keep the standalone WhatsApp service public only for Meta webhook ingress and protected manual sends.
- Use FELDA SSO/OIDC or non-placeholder role tokens for dashboard and auditor actions.

## Live Pilot Gates

Before routing real farmers to the system:

1. Apply all PostgreSQL migrations with `npm.cmd run db:migrate`.
2. Run `npm.cmd run smoke:postgres` with `SMART_ESGP_POSTGRES_SMOKE_DATABASE_URL` set.
3. Configure Meta webhook URL to the standalone WhatsApp service only.
4. Run `npm.cmd run smoke:whatsapp-cloud-api-send` with real WhatsApp Cloud API credentials.
5. Confirm `/ready` returns healthy for both services in the target environment.
6. Confirm FELDA can review identity conflicts, evidence, audit alerts, and certificate status through the dashboard.
