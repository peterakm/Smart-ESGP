import type { WhatsAppProviderMessageClaim } from '../src/contracts/whatsapp';
import { getWhatsAppClaimDisplayState, summarizeWhatsAppClaims } from '../src/utils/whatsappClaims';

const assert = (condition: unknown, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};

const now = new Date('2026-07-24T12:00:00.000Z');
const claims: WhatsAppProviderMessageClaim[] = [
  {
    providerMessageId: 'claim-active',
    status: 'claimed',
    claimedAt: '2026-07-24T11:59:00.000Z',
    claimExpiresAt: '2026-07-24T12:04:00.000Z',
    duplicateCount: 0,
  },
  {
    providerMessageId: 'claim-expired',
    status: 'claimed',
    claimedAt: '2026-07-24T11:50:00.000Z',
    claimExpiresAt: '2026-07-24T11:55:00.000Z',
    duplicateCount: 2,
  },
  {
    providerMessageId: 'claim-legacy',
    status: 'claimed',
    claimedAt: '2026-07-24T11:58:00.000Z',
    duplicateCount: 1,
  },
  {
    providerMessageId: 'claim-processed',
    status: 'processed',
    claimedAt: '2026-07-24T11:40:00.000Z',
    processedAt: '2026-07-24T11:41:00.000Z',
    duplicateCount: 3,
  },
];

assert(getWhatsAppClaimDisplayState(claims[0], now) === 'active', 'Expected future claim expiry to display active.');
assert(getWhatsAppClaimDisplayState(claims[1], now) === 'expired', 'Expected past claim expiry to display expired.');
assert(getWhatsAppClaimDisplayState(claims[2], now) === 'expired', 'Expected legacy claimed record without expiry to display expired.');
assert(getWhatsAppClaimDisplayState(claims[3], now) === 'processed', 'Expected processed claim to display processed.');

const summary = summarizeWhatsAppClaims(claims, now);
assert(summary.activeClaims === 1, `Expected one active claim, got ${summary.activeClaims}.`);
assert(summary.expiredClaims === 2, `Expected two expired claims, got ${summary.expiredClaims}.`);
assert(summary.processedClaims === 1, `Expected one processed claim, got ${summary.processedClaims}.`);
assert(summary.duplicateMessages === 6, `Expected six duplicate messages, got ${summary.duplicateMessages}.`);
assert(
  summary.openClaims.map((claim) => claim.providerMessageId).join(',') === 'claim-legacy,claim-expired,claim-active',
  `Expected expired open claims first, got ${summary.openClaims.map((claim) => claim.providerMessageId).join(',')}.`
);

console.log(JSON.stringify({
  ok: true,
  activeClaims: summary.activeClaims,
  expiredClaims: summary.expiredClaims,
  processedClaims: summary.processedClaims,
  duplicateMessages: summary.duplicateMessages,
  openClaims: summary.openClaims.map((claim) => `${claim.providerMessageId}:${claim.displayState}`),
}, null, 2));
