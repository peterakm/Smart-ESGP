# WhatsApp Media Storage

Smart-ESGP stores WhatsApp photo evidence as private audit material. The dashboard reads metadata from the evidence register, while the actual file remains in server-side storage.

## Current Flow

When a farmer sends an image after sharing farm GPS:

1. The WhatsApp webhook records the image `mediaId`.
2. The server retrieves the temporary media download URL from Meta Graph API.
3. The server downloads the binary media with the same WhatsApp access token.
4. The file is written to the configured media store.
5. The evidence record stores audit metadata:
   - `storageKey`
   - `storageUrl` when object storage is used
   - `contentType`
   - `sizeBytes`
   - `sha256`
   - `providerSha256`
   - `storedAt`
   - `mode`

## Local Mode

Local filesystem storage is the default for development and demos:

```text
SMART_ESGP_MEDIA_STORAGE=local-filesystem
SMART_ESGP_MEDIA_DIR=.smart-esgp-media
```

Default local directory:

```text
.smart-esgp-media
```

The directory is ignored by Git because it can contain farm photos and GPS-linked compliance evidence.

## S3-Compatible Object Storage

Production can store evidence media in private S3-compatible object storage:

```text
SMART_ESGP_MEDIA_STORAGE=s3
SMART_ESGP_S3_BUCKET=smart-esgp-private-evidence
SMART_ESGP_S3_REGION=ap-southeast-1
```

Optional settings:

```text
SMART_ESGP_S3_ENDPOINT=
SMART_ESGP_S3_FORCE_PATH_STYLE=true
```

Credentials are resolved by the AWS SDK environment/role chain, for example:

```text
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_SESSION_TOKEN=
```

When `SMART_ESGP_S3_ENDPOINT` is configured for S3-compatible storage such as MinIO, production readiness requires non-placeholder `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`. Cloud deployments without a custom endpoint may use the platform IAM role/provider chain instead.

The evidence metadata records a private URI like:

```text
s3://smart-esgp-private-evidence/f-1/wamid-example.jpg
```

## FELDA Media Review Access

The FELDA dashboard does not expose raw bucket paths or local filesystem paths. It uses protected APIs:

```text
GET /api/evidence/:evidenceId/media-url
GET /api/evidence/:evidenceId/media
```

`/media-url` requires at least the `viewer` role.

For S3 evidence, it returns a short-lived presigned URL:

```text
accessMode=direct_url
```

For local filesystem evidence, it returns a protected dashboard API URL:

```text
accessMode=authenticated_fetch
```

The React dashboard then fetches the media with the same authenticated API session and opens a browser blob URL. Each media access request is recorded as a system audit event:

```text
evidence.media_access.requested
```

## Dry-Run Mode

If `WHATSAPP_ACCESS_TOKEN` or `WHATSAPP_PHONE_NUMBER_ID` is missing, media ingestion returns:

```text
mode=dry_run
```

This keeps local tests and demos working without calling Meta or storing farmer media.

## Production Requirements

- keep bucket/container access private
- encrypt objects at rest
- configure non-placeholder object-storage credentials for S3-compatible endpoints
- store only metadata in PostgreSQL
- generate short-lived signed URLs only for authorized FELDA/auditor review
- retain `sha256` for audit integrity checks
- implement retention/deletion rules aligned with consent and PDPA policy

## Meta API Notes

Meta's WhatsApp media flow is two-step: retrieve the media URL by media ID, then download the media binary from that URL using bearer-token authorization. Media URLs are temporary, so Smart-ESGP ingests them during webhook processing.
