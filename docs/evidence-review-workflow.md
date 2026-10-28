# FELDA Evidence Review Workflow

WhatsApp is the farmer collection channel. FELDA remains the review and certification authority.

## Current Flow

```text
Farmer sends WhatsApp location + photo
  -> webhook normalizes the message
  -> media metadata is attached
  -> GPS is checked against the registered plot polygon
  -> inside-plot evidence is saved as received
  -> outside/unknown/missing GPS evidence is saved as needs_review
  -> FELDA dashboard review queue opens the item
  -> auditor approves, flags, or rejects it
  -> approved evidence becomes verified
  -> compliance engine updates farmer score and certification progress
```

## Review Decisions

```text
approved -> verificationStatus=verified
pending  -> verificationStatus=received
flagged  -> verificationStatus=needs_review
rejected -> verificationStatus=needs_review
```

Only `verified` evidence is counted by the compliance engine.

During intake, Smart-ESGP stores `evidence.locationValidation`. `inside_plot` submissions still require FELDA approval before they count toward certification. `outside_plot`, `unknown_plot`, and `missing_location` submissions are triaged as `needs_review` with a review note so auditors can inspect the media and farmer context before deciding.

## API

```text
GET /api/evidence?review=open
GET /api/evidence?review=open&locationValidationStatus=outside_plot
PATCH /api/evidence/:evidenceId/review
```

Required role:

```text
viewer for list/read, auditor for review decisions
```

`review=open` returns evidence whose current review state is `pending` or `flagged`. `locationValidationStatus` can narrow the queue to one GPS validation outcome: `inside_plot`, `outside_plot`, `unknown_plot`, or `missing_location`.

Request body:

```json
{
  "decision": "approved",
  "notes": "GPS and image match expected farm activity.",
  "reviewedBy": "FELDA Dashboard Auditor"
}
```

Response body:

```json
{
  "evidence": {},
  "farmer": {}
}
```

The `farmer` field is returned when approval changes certification progress.

The response keeps the latest decision in `evidence.review` and the full decision sequence in `evidence.reviewHistory`.

Every review decision also appends a system audit event:

```text
evidence.review.approved
evidence.review.flagged
evidence.review.rejected
evidence.review.pending
```

Approvals that update the farmer's compliance state also append:

```text
farmer.compliance.updated
```

If an approved evidence item is later rejected, flagged, or moved back to pending, Smart-ESGP applies a corrective compliance delta and appends:

```text
farmer.compliance.corrected
```

If that correction means a farmer no longer qualifies for an active issued certificate, the active certificate is suspended and Smart-ESGP appends:

```text
certificate.suspended
```

## Production Notes

The current implementation supports corrective review decisions for accidental approvals. Production should still add:

- reviewer user IDs from FELDA/OIDC tokens
- protected `GET /api/evidence/:evidenceId/media-url` access for private media inspection
- plot-boundary checks before approval
- duplicate-media hash detection
