import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import { createRepositoryFromEnv } from '../src/server/repositoryFactory.ts';
import { createCertificateRecord } from '../src/server/certificateRegistry.ts';
import { createSystemAuditEvent } from '../src/server/systemAudit.ts';

const databaseUrl = process.env.SMART_ESGP_POSTGRES_SMOKE_DATABASE_URL;
const useSsl = process.env.SMART_ESGP_POSTGRES_SSL === 'true' || process.env.PGSSLMODE === 'require';
const schema = `smart_esgp_smoke_${Date.now()}`;

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const quoteIdent = (value) => {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new Error(`Unsafe PostgreSQL identifier: ${value}`);
  }
  return `"${value}"`;
};

if (!databaseUrl) {
  console.log(JSON.stringify({
    ok: true,
    skipped: true,
    reason: 'Set SMART_ESGP_POSTGRES_SMOKE_DATABASE_URL to run the live PostgreSQL repository smoke.',
  }, null, 2));
  process.exit(0);
}

const adminPool = new Pool({
  connectionString: databaseUrl,
  ssl: useSsl ? { rejectUnauthorized: false } : undefined,
});

let repository;

try {
  const migration = readdirSync('db/migrations')
    .filter((file) => /^\d+_.+\.sql$/.test(file))
    .sort()
    .map((file) => readFileSync(path.join('db/migrations', file), 'utf8'))
    .join('\n');
  await adminPool.query(`CREATE SCHEMA ${quoteIdent(schema)}`);
  await adminPool.query(`SET search_path TO ${quoteIdent(schema)}, public; ${migration}`);

  repository = await createRepositoryFromEnv({
    SMART_ESGP_REPOSITORY: 'postgres',
    DATABASE_URL: databaseUrl,
    SMART_ESGP_POSTGRES_SSL: useSsl ? 'true' : '',
    SMART_ESGP_POSTGRES_SCHEMA: schema,
  });

  const farmers = await repository.listFarmers();
  assert(farmers.length > 0, 'PostgreSQL repository should seed farmers.');

  const farmer = await repository.getFarmer('f-1');
  assert(farmer?.mpobLicence === '500189', 'Seed farmer f-1 should be readable.');

  await repository.upsertWhatsAppSession({
    phoneNumber: '60129990001',
    farmerId: farmer.id,
    step: 'active',
    language: 'EN',
    consentVersion: 'pdpa-ms-eudr-v1',
    consentedAt: '2026-07-23T00:00:00.000Z',
    createdAt: '2026-07-23T00:00:00.000Z',
    updatedAt: '2026-07-23T00:01:00.000Z',
    lastInboundAt: '2026-07-23T00:01:00.000Z',
    pendingPhoto: {
      providerMessageId: 'wamid-smoke-held-photo',
      mediaId: 'media-smoke-held-photo',
      mimeType: 'image/jpeg',
      receivedAt: '2026-07-23T00:01:00.000Z',
    },
    pendingSurvey: true,
    photoReminderSentAt: '2026-07-23T00:03:00.000Z',
  });

  const sessions = await repository.listWhatsAppSessions();
  const storedSession = sessions.find((session) => session.phoneNumber === '60129990001');
  assert(storedSession, 'WhatsApp session should round-trip.');
  assert(storedSession.pendingPhoto?.mediaId === 'media-smoke-held-photo', 'Held check-in photo should round-trip.');
  assert(storedSession.pendingSurvey === true, 'Pending survey flag should round-trip.');
  assert(storedSession.photoReminderSentAt === '2026-07-23T00:03:00.000Z', 'Photo reminder timestamp should round-trip so reminders send once.');

  const firstClaims = await repository.claimWhatsAppProviderMessageIds([
    'wamid-smoke-claim-postgres',
    'wamid-smoke-claim-postgres',
  ], {
    now: '2026-07-23T00:01:00.000Z',
    claimTtlMs: 1000,
  });
  assert(firstClaims.size === 1 && firstClaims.has('wamid-smoke-claim-postgres'), 'Provider message claim should be acquired once.');
  const duplicateClaims = await repository.claimWhatsAppProviderMessageIds(['wamid-smoke-claim-postgres'], {
    now: '2026-07-23T00:01:00.500Z',
    claimTtlMs: 1000,
  });
  assert(duplicateClaims.size === 0, 'Duplicate provider message claim should not be acquired.');
  await repository.recordWhatsAppProviderMessageDuplicates(['wamid-smoke-claim-postgres']);
  const staleClaims = await repository.claimWhatsAppProviderMessageIds(['wamid-smoke-claim-postgres'], {
    now: '2026-07-23T00:01:01.001Z',
    claimTtlMs: 1000,
  });
  assert(staleClaims.size === 1, 'Expired provider message claim should be reacquired.');
  const existingClaimIds = await repository.getExistingWhatsAppProviderMessageIds(['wamid-smoke-claim-postgres']);
  assert(existingClaimIds.has('wamid-smoke-claim-postgres'), 'Claimed provider message ID should be reported as existing.');
  const providerClaims = await repository.listWhatsAppProviderMessageClaims(10);
  const providerClaim = providerClaims.find((claim) => claim.providerMessageId === 'wamid-smoke-claim-postgres');
  assert(providerClaim?.duplicateCount === 1, 'Provider message claim should track duplicate retries.');

  await repository.recordConsentRecords([{
    id: 'consent-smoke-postgres',
    phoneNumber: '60129990001',
    consentVersion: 'pdpa-ms-eudr-v1',
    language: 'EN',
    consentText: 'Consent notice: Smart-ESGP will collect data for compliance review.',
    responseText: 'I AGREE',
    providerMessageId: 'wamid-smoke-consent-postgres',
    consentedAt: '2026-07-23T00:00:00.000Z',
    createdAt: '2026-07-23T00:00:01.000Z',
  }]);
  const linkedConsents = await repository.linkConsentRecordsToFarmer('60129990001', farmer.id);
  assert(linkedConsents.length === 1 && linkedConsents[0].farmerId === farmer.id, 'Consent should link to farmer.');

  const evidence = {
    id: 'ev-smoke-postgres',
    farmerId: farmer.id,
    source: 'whatsapp',
    evidenceType: 'daily_checkin',
    activityType: 'harvest',
    verificationStatus: 'received',
    phoneNumber: '60129990001',
    providerMessageId: 'wamid-smoke-evidence-postgres',
    mediaId: 'media-smoke-postgres',
    mimeType: 'image/jpeg',
    location: { lat: 2.035, lng: 103.325 },
    receivedAt: '2026-07-23T00:02:00.000Z',
    createdAt: '2026-07-23T00:02:01.000Z',
    summary: 'harvest evidence received with WhatsApp image and GPS.',
    intake: {
      channel: 'whatsapp',
      provider: 'whatsapp-cloud-api',
      providerMessageId: 'wamid-smoke-evidence-postgres',
      receivedMessageKind: 'image',
      language: 'BM',
      sessionStep: 'awaiting_photo',
      activitySource: 'pending_session',
      collectedAt: '2026-07-23T00:02:01.000Z',
      completeness: {
        linkedFarmer: true,
        hasConsent: true,
        hasLocation: true,
        hasMedia: true,
        hasActivity: true,
      },
    },
    locationValidation: {
      status: 'inside_plot',
      checkedAt: '2026-07-23T00:02:01.000Z',
      distanceMeters: 0,
    },
    review: { status: 'pending' },
  };
  await repository.recordEvidence([evidence]);
  const reviewedEvidence = await repository.updateEvidenceReview(evidence.id, {
    status: 'approved',
    reviewedBy: 'Postgres Smoke',
    reviewedAt: '2026-07-23T00:03:00.000Z',
  }, 'verified');
  assert(reviewedEvidence?.verificationStatus === 'verified', 'Evidence review should update.');
  assert(reviewedEvidence?.intake?.channel === 'whatsapp', 'Evidence intake metadata should persist.');
  assert(reviewedEvidence?.intake?.completeness?.hasLocation === true, 'Evidence intake completeness should persist.');
  assert(reviewedEvidence?.locationValidation?.status === 'inside_plot', 'Evidence location validation should persist.');
  assert(reviewedEvidence?.reviewHistory?.length === 2, 'Evidence review history should include pending and approved entries.');
  assert(
    reviewedEvidence.reviewHistory.map((review) => review.status).join(',') === 'pending,approved',
    'Evidence review history should preserve decision order.'
  );
  const outsideEvidence = {
    ...evidence,
    id: 'ev-smoke-outside-postgres',
    providerMessageId: 'wamid-smoke-outside-evidence-postgres',
    verificationStatus: 'needs_review',
    location: { lat: 2.5, lng: 103.9 },
    summary: 'harvest evidence received outside the registered plot.',
    locationValidation: {
      status: 'outside_plot',
      checkedAt: '2026-07-23T00:05:01.000Z',
      distanceMeters: 120,
      reason: 'Outside registered plot.',
    },
    review: {
      status: 'pending',
      notes: 'Outside registered plot.',
    },
  };
  await repository.recordEvidence([outsideEvidence]);
  const openOutsideEvidence = await repository.listEvidence(undefined, 10, {
    review: 'open',
    locationValidationStatus: 'outside_plot',
  });
  assert(
    openOutsideEvidence.some((record) => record.id === outsideEvidence.id),
    'Evidence open/outside-plot filter should include outside-plot pending evidence.'
  );
  assert(
    openOutsideEvidence.every((record) => record.locationValidation?.status === 'outside_plot'),
    'Evidence locationValidationStatus filter should not include other GPS statuses.'
  );

  await repository.recordWhatsAppEvents([{
    inbound: {
      provider: 'whatsapp-cloud-api',
      providerMessageId: 'wamid-smoke-event-postgres',
      fromPhone: '60129990001',
      receivedAt: '2026-07-23T00:04:00.000Z',
      kind: 'text',
      text: 'hello',
      raw: { smoke: true },
    },
    reply: {
      toPhone: '60129990001',
      text: 'hello',
      intent: 'onboarding',
      sessionStep: 'active',
      farmerId: farmer.id,
    },
    session: sessions[0],
    storedAt: '2026-07-23T00:04:01.000Z',
  }]);
  assert((await repository.listWhatsAppEvents(10)).length > 0, 'WhatsApp event should be readable.');
  await repository.recordWhatsAppEvents([{
    inbound: {
      provider: 'whatsapp-cloud-api',
      providerMessageId: 'wamid-smoke-gps-review-postgres',
      fromPhone: '60129990001',
      receivedAt: '2026-07-23T00:04:10.000Z',
      kind: 'image',
      mediaId: 'media-smoke-gps-review-postgres',
      raw: { smoke: true },
    },
    reply: {
      toPhone: '60129990001',
      text: 'GPS review required.',
      intent: 'daily_checkin',
      farmerId: farmer.id,
      requiresHumanReview: true,
      evidence: {
        evidenceId: 'ev-smoke-gps-review-postgres',
        activityType: 'harvest',
        verificationStatus: 'needs_review',
        reviewStatus: 'pending',
        locationValidation: {
          status: 'outside_plot',
          checkedAt: '2026-07-23T00:04:10.000Z',
          distanceMeters: 120,
          reason: 'Outside plot.',
        },
      },
    },
    session: sessions[0],
    storedAt: '2026-07-23T00:04:11.000Z',
  }, {
    inbound: {
      provider: 'whatsapp-cloud-api',
      providerMessageId: 'wamid-smoke-failed-send-postgres',
      fromPhone: '60129990001',
      receivedAt: '2026-07-23T00:04:20.000Z',
      kind: 'text',
      text: 'BM',
      raw: { smoke: true },
    },
    reply: {
      toPhone: '60129990001',
      text: 'Failed send smoke.',
      intent: 'onboarding',
      farmerId: farmer.id,
    },
    outbound: {
      toPhone: '60129990001',
      text: 'Failed send smoke.',
      mode: 'failed',
      statusCode: 503,
      error: 'Meta temporary failure',
      sentAt: '2026-07-23T00:04:21.000Z',
    },
    session: sessions[0],
    storedAt: '2026-07-23T00:04:21.000Z',
  }]);
  const gpsReviewEvents = await repository.listWhatsAppEvents(10, { gpsReview: true });
  assert(
    gpsReviewEvents.some((event) => event.inbound.providerMessageId === 'wamid-smoke-gps-review-postgres'),
    'WhatsApp GPS-review event filter should include outside-plot events.'
  );
  assert(
    gpsReviewEvents.every((event) => event.reply.evidence?.locationValidation?.status !== 'inside_plot'),
    'WhatsApp GPS-review event filter should not include inside-plot events.'
  );
  assert(
    (await repository.listWhatsAppEventsForFarmer(farmer.id, 10, { gpsReview: true }))
      .some((event) => event.inbound.providerMessageId === 'wamid-smoke-gps-review-postgres'),
    'Farmer-scoped GPS-review event filter should include outside-plot events.'
  );
  assert(
    (await repository.listWhatsAppEvents(10, { outboundMode: 'failed' }))
      .some((event) => event.inbound.providerMessageId === 'wamid-smoke-failed-send-postgres'),
    'WhatsApp outboundMode=failed filter should include failed sends.'
  );
  assert(
    (await repository.listWhatsAppEvents(10, { outboundMode: 'failed' }))
      .every((event) => event.outbound?.mode === 'failed'),
    'WhatsApp outboundMode=failed filter should not include other outbound modes.'
  );
  assert(
    (await repository.listWhatsAppEventsForFarmer(farmer.id, 10, { outboundMode: 'failed' }))
      .some((event) => event.inbound.providerMessageId === 'wamid-smoke-failed-send-postgres'),
    'Farmer-scoped outboundMode=failed filter should include failed sends.'
  );
  assert(
    (await repository.listWhatsAppEventsForFarmer(farmer.id, 10))
      .some((event) => event.inbound.providerMessageId === 'wamid-smoke-event-postgres'),
    'Farmer-scoped WhatsApp event should be readable.'
  );
  assert(
    !(await repository.listWhatsAppEventsForFarmer('unrelated-farmer', 10))
      .some((event) => event.inbound.providerMessageId === 'wamid-smoke-event-postgres'),
    'Farmer-scoped WhatsApp event should not leak to unrelated farmers.'
  );

  await repository.recordSystemAuditEvents([createSystemAuditEvent({
    service: 'dashboard',
    action: 'postgres.smoke',
    actorType: 'system',
    entityType: 'service',
    severity: 'info',
    message: 'PostgreSQL repository smoke completed a write/read cycle.',
  })]);
  assert((await repository.listSystemAuditEvents(10)).some((event) => event.action === 'postgres.smoke'), 'Audit event should round-trip.');
  assert(
    (await repository.listSystemAuditEvents(10, { action: 'postgres.smoke', service: 'dashboard' }))
      .every((event) => event.action === 'postgres.smoke' && event.service === 'dashboard'),
    'Filtered audit events should match action and service.'
  );

  const certificate = await repository.upsertCertificate(createCertificateRecord(farmer, 'Postgres Smoke'));
  const verifiedCertificate = await repository.getCertificateByVerificationHash(certificate.verificationHash);
  assert(verifiedCertificate?.id === certificate.id, 'Certificate should verify by hash.');

  console.log(JSON.stringify({
    ok: true,
    schema,
    farmers: farmers.length,
    providerClaims: firstClaims.size + staleClaims.size,
    evidenceId: reviewedEvidence.id,
    reviewHistory: reviewedEvidence.reviewHistory.map((review) => review.status),
    certificateNumber: certificate.certificateNumber,
  }, null, 2));
} finally {
  if (repository?.close) {
    await repository.close();
  }
  await adminPool.query(`DROP SCHEMA IF EXISTS ${quoteIdent(schema)} CASCADE`);
  await adminPool.end();
}
