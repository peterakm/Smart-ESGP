# Smart-ESGP Certificate Registry

Smart-ESGP now treats certificate issuance as a FELDA dashboard/certification action, separate from WhatsApp evidence collection.

## Purpose

The WhatsApp chatbot collects farmer evidence. FELDA reviews evidence and, once rules are satisfied, issues a certificate record through the dashboard server.

The registry stores:

- certificate number
- farmer ID
- status
- issue and expiry timestamps
- issuer
- verification hash
- score and evidence days at issue
- standard version

## API

List certificates:

```text
GET /api/certificates?farmerId=f-1
```

Verify a certificate hash without dashboard credentials:

```text
GET /api/certificates/verify/:verificationHash
```

Issue a certificate:

```text
POST /api/certificates/issue
```

Required role:

```text
auditor
```

Request:

```json
{
  "farmerId": "f-1",
  "issuedBy": "FELDA Certification Officer"
}
```

The issue endpoint is idempotent. If a farmer already has an active issued certificate, the existing record is returned instead of creating a duplicate.

## Audit Events

Issuance appends:

```text
certificate.issued
```

Repeated issuance appends:

```text
certificate.issue.reused
```

Rejected issuance appends:

```text
certificate.issue.rejected
```

Corrective evidence reviews that invalidate an issued certificate append:

```text
certificate.suspended
```

Verification attempts append:

```text
certificate.verify.valid
certificate.verify.invalid
certificate.verify.invalid_request
```

## Production Direction

Production should store certificates in PostgreSQL and keep the hash verification endpoint public but response-limited through `SMART_ESGP_CERTIFICATE_VERIFY_RATE_LIMIT_PER_MINUTE`. It should return certificate validity and public farmer/plot facts only, never WhatsApp phone numbers, evidence records, or internal audit metadata.
