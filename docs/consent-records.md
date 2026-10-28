# Smart-ESGP Consent Records

WhatsApp consent is stored as an independent audit record instead of only being reflected on the farmer profile.

## Flow

```text
farmer chooses language
  -> bot sends consent notice text
  -> farmer replies I AGREE or SAYA SETUJU
  -> consent record is stored against phone number
  -> farmer enters MPOB licence (sent to FELDA as a link request)
  -> FELDA officer approves the link in the dashboard
  -> consent record is linked to farmer ID
```

## API

```text
GET /api/consents?farmerId=f-3
GET /api/consents?phoneNumber=60128880123
```

Required role:

```text
viewer
```

Consent records store:

- consent version
- language
- exact consent notice text
- farmer response text
- WhatsApp provider message ID
- consent timestamp
- linked farmer ID once MPOB matching succeeds

## Audit Events

```text
consent.recorded
consent.linked
```

## Production Direction

Production should store consent records in PostgreSQL and retain the exact notice text shown to the farmer. If the consent wording changes, increment `consentVersion`.
