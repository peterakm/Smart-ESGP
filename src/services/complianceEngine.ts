import { FarmerStatus, type Anomaly, type AuditLog, type EvidenceRecord, type Farmer, type Waypoint } from '../types';
import { getStableCertificateId } from '../utils/certificates';

export type ComplianceLanguage = 'EN' | 'BM';

export interface ComplianceEvaluation {
 farmer: Farmer;
 scoreDelta: number;
 status: FarmerStatus;
 auditLogs: AuditLog[];
 anomalies: Anomaly[];
 certificationEligible: boolean;
 rules: {
 id: string;
 label: string;
 passed: boolean;
 details: string;
 }[];
}

export interface ComplianceEvaluationOptions {
 applyEvidence?: boolean;
 language?: ComplianceLanguage;
}

const RULE_LABELS: Record<ComplianceLanguage, Record<'verifiedWhatsappEvidence' | 'minimumEvidenceDays' | 'pdpaConsent' | 'yieldToLand', string>> = {
 EN: {
 verifiedWhatsappEvidence: 'Verified WhatsApp evidence',
 minimumEvidenceDays: 'Minimum evidence days',
 pdpaConsent: 'PDPA consent',
 yieldToLand: 'Yield vs land',
 },
 BM: {
 verifiedWhatsappEvidence: 'Bukti WhatsApp disahkan',
 minimumEvidenceDays: 'Bilangan hari bukti minimum',
 pdpaConsent: 'Persetujuan PDPA',
 yieldToLand: 'Hasil berbanding tanah',
 },
};

const biologicalYieldRatio = (farmer: Farmer) => {
 if (farmer.expectedYieldCeiling <= 0) return 0;
 return farmer.annualProjection / farmer.expectedYieldCeiling;
};

const evaluateYieldAnomaly = (farmer: Farmer, language: ComplianceLanguage): Anomaly | undefined => {
 const ratio = biologicalYieldRatio(farmer);
 if (ratio <= 1.35) return undefined;

 if (language === 'BM') {
 return {
 type: 'Yield vs land issue',
 severity: ratio >= 2 ? 'high' : 'medium',
 description: `Unjuran hasil tahunan ialah ${farmer.annualProjection.toFixed(1)} tan. Had hasil yang dijangka ialah ${farmer.expectedYieldCeiling.toFixed(1)} tan (${Math.round(ratio * 100)}% daripada had).`,
 probableCause: 'Buah mungkin termasuk bekalan dari luar plot berdaftar, atau rekod penghantaran perlu disemak semula.',
 recommendedAction: 'Tangguhkan keputusan sijil automatik dan minta auditor FELDA menyemak rekod penghantaran serta maklumat plot kedua.',
 };
 }

 return {
 type: 'Yield vs land issue',
 severity: ratio >= 2 ? 'high' : 'medium',
 description: `Projected annual yield is ${farmer.annualProjection.toFixed(1)} tonnes. The expected yield limit is ${farmer.expectedYieldCeiling.toFixed(1)} tonnes (${Math.round(ratio * 100)}% of the limit).`,
 probableCause: 'Fruit may include supply from outside the mapped plot, or delivery records may need checking.',
 recommendedAction: 'Pause the automatic certificate decision and ask a FELDA auditor to review delivery records and any second plot.',
 };
};

const nextStatusForFarmer = (farmer: Farmer, anomalies: Anomaly[]) => {
 if (anomalies.some((anomaly) => anomaly.severity === 'high')) {
 return FarmerStatus.FLAGGED;
 }

 if (farmer.daysCollected >= 90 && farmer.score >= 90 && farmer.pdpaConsent) {
 return FarmerStatus.CERTIFIED;
 }

 if (farmer.daysCollected >= 40) {
 return FarmerStatus.ELIGIBLE_SOON;
 }

 return FarmerStatus.IN_PROGRESS;
};

const appendCheckInEvidence = (farmer: Farmer, evidence: EvidenceRecord) => {
 const activity = evidence.activityType;
 const waypoint: Waypoint = {
 lat: evidence.location?.lat || farmer.polygonWaypoints[farmer.polygonWaypoints.length - 1]?.lat || 2.03,
 lng: evidence.location?.lng || farmer.polygonWaypoints[farmer.polygonWaypoints.length - 1]?.lng || 103.32,
 timestamp: evidence.receivedAt.split('T')[0],
 activity,
 };

 return {
 polygonWaypoints: [...farmer.polygonWaypoints, waypoint],
 evidenceSummary: {
 ...farmer.evidenceSummary,
 checkIns: farmer.evidenceSummary.checkIns + 1,
 activities: {
 ...farmer.evidenceSummary.activities,
 [activity]: farmer.evidenceSummary.activities[activity] + 1,
 },
 },
 };
};

export const evaluateFarmerCompliance = (
 farmer: Farmer,
 evidenceRecords: EvidenceRecord[] = [],
 options: ComplianceEvaluationOptions = { applyEvidence: true }
): ComplianceEvaluation => {
 const language: ComplianceLanguage = options.language ?? 'EN';
 const shouldApplyEvidence = options.applyEvidence !== false;
 const verifiedCheckIns = evidenceRecords.filter(
 (evidence) => evidence.evidenceType === 'daily_checkin' && evidence.verificationStatus === 'verified'
 );
 const scoreDelta = shouldApplyEvidence ? verifiedCheckIns.length : 0;
 const latestEvidence = verifiedCheckIns[verifiedCheckIns.length - 1];
 const evidenceUpdate = shouldApplyEvidence && latestEvidence ? appendCheckInEvidence(farmer, latestEvidence) : undefined;
 const nextDaysCollected = farmer.daysCollected + (shouldApplyEvidence ? verifiedCheckIns.length : 0);
 const nextScore = Math.min(98, farmer.score + scoreDelta);
 const yieldAnomaly = evaluateYieldAnomaly(farmer, language);
 const anomalies = yieldAnomaly
 ? [yieldAnomaly, ...farmer.anomalies.filter((anomaly) => anomaly.type !== yieldAnomaly.type)]
 : farmer.anomalies;
 const status = nextStatusForFarmer(
 {
 ...farmer,
 score: nextScore,
 daysCollected: nextDaysCollected,
 },
 anomalies
 );
 const certificationEligible = status === FarmerStatus.CERTIFIED;
 const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 16);
 const auditLogs: AuditLog[] = [];

 if (shouldApplyEvidence && verifiedCheckIns.length > 0) {
 auditLogs.push({
 timestamp,
 action: 'Evidence checked',
 user: 'Smart-ESGP rule check',
 details: `${verifiedCheckIns.length} verified WhatsApp check-in(s) accepted. Score change: +${scoreDelta}. Evidence days: ${nextDaysCollected}/90.`,
 });
 }

 if (yieldAnomaly && !farmer.anomalies.some((anomaly) => anomaly.type === yieldAnomaly.type)) {
 auditLogs.push({
 timestamp,
 action: 'Flag raised',
 user: 'Smart-ESGP rule check',
 details: yieldAnomaly.description,
 });
 }

 const evaluatedFarmer: Farmer = {
 ...farmer,
 ...(evidenceUpdate || {}),
 score: nextScore,
 daysCollected: nextDaysCollected,
 status,
 mspoCertId:
 certificationEligible && (farmer.mspoCertId === 'UNASSIGNED' || farmer.mspoCertId.startsWith('PENDING'))
 ? getStableCertificateId(farmer)
 : farmer.mspoCertId,
 lastActivityDate: latestEvidence
 ? `today ${new Date(latestEvidence.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
 : farmer.lastActivityDate,
 anomalies,
 auditLogs: [...auditLogs, ...farmer.auditLogs],
 };

 return {
 farmer: evaluatedFarmer,
 scoreDelta,
 status,
 auditLogs,
 anomalies,
 certificationEligible,
 rules: [
 {
 id: 'verified-whatsapp-evidence',
 label: RULE_LABELS[language].verifiedWhatsappEvidence,
 passed: verifiedCheckIns.length > 0,
 details: language === 'BM'
 ? `${verifiedCheckIns.length} rekod bukti WhatsApp disahkan dalam penilaian ini.`
 : `${verifiedCheckIns.length} verified WhatsApp evidence record(s) checked.`,
 },
 {
 id: 'minimum-evidence-days',
 label: RULE_LABELS[language].minimumEvidenceDays,
 passed: nextDaysCollected >= 90,
 details: language === 'BM'
 ? `${nextDaysCollected}/90 hari bukti dikumpul.`
 : `${nextDaysCollected}/90 evidence days collected.`,
 },
 {
 id: 'pdpa-consent',
 label: RULE_LABELS[language].pdpaConsent,
 passed: farmer.pdpaConsent,
 details: language === 'BM'
 ? (farmer.pdpaConsent ? 'Persetujuan PDPA telah direkodkan.' : 'Persetujuan PDPA tiada.')
 : (farmer.pdpaConsent ? 'PDPA consent is recorded.' : 'PDPA consent is missing.'),
 },
 {
 id: 'yield-to-land',
 label: RULE_LABELS[language].yieldToLand,
 passed: !yieldAnomaly,
 details: yieldAnomaly
 ? yieldAnomaly.description
 : (language === 'BM'
 ? 'Unjuran hasil berada dalam had yang dijangka.'
 : 'Projected yield is within the expected limit.'),
 },
 ],
 };
};
