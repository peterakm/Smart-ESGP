# Smart-ESGP PostgreSQL Migration

Smart-ESGP uses the file-backed repository for local development and a PostgreSQL repository adapter for production deployments where both services must share the same data.

## Migration File

```text
db/migrations/
```

It creates tables for:

- farmers
- WhatsApp sessions and webhook events
- WhatsApp provider message claims for retry idempotency
- evidence records, WhatsApp intake metadata, GPS location-validation results, and reviews
- system audit events
- certificate records
- consent records
- media file metadata

## Validate Migration Shape

Run:

```text
npm run smoke:migration
```

This checks that the migration includes the core tables, columns, and indexes required by the current repository contract.

The WhatsApp provider message claim table lets the chatbot claim a Meta message ID before sending replies or writing evidence, tracks retry duplicates, expires unprocessed claims after `SMART_ESGP_WHATSAPP_CLAIM_TTL_SECONDS`, and the webhook event table keeps a unique provider message ID index as a second enforcement layer.

Run:

```text
npm run smoke:migration-runner
```

This validates that the migration runner includes the production safeguards: explicit database URL, schema validation, advisory lock, checksum table, and rollback behavior.

## Live Repository Smoke

To prove the PostgreSQL adapter works against a real database, run the optional live smoke against a disposable database or a database where the user can create/drop schemas:

```text
SMART_ESGP_POSTGRES_SMOKE_DATABASE_URL=postgres://user:password@host:5432/db npm run smoke:postgres
```

On PowerShell:

```text
$env:SMART_ESGP_POSTGRES_SMOKE_DATABASE_URL="postgres://user:password@host:5432/db"
npm run smoke:postgres
```

The smoke creates a temporary schema named `smart_esgp_smoke_<timestamp>`, applies all SQL files in `db/migrations/`, starts the same PostgreSQL repository adapter used by the services, verifies farmers, WhatsApp provider message claims, WhatsApp sessions, consent records, immutable evidence review history, WhatsApp events, audit events, and certificate verification, then drops only that temporary schema.

If the managed database requires TLS:

```text
SMART_ESGP_POSTGRES_SSL=true
```

## Apply Migration

For a PostgreSQL database, use the Smart-ESGP migration runner:

```text
DATABASE_URL=postgres://user:password@host:5432/db npm run db:migrate
```

On PowerShell:

```text
$env:DATABASE_URL="postgres://user:password@host:5432/db"
npm run db:migrate
```

The runner creates `smart_esgp_schema_migrations`, applies migration files in filename order, records SHA-256 checksums, and refuses to continue if an already-applied migration file changes.

To apply migrations into a named schema:

```text
SMART_ESGP_POSTGRES_SCHEMA=smart_esgp_prod
```

## Repository Adapter

`SMART_ESGP_REPOSITORY=postgres` starts the PostgreSQL implementation of `SmartEsgpRepository`. It supports the same method names as the file-backed repository:

```text
listFarmers
getFarmer
hasFarmer
getFarmerIndex
upsertFarmer
recordEvidence
listEvidence
getEvidence
updateEvidenceReview
recordSystemAuditEvents
listSystemAuditEvents
upsertCertificate
listCertificates
getCertificateByVerificationHash
recordConsentRecords
listConsentRecords
linkConsentRecordsToFarmer
claimWhatsAppProviderMessageIds
recordWhatsAppEvents
listWhatsAppEvents
getWhatsAppSession
getWhatsAppSessionIndex
upsertWhatsAppSession
```

Both deployable services should use the same managed database:

```text
DATABASE_URL=
SMART_ESGP_REPOSITORY=postgres
```

Use `SMART_ESGP_POSTGRES_SSL=true` or `PGSSLMODE=require` when the managed database requires TLS.

To isolate a deployment in a named schema:

```text
SMART_ESGP_POSTGRES_SCHEMA=smart_esgp_prod
```

## Runtime Guard

`SMART_ESGP_REPOSITORY` is now explicit:

```text
SMART_ESGP_REPOSITORY=file
SMART_ESGP_REPOSITORY=postgres
```

Current runtime behavior:

- `file` starts the local file-backed repository.
- `postgres` starts the PostgreSQL repository and requires `DATABASE_URL`.
- any other value fails as unsupported.

Validate this behavior with:

```text
npm run smoke:repository-mode
```

This prevents a production deployment from silently using the wrong repository mode after someone configures PostgreSQL settings.
