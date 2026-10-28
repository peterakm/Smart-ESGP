import type { EvidenceRecord, EvidenceReview, Farmer } from '../types';
import { evaluateFarmerCompliance } from './complianceEngine';

export type EvidenceReviewDecision = EvidenceReview['status'];

export const isEvidenceReviewDecision = (value: unknown): value is EvidenceReviewDecision => {
 return value === 'approved' || value === 'rejected' || value === 'flagged' || value === 'pending';
};

export const verificationStatusForReview = (
 decision: EvidenceReviewDecision
): EvidenceRecord['verificationStatus'] => {
 if (decision === 'approved') return 'verified';
 if (decision === 'pending') return 'received';
 return 'needs_review';
};

const decrementEvidenceSummary = (
 farmer: Farmer,
 evidence: EvidenceRecord
): Farmer['evidenceSummary'] => {
 const activity = evidence.activityType;

 return {
 ...farmer.evidenceSummary,
 checkIns: Math.max(0, farmer.evidenceSummary.checkIns - 1),
 activities: {
 ...farmer.evidenceSummary.activities,
 [activity]: Math.max(0, farmer.evidenceSummary.activities[activity] - 1),
 },
 };
};

const removeEvidenceWaypoint = (farmer: Farmer, evidence: EvidenceRecord) => {
 const evidenceDate = evidence.receivedAt.split('T')[0];
 const matchingIndex = [...farmer.polygonWaypoints]
 .map((waypoint, index) => ({ waypoint, index }))
 .reverse()
 .find(({ waypoint }) =>
 waypoint.activity === evidence.activityType
 && (!waypoint.timestamp || waypoint.timestamp === evidenceDate)
 && (
 !evidence.location
 || (
 Math.abs(waypoint.lat - evidence.location.lat) < 0.000001
 && Math.abs(waypoint.lng - evidence.location.lng) < 0.000001
 )
 )
 )?.index;

 if (matchingIndex === undefined) {
 return farmer.polygonWaypoints;
 }

 return farmer.polygonWaypoints.filter((_, index) => index !== matchingIndex);
};

export const reverseVerifiedEvidenceContribution = (farmer: Farmer, evidence: EvidenceRecord): Farmer => {
 const correctedBase: Farmer = {
 ...farmer,
 score: Math.max(0, farmer.score - 1),
 daysCollected: Math.max(0, farmer.daysCollected - 1),
 evidenceSummary: decrementEvidenceSummary(farmer, evidence),
 polygonWaypoints: removeEvidenceWaypoint(farmer, evidence),
 auditLogs: [
 {
 timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
 action: 'Compliance Evidence Corrected',
 user: 'Smart-ESGP Compliance Engine',
 details: `Verified evidence ${evidence.id} was reversed after FELDA review correction. Score delta: -1. Evidence day count: ${Math.max(0, farmer.daysCollected - 1)}/90.`,
 },
 ...farmer.auditLogs,
 ],
 };

 return evaluateFarmerCompliance(correctedBase, [], { applyEvidence: false }).farmer;
};
