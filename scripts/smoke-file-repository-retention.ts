import assert from 'node:assert/strict';
import type { WhatsAppWebhookEvent } from '../src/contracts/whatsapp';
import { initialFarmers } from '../src/data/mockFarmers';
import { resolveFileRepositoryRetention } from '../src/server/fileRepositoryRetention';
import { createSmartEsgpRepository } from '../src/server/smartEsgpRepository';
import type { EvidenceRecord, SystemAuditEvent } from '../src/types';

const at = (seconds: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, seconds)).toISOString();
const farmer = initialFarmers[0];

const evidenceRecord = (index: number): EvidenceRecord => ({
  id: `retention-evidence-${index}`,
  farmerId: farmer.id,
  source: 'whatsapp',
  evidenceType: 'daily_checkin',
  activityType: 'harvest',
  verificationStatus: 'received',
  phoneNumber: `6012999000${index}`,
  providerMessageId: `retention-evidence-message-${index}`,
  receivedAt: at(index),
  createdAt: at(index),
  summary: `Retention evidence ${index}`,
});

const webhookEvent = (index: number): WhatsAppWebhookEvent => ({
  inbound: {
    provider: 'whatsapp-cloud-api',
    providerMessageId: `retention-whatsapp-${index}`,
    fromPhone: `6012888000${index}`,
    receivedAt: at(index),
    kind: 'text',
    text: `Check-in ${index}`,
    raw: undefined,
  },
  reply: {
    toPhone: `6012888000${index}`,
    text: `Reply ${index}`,
    intent: 'daily_checkin',
    farmerId: farmer.id,
  },
  storedAt: at(index),
});

const auditEvent = (index: number): SystemAuditEvent => ({
  id: `retention-audit-${index}`,
  service: 'whatsapp',
  action: 'retention.test',
  actorType: 'system',
  entityType: 'service',
  severity: 'info',
  message: `Retention audit ${index}`,
  createdAt: at(index),
});

const repository = createSmartEsgpRepository(initialFarmers, {
  retention: {
    evidenceRecordLimit: 2,
    whatsappEventLimit: 2,
    whatsappProviderMessageClaimLimit: 3,
    systemAuditEventLimit: 2,
  },
});

await repository.recordEvidence([evidenceRecord(1), evidenceRecord(2), evidenceRecord(3)]);
assert.deepEqual(
  (await repository.listEvidence(undefined, 10)).map((record) => record.id),
  ['retention-evidence-3', 'retention-evidence-2'],
  'Evidence retention should keep the newest records.'
);

await repository.recordWhatsAppEvents([webhookEvent(1), webhookEvent(2), webhookEvent(3)]);
assert.deepEqual(
  (await repository.listWhatsAppEvents(10)).map((event) => event.inbound.providerMessageId),
  ['retention-whatsapp-3', 'retention-whatsapp-2'],
  'WhatsApp event retention should keep the newest records.'
);

await repository.recordSystemAuditEvents([auditEvent(1), auditEvent(2), auditEvent(3)]);
assert.deepEqual(
  (await repository.listSystemAuditEvents(10)).map((event) => event.id),
  ['retention-audit-3', 'retention-audit-2'],
  'Audit event retention should keep the newest records.'
);

const claimsRepository = createSmartEsgpRepository(initialFarmers, {
  retention: {
    whatsappProviderMessageClaimLimit: 3,
  },
});

for (const index of [1, 2, 3, 4]) {
  await claimsRepository.claimWhatsAppProviderMessageIds([`retention-claim-${index}`], {
    now: at(index),
    claimTtlMs: 5 * 60 * 1000,
  });
}

assert.deepEqual(
  (await claimsRepository.listWhatsAppProviderMessageClaims(10)).map((claim) => claim.providerMessageId),
  ['retention-claim-4', 'retention-claim-3', 'retention-claim-2'],
  'WhatsApp claim retention should prune the oldest claims.'
);

const invalidPolicy = resolveFileRepositoryRetention({
  SMART_ESGP_FILE_WHATSAPP_EVENT_LIMIT: '0',
});
assert.equal(invalidPolicy.ok, false);
assert.match(invalidPolicy.message, /SMART_ESGP_FILE_WHATSAPP_EVENT_LIMIT/);

console.log(JSON.stringify({
  ok: true,
  retainedEvidence: 2,
  retainedWhatsAppEvents: 2,
  retainedAuditEvents: 2,
  retainedClaims: 3,
}, null, 2));
