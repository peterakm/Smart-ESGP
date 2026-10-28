# Smart-ESGP Data Architecture

The current implementation uses a file-backed repository for local development. This gives the dashboard and WhatsApp webhook a shared persistence boundary without requiring a database during early build-out.

## Current Development Store

Default path:

```text
.smart-esgp-data/dev-store.json
```

Override it with:

```text
SMART_ESGP_DATA_FILE=path/to/store.json
```

This file stores:

- `farmers`
- recent `whatsappWebhookEvents`
- `whatsappSessions`
- `evidenceRecords`
- WhatsApp media metadata attached to evidence records
- append-only `systemAuditEvents`
- `certificateRecords`
- append-only `consentRecords`
- `whatsappProviderMessageClaims`

The file is ignored by Git because it may contain personal data such as farmer names, phone numbers, locations, message contents, and evidence metadata.

File mode keeps bounded operational history by default:

```text
SMART_ESGP_FILE_EVIDENCE_RECORD_LIMIT=500
SMART_ESGP_FILE_WHATSAPP_EVENT_LIMIT=100
SMART_ESGP_FILE_WHATSAPP_CLAIM_LIMIT=5000
SMART_ESGP_FILE_AUDIT_EVENT_LIMIT=1000
```

These caps are meant for local development and controlled demos. They prune the oldest in-file evidence records, normalized WhatsApp events, webhook idempotency claims, and system audit events when new records are written. PostgreSQL production deployments should manage long-term retention and deletion with database jobs and FELDA/PDPA policy rather than relying on file-mode caps.

Current repository mode:

```text
SMART_ESGP_REPOSITORY=file
```

`SMART_ESGP_REPOSITORY=postgres` uses the PostgreSQL adapter and requires `DATABASE_URL`.

## Repository Boundary

All server code should access farmer and WhatsApp data through `SmartEsgpRepository`.

Current methods:

- `listFarmers()`
- `getFarmer(farmerId)`
- `hasFarmer(farmerId)`
- `getFarmerIndex()`
- `upsertFarmer(farmer)`
- `recordEvidence(records)`
- `listEvidence(farmerId, limit)`
- `getEvidence(evidenceId)`
- `updateEvidenceReview(evidenceId, review, verificationStatus)`
- `recordSystemAuditEvents(events)`
- `listSystemAuditEvents(limit)`
- `upsertCertificate(certificate)`
- `listCertificates(farmerId, limit)`
- `getActiveCertificateForFarmer(farmerId)`
- `getCertificateByVerificationHash(verificationHash)`
- `recordConsentRecords(records)`
- `listConsentRecords(filters, limit)`
- `linkConsentRecordsToFarmer(phoneNumber, farmerId)`
- `claimWhatsAppProviderMessageIds(providerMessageIds)`
- `recordWhatsAppEvents(events)`
- `listWhatsAppEvents(limit)`
- `getWhatsAppSession(phoneNumber)`
- `getWhatsAppSessionIndex()`
- `upsertWhatsAppSession(session)`

The file and PostgreSQL implementations share this contract so the dashboard and standalone WhatsApp service can run against the same production database.

HTTP list/read APIs clamp caller-provided limits through `SMART_ESGP_API_LIST_LIMIT_MAX` before reaching the repository. Responses include the applied `limit`. PostgreSQL mode also clamps repository limits defensively.

Evidence records expose the latest review as `review` and the immutable decision sequence as `reviewHistory`. File mode stores `reviewHistory` inside each evidence record; PostgreSQL mode writes each decision to `evidence_reviews` and hydrates `reviewHistory` when evidence is read.

WhatsApp evidence also carries an `intake` envelope. This structured metadata records the channel/provider, provider message ID, inbound message kind, language, session step, whether the activity came from an image caption, pending session activity, or default classification, and completeness flags for linked farmer, consent, location, media, and activity. This keeps the chatbot as a data-collection channel while giving FELDA a clear audit trail for what was actually submitted before dashboard review.

WhatsApp evidence stores `location_validation` as structured JSON. It records whether the submitted GPS point is `inside_plot`, `outside_plot`, `unknown_plot`, or `missing_location`, plus the check timestamp, approximate boundary distance when available, and a review reason when the result needs FELDA attention. The dashboard shows this status in the intake queue and evidence register.

Repository evidence reads accept review and GPS filters used by `/api/evidence?review=open` and `/api/evidence?review=open&locationValidationStatus=outside_plot`. File mode filters the stored records in memory; PostgreSQL mode applies SQL predicates against the latest review JSON, verification status fallback, and `location_validation.status`.

WhatsApp provider message claims protect chatbot idempotency before side effects. Unprocessed claims are reclaimable after `SMART_ESGP_WHATSAPP_CLAIM_TTL_SECONDS`; processed claims are final and prevent future retries from sending duplicate replies.

WhatsApp sessions also store identity-link status. During MPOB onboarding, the chatbot blocks a phone from linking to a farmer account that is already linked to another WhatsApp session, and it blocks a phone that is already linked to a different farmer. The session remains unlinked with `identityStatus=conflict` and `identityConflict` details for FELDA review. These conflicts are written to the system audit stream as `whatsapp.identity.conflict`; the chatbot does not approve or override farmer identity by itself.

Both repository implementations expose a lightweight health check used by `/ready`:

- file mode verifies the data file is readable and writable
- PostgreSQL mode runs a `SELECT 1` probe through the active pool

## Production Database Migration

PostgreSQL migrations are available at:

```text
db/migrations/
```

Validate the migration shape with:

```text
npm run smoke:migration
```

Apply them to a PostgreSQL database with:

```text
npm run db:migrate
```

## Production Database Tables

Recommended PostgreSQL schema:

```text
farmers
  id
  name
  mpob_licence
  mspo_cert_id
  plot_location
  plot_area
  score
  days_collected
  last_activity_at
  status
  post_2020_status
  whisp_status
  pdpa_consent
  whatsapp_language
  onboarding_step
  created_at
  updated_at

farmer_contacts
  id
  farmer_id
  channel
  phone_number
  is_primary
  verified_at
  created_at

farm_plots
  id
  farmer_id
  area_ha
  centroid_lat
  centroid_lng
  boundary_geojson
  verification_status
  created_at
  updated_at

whatsapp_messages
  id
  provider
  provider_message_id
  farmer_id
  from_phone
  direction
  kind
  text
  media_id
  mime_type
  location_lat
  location_lng
  received_at
  created_at

whatsapp_sessions
  phone_number
  farmer_id
  step
  language
  consent_version
  consented_at
  pending_location_lat
  pending_location_lng
  created_at
  updated_at
  last_inbound_at

WhatsApp webhook events store the normalized inbound message, generated reply, outbound send result, and session snapshot as JSON. Completed check-in replies may include `reply.feedback` with the farmer-facing status, score, verified evidence-day count, remaining target, review state, risk level, and next action. PostgreSQL also stores the resolved `farmer_id` on each event and indexes `(farmer_id, stored_at DESC)` so FELDA can query one farmer's communication history without scanning the global event feed.

The repository stores normalized WhatsApp webhook events for backend audit and idempotency. Raw Meta message payload retention is controlled by `SMART_ESGP_RETAIN_WHATSAPP_RAW_PAYLOADS`: local development defaults to retaining raw payloads for debugging, while production defaults to stripping them before persistence. Dashboard monitoring APIs return sanitized `WhatsAppMonitoringEvent` records either way; these omit `inbound.raw`, outbound message text, outbound recipient phone number, duplicate `reply.toPhone`, and full session metadata. Completed check-in monitoring replies may include `reply.evidence`, a response-limited summary of the evidence ID, activity, verification/review status, and GPS-to-plot validation outcome.

Meta delivery status callbacks are normalized separately from farmer inbound messages and written to `system_audit_events` as `whatsapp.delivery.status`. These records keep provider message ID, delivery status, masked recipient, conversation ID, pricing category, status timestamp, and sanitized error details. Failed delivery statuses use `severity=error` so FELDA can see them through the operational audit alert feed.

Repository event reads accept a GPS-review filter used by `/api/whatsapp/events?gpsReview=true` and `/api/whatsapp/farmers/:farmerId/events?gpsReview=true`. File mode filters the stored event projection in memory; PostgreSQL mode applies a JSON predicate against `reply.evidence.locationValidation.status` so production dashboards can request only geofence-attention events.

Monitoring reads also accept `outboundMode=sent`, `outboundMode=dry_run`, or `outboundMode=failed`. The FELDA dashboard uses `outboundMode=failed` to load a failed-send operations feed from the backend instead of scanning the general WhatsApp activity list in the browser. PostgreSQL applies this filter through the indexed `outbound_mode` column.

System audit reads accept exact-match filters for service, severity, entity type, and action. PostgreSQL mode applies these as SQL predicates against `system_audit_events`, while file mode applies the same contract in memory for local development.

WhatsApp sessions persist `pending_activity` so the chatbot can remember activity text such as `tuai`, `cantas`, `sembur`, `merumput`, or `inspect` across the multi-message evidence flow. Image captions are also parsed into the normalized inbound text field so a caption can classify the photo directly.

Evidence records persist `intake_metadata` and `location_validation` so dashboard reads and PostgreSQL-backed audits can inspect the submission envelope and intake geofence result without recomputing them.

consent_records
  id
  farmer_id
  phone_number
  consent_version
  language
  consent_text
  response_text
  provider_message_id
  consented_at
  created_at

check_ins
  id
  farmer_id
  whatsapp_message_id
  activity_type
  location_lat
  location_lng
  evidence_file_id
  score_delta
  verification_status
  created_at

evidence_files
  id
  farmer_id
  whatsapp_message_id
  storage_url
  storage_key
  sha256
  mime_type
  size_bytes
  captured_at
  created_at

evidence_reviews
  id
  evidence_id
  reviewed_by
  decision
  notes
  reviewed_at
  created_at

delivery_records
  id
  farmer_id
  delivery_date
  weight_tonnes
  buyer
  receipt_file_id
  created_at

anomalies
  id
  farmer_id
  type
  severity
  description
  probable_cause
  recommended_action
  status
  created_at
  resolved_at

audit_logs
  id
  farmer_id
  action
  user_id
  details
  created_at

system_audit_events
  id
  service
  action
  actor_type
  actor_id
  entity_type
  entity_id
  severity
  message
  metadata_json
  created_at

certificates
  id
  farmer_id
  certificate_number
  status
  issued_at
  expires_at
  verification_hash
  created_at
```

## Compliance Engine Boundary

Compliance rules live in `src/services/complianceEngine.ts`.

The WhatsApp webhook is responsible for:

- parsing provider payloads
- managing conversation state
- creating evidence records
- recording system audit events for inbound messages and collected evidence

The compliance engine is responsible for:

- score deltas
- evidence-day progression
- certificate eligibility status
- yield-to-land anomaly detection
- audit log entries for rule decisions

Current read API:

```text
GET /api/compliance/farmers/:farmerId/evaluation
```

## Migration Path

1. Keep the React dashboard using `/api/farmers` and `PUT /api/farmers/:id`.
2. Keep WhatsApp webhook code using `SmartEsgpRepository`.
3. Apply migrations with `npm run db:migrate`.
4. Set `SMART_ESGP_REPOSITORY=postgres` and `DATABASE_URL` for both deployable services.
5. Use `SMART_ESGP_MEDIA_STORAGE=s3` so media files go to private object storage while PostgreSQL stores only metadata.
6. Keep the local JSON store only for development/demo deployments.

See `docs/whatsapp-media-storage.md` for local and S3-compatible media ingestion modes.

## Data Protection Notes

Treat the store as personal data. It can include phone numbers, GPS coordinates, message text, consent records, and farm photos once media ingestion is added.

Production requirements:

- encrypt secrets and database credentials
- restrict FELDA dashboard access by role
- record consent text and consent version
- record all certification decisions in `audit_logs`
- keep media storage private by default
- create a retention and deletion policy for PostgreSQL rows, media objects, consent records, and audit evidence

See `docs/access-control.md` for the current role-token and FELDA/OIDC protection model.
