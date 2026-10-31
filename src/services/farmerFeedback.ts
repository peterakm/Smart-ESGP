import { FarmerStatus, type EvidenceRecord, type Farmer } from '../types';
import type { FarmerFeedback } from '../contracts/whatsapp';

const TARGET_EVIDENCE_DAYS = 90;

const firstName = (name: string) => name.split(' ')[0] || 'Tani';

const remainingEvidenceDays = (farmer: Farmer) => {
 return Math.max(0, TARGET_EVIDENCE_DAYS - farmer.daysCollected);
};

const riskLevelForFarmer = (farmer: Farmer): FarmerFeedback['riskLevel'] => {
 if (farmer.status === FarmerStatus.FLAGGED || farmer.anomalies.some((anomaly) => anomaly.severity === 'high')) {
 return 'flagged';
 }

 if (farmer.anomalies.length > 0 || farmer.post2020Status !== 'Clean' || farmer.whispStatus !== 'Clean (Sentinel-2 + FAO Whisp)') {
 return 'watch';
 }

 return 'normal';
};

// Turns "your record needs review" into something a farmer can actually act
// on: what specifically to photograph next time, tied to their real issue
// rather than a generic prompt. Returns undefined when there's nothing
// case-specific to suggest (a clean/normal record). `evidence` covers issues
// specific to today's submission (like a GPS mismatch); farmer-level issues
// (yield anomaly, deforestation flag) are checked after that.
export const buildCaseGuidanceText = (
 farmer: Farmer,
 language: 'BM' | 'EN',
 evidence?: EvidenceRecord
): string | undefined => {
 const locationStatus = evidence?.locationValidation?.status;
 if (locationStatus === 'outside_plot' || locationStatus === 'unknown_plot') {
 return language === 'EN'
 ? "Today's location didn't match your registered plot boundary. Please also send a photo of a landmark, signage, or boundary marker on your farm so FELDA can confirm you're on the right plot."
 : 'Lokasi hari ini tidak sepadan dengan sempadan plot berdaftar anda. Sila hantar juga gambar mercu tanda, papan tanda, atau penanda sempadan di kebun anda supaya FELDA dapat mengesahkan anda berada di plot yang betul.';
 }
 if (locationStatus === 'missing_location') {
 return language === 'EN'
 ? "We didn't receive a GPS location with today's photo. Please send your live location again so FELDA can verify you're on the registered plot."
 : 'Kami tidak menerima lokasi GPS bersama gambar hari ini. Sila hantar semula lokasi semasa anda supaya FELDA dapat mengesahkan anda berada di plot berdaftar.';
 }

 const hasYieldAnomaly = farmer.anomalies.some((anomaly) => anomaly.type === 'Yield vs land issue');
 const hasDeforestationFlag = farmer.post2020Status !== 'Clean' || farmer.whispStatus !== 'Clean (Sentinel-2 + FAO Whisp)';
 const isFlagged = farmer.status === FarmerStatus.FLAGGED;

 if (hasYieldAnomaly) {
 return language === 'EN'
 ? 'To help resolve the delivery volume issue on your record, please also send photos of your weighbridge receipts, transport documents, or proof of any secondary plot you harvest from.'
 : 'Untuk membantu menyelesaikan isu jumlah penghantaran pada rekod anda, sila hantar juga gambar resit jambatan timbang, dokumen pengangkutan, atau bukti mana-mana plot kedua yang anda tuai.';
 }

 if (hasDeforestationFlag) {
 return language === 'EN'
 ? "To help clear the deforestation check on your plot, please send photos of your farm boundary, especially any area next to forest or unused land, showing there's no recent clearing."
 : 'Untuk membantu menyelesaikan semakan deforestasi pada plot anda, sila hantar gambar sempadan kebun anda, terutamanya kawasan bersebelahan hutan atau tanah kosong, yang menunjukkan tiada pembersihan baru-baru ini.';
 }

 if (isFlagged) {
 return language === 'EN'
 ? 'Your account is flagged for FELDA review. Any extra photos of your farm activity, receipts, or documents can help support your case.'
 : 'Akaun anda ditanda untuk semakan FELDA. Sebarang gambar tambahan aktiviti kebun, resit, atau dokumen anda boleh membantu menyokong kes anda.';
 }

 return undefined;
};

const statusLabel = (status: FarmerStatus, language: 'BM' | 'EN') => {
 const labels: Record<FarmerStatus, { BM: string; EN: string }> = {
 [FarmerStatus.CERTIFIED]: { BM: 'Disijilkan', EN: 'Certified' },
 [FarmerStatus.ELIGIBLE_SOON]: { BM: 'Hampir layak', EN: 'Almost eligible' },
 [FarmerStatus.IN_PROGRESS]: { BM: 'Dalam proses', EN: 'In progress' },
 [FarmerStatus.FLAGGED]: { BM: 'Perlu semakan', EN: 'Needs review' },
 [FarmerStatus.INACTIVE]: { BM: 'Tidak aktif', EN: 'Inactive' },
 };

 return labels[status][language];
};

export const buildDailyCheckInFeedback = (
 farmer: Farmer,
 evidence: EvidenceRecord,
 language: 'BM' | 'EN'
) => {
 const remaining = remainingEvidenceDays(farmer);
 const riskLevel = riskLevelForFarmer(farmer);
 const reviewStatus = evidence.review?.status || 'pending';
 const nextAction = language === 'EN'
 ? remaining > 0
 ? `Keep sending one GPS location and one farm activity photo each day. ${remaining} verified day(s) still needed.`
 : 'You have reached the evidence-day target. Wait for FELDA review and the certificate decision.'
 : remaining > 0
 ? `Teruskan hantar satu lokasi GPS dan satu gambar aktiviti kebun setiap hari. ${remaining} hari bukti disahkan masih diperlukan.`
 : 'Sasaran hari bukti telah dicapai. Tunggu semakan FELDA dan keputusan sijil.';

 // Checked unconditionally (not gated on riskLevel) because a GPS mismatch on
 // today's specific submission can happen to an otherwise-normal farmer —
 // riskLevelForFarmer only looks at the farmer's standing record, not today's
 // evidence, so this would otherwise be silently skipped for that farmer.
 const caseGuidance = buildCaseGuidanceText(farmer, language, evidence);

 const feedback: FarmerFeedback = {
 language,
 status: farmer.status,
 score: farmer.score,
 daysCollected: farmer.daysCollected,
 targetEvidenceDays: TARGET_EVIDENCE_DAYS,
 remainingEvidenceDays: remaining,
 evidenceReviewStatus: reviewStatus,
 riskLevel,
 nextAction,
 };

 const fourthLine = caseGuidance ?? (
 language === 'EN'
 ? riskLevel === 'flagged'
 ? 'Important: your record has a high-risk item that needs FELDA review before a certificate can be issued.'
 : riskLevel === 'watch'
 ? 'Note: one item may need FELDA attention, so keep your records complete.'
 : nextAction
 : riskLevel === 'flagged'
 ? 'Penting: rekod anda mempunyai isu berisiko tinggi yang perlu semakan FELDA sebelum sijil boleh dikeluarkan.'
 : riskLevel === 'watch'
 ? 'Nota: ada perkara yang mungkin perlu perhatian FELDA, jadi pastikan rekod lengkap.'
 : nextAction
 );

 const text = language === 'EN'
 ? [
 `Thank you, Pak ${firstName(farmer.name)}. Your photo and GPS location have been recorded.`,
 `Current status: ${statusLabel(farmer.status, language)}. Score ${farmer.score}/100, verified evidence ${farmer.daysCollected}/${TARGET_EVIDENCE_DAYS} days.`,
 'Today\'s evidence is waiting for FELDA review. It will count after approval.',
 fourthLine,
 ]
 : [
 `Terima kasih, Pak ${firstName(farmer.name)}. Gambar dan lokasi GPS telah direkodkan.`,
 `Status semasa: ${statusLabel(farmer.status, language)}. Skor ${farmer.score}/100, bukti disahkan ${farmer.daysCollected}/${TARGET_EVIDENCE_DAYS} hari.`,
 'Bukti hari ini sedang menunggu semakan FELDA. Ia akan dikira selepas diluluskan.',
 fourthLine,
 ];

 if (fourthLine !== nextAction) {
 text.push(nextAction);
 }

 return {
 feedback,
 text: text.join('\n\n'),
 };
};

// The farmer only ever sees WhatsApp, so each dashboard decision on their
// evidence is turned into a message saying what happened and what to do next.
// Returns undefined for 'pending' (a review reset) since nothing changed for them.
export const buildEvidenceReviewNotice = (input: {
 farmer: Farmer;
 evidence: EvidenceRecord;
 decision: 'approved' | 'rejected' | 'flagged' | 'pending';
 language: 'BM' | 'EN';
 notes?: string;
 certificateSuspended?: boolean;
}): string | undefined => {
 const { farmer, evidence, decision, language, notes, certificateSuspended } = input;
 if (decision === 'pending') return undefined;

 const evidenceDate = evidence.receivedAt.split('T')[0];
 const name = firstName(farmer.name);
 const remaining = remainingEvidenceDays(farmer);
 const lines: string[] = [];

 if (decision === 'approved') {
 lines.push(language === 'EN'
 ? `Good news, Pak ${name}. FELDA has approved your evidence from ${evidenceDate}.`
 : `Berita baik, Pak ${name}. FELDA telah meluluskan bukti anda bertarikh ${evidenceDate}.`);
 lines.push(language === 'EN'
 ? `Status: ${statusLabel(farmer.status, language)}. Score ${farmer.score}/100, verified evidence ${farmer.daysCollected}/${TARGET_EVIDENCE_DAYS} days.`
 : `Status: ${statusLabel(farmer.status, language)}. Skor ${farmer.score}/100, bukti disahkan ${farmer.daysCollected}/${TARGET_EVIDENCE_DAYS} hari.`);
 lines.push(language === 'EN'
 ? remaining > 0
 ? `Next step: keep sending one GPS location and one farm photo each day. ${remaining} verified day(s) to go.`
 : 'Next step: you have reached the evidence target. FELDA will now make the certificate decision.'
 : remaining > 0
 ? `Langkah seterusnya: teruskan hantar satu lokasi GPS dan satu gambar kebun setiap hari. ${remaining} hari bukti disahkan lagi.`
 : 'Langkah seterusnya: sasaran bukti telah dicapai. FELDA akan membuat keputusan sijil.');
 } else {
 lines.push(decision === 'rejected'
 ? language === 'EN'
 ? `Pak ${name}, FELDA could not accept your evidence from ${evidenceDate}. It will not count towards your record.`
 : `Pak ${name}, FELDA tidak dapat menerima bukti anda bertarikh ${evidenceDate}. Ia tidak akan dikira dalam rekod anda.`
 : language === 'EN'
 ? `Pak ${name}, FELDA needs more information about your evidence from ${evidenceDate} before it can be approved.`
 : `Pak ${name}, FELDA memerlukan maklumat lanjut tentang bukti anda bertarikh ${evidenceDate} sebelum ia boleh diluluskan.`);
 if (notes) {
 lines.push(language === 'EN' ? `FELDA note: ${notes}` : `Nota FELDA: ${notes}`);
 }
 lines.push(buildCaseGuidanceText(farmer, language, evidence) ?? (language === 'EN'
 ? 'Next step: send a new live GPS location and a clear photo of your farm activity today.'
 : 'Langkah seterusnya: hantar lokasi GPS semasa dan gambar aktiviti kebun yang jelas hari ini.'));
 }

 if (certificateSuspended) {
 lines.push(language === 'EN'
 ? 'Your MSPO certificate has been suspended while this is corrected. Please contact your FELDA officer.'
 : 'Sijil MSPO anda telah digantung sementara perkara ini dibetulkan. Sila hubungi pegawai FELDA anda.');
 }

 return lines.join('\n\n');
};

export const buildCertificateIssuedNotice = (
 farmer: Farmer,
 certificate: { certificateNumber: string; expiresAt: string },
 language: 'BM' | 'EN'
) => {
 const expiry = certificate.expiresAt.split('T')[0];
 return language === 'EN'
 ? [
 `Congratulations, Pak ${firstName(farmer.name)}! FELDA has issued your MSPO certificate.`,
 `Certificate number: ${certificate.certificateNumber}. Valid until ${expiry}.`,
 'Buyers can check it on the Smart-ESGP verification page. Keep sending daily evidence to stay certified.',
 ].join('\n\n')
 : [
 `Tahniah, Pak ${firstName(farmer.name)}! FELDA telah mengeluarkan sijil MSPO anda.`,
 `Nombor sijil: ${certificate.certificateNumber}. Sah sehingga ${expiry}.`,
 'Pembeli boleh menyemaknya di halaman pengesahan Smart-ESGP. Teruskan hantar bukti harian untuk kekal disijilkan.',
 ].join('\n\n');
};

export const buildComplianceQuestionReply =(farmer: Farmer | undefined, language: 'BM' | 'EN') => {
 if (language === 'EN') {
 return farmer
 ? `For MSPO/EUDR evidence, keep each activity tied to GPS and a clear photo. Your current verified evidence is ${farmer.daysCollected}/${TARGET_EVIDENCE_DAYS} days, score ${farmer.score}/100.`
 : 'For MSPO/EUDR evidence, share GPS first, then a clear farm activity photo. FELDA can review it in the workspace.';
 }

 return farmer
 ? `Untuk bukti MSPO/EUDR, pastikan setiap aktiviti ada GPS dan gambar jelas. Bukti disahkan semasa ialah ${farmer.daysCollected}/${TARGET_EVIDENCE_DAYS} hari, skor ${farmer.score}/100.`
 : 'Untuk bukti MSPO/EUDR, kongsi GPS dahulu, kemudian gambar aktiviti kebun yang jelas. FELDA boleh semak dalam ruang kerja.';
};
