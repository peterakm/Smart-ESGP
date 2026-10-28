import { initialFarmers } from '../src/data/mockFarmers';
import { createSmartEsgpRepository } from '../src/server/smartEsgpRepository';

const assert = (condition: unknown, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};

const repository = createSmartEsgpRepository(initialFarmers);
const providerMessageId = 'lease-wa-1';
const firstClaimAt = '2026-07-24T00:00:00.000Z';
const beforeExpiry = '2026-07-24T00:00:00.500Z';
const afterExpiry = '2026-07-24T00:00:01.001Z';
const afterProcessed = '2026-07-24T00:00:02.000Z';

const firstClaim = await repository.claimWhatsAppProviderMessageIds([providerMessageId], {
  now: firstClaimAt,
  claimTtlMs: 1000,
});
assert(firstClaim.size === 1, 'Expected first provider message claim to be acquired.');

const immediateRetry = await repository.claimWhatsAppProviderMessageIds([providerMessageId], {
  now: beforeExpiry,
  claimTtlMs: 1000,
});
assert(immediateRetry.size === 0, 'Expected retry before claim expiry not to acquire the claim.');
await repository.recordWhatsAppProviderMessageDuplicates([providerMessageId]);

const staleRetry = await repository.claimWhatsAppProviderMessageIds([providerMessageId], {
  now: afterExpiry,
  claimTtlMs: 1000,
});
assert(staleRetry.size === 1, 'Expected retry after claim expiry to reacquire the unprocessed claim.');

const [staleClaim] = await repository.listWhatsAppProviderMessageClaims(1);
assert(staleClaim.status === 'claimed', 'Expected reacquired claim to remain in claimed status until event storage.');
assert(staleClaim.claimedAt === afterExpiry, 'Expected reacquired claim to refresh claimedAt.');
assert(staleClaim.claimExpiresAt === '2026-07-24T00:00:02.001Z', 'Expected reacquired claim to refresh claimExpiresAt.');
assert(staleClaim.duplicateCount === 1, 'Expected duplicate count to survive stale reclaim.');

await repository.recordWhatsAppEvents([{
  inbound: {
    provider: 'whatsapp-cloud-api',
    providerMessageId,
    fromPhone: '60128881236',
    receivedAt: afterProcessed,
    kind: 'text',
    text: 'EN',
    raw: { smoke: true },
  },
  reply: {
    toPhone: '60128881236',
    text: 'Language saved.',
    intent: 'onboarding',
    sessionStep: 'consent',
  },
  storedAt: afterProcessed,
}]);

const processedRetry = await repository.claimWhatsAppProviderMessageIds([providerMessageId], {
  now: '2026-07-24T00:10:00.000Z',
  claimTtlMs: 1000,
});
assert(processedRetry.size === 0, 'Expected processed claims not to be reacquired.');

const [processedClaim] = await repository.listWhatsAppProviderMessageClaims(1);
assert(processedClaim.status === 'processed', 'Expected stored event to mark claim processed.');
assert(processedClaim.processedAt === afterProcessed, 'Expected processedAt to be recorded.');
assert(!processedClaim.claimExpiresAt, 'Expected processed claim not to keep an active expiry.');

console.log(JSON.stringify({
  ok: true,
  firstClaimed: firstClaim.size,
  immediateRetry: immediateRetry.size,
  staleRetry: staleRetry.size,
  status: processedClaim.status,
  duplicateCount: processedClaim.duplicateCount,
}, null, 2));
