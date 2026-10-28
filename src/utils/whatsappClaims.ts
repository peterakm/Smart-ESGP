import type { WhatsAppProviderMessageClaim } from '../contracts/whatsapp';

export type WhatsAppClaimDisplayState = 'active' | 'expired' | 'processed';

export interface WhatsAppClaimSummary {
 activeClaims: number;
 expiredClaims: number;
 processedClaims: number;
 duplicateMessages: number;
 openClaims: Array<WhatsAppProviderMessageClaim & { displayState: WhatsAppClaimDisplayState }>;
}

export const getWhatsAppClaimDisplayState = (
 claim: WhatsAppProviderMessageClaim,
 now: Date = new Date()
): WhatsAppClaimDisplayState => {
 if (claim.status === 'processed') {
 return 'processed';
 }

 if (!claim.claimExpiresAt) {
 return 'expired';
 }

 return new Date(claim.claimExpiresAt).getTime() <= now.getTime() ? 'expired' : 'active';
};

export const summarizeWhatsAppClaims = (
 claims: WhatsAppProviderMessageClaim[],
 now: Date = new Date()
): WhatsAppClaimSummary => {
 const claimsWithState = claims.map((claim) => ({
 ...claim,
 displayState: getWhatsAppClaimDisplayState(claim, now),
 }));
 const openClaims = claimsWithState
 .filter((claim) => claim.displayState !== 'processed')
 .sort((a, b) => {
 if (a.displayState !== b.displayState) {
 return a.displayState === 'expired' ? -1 : 1;
 }
 return b.claimedAt.localeCompare(a.claimedAt);
 });

 return {
 activeClaims: claimsWithState.filter((claim) => claim.displayState === 'active').length,
 expiredClaims: claimsWithState.filter((claim) => claim.displayState === 'expired').length,
 processedClaims: claimsWithState.filter((claim) => claim.displayState === 'processed').length,
 duplicateMessages: claims.reduce((sum, claim) => sum + claim.duplicateCount, 0),
 openClaims,
 };
};
