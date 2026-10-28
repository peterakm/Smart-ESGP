import React, { useState, useMemo } from 'react';
import { CertificateRecord, ConsentRecord, EvidenceRecord, Farmer, FarmerStatus, SystemAuditEvent } from '../types';
import type { WhatsAppFarmerSession, WhatsAppMonitoringEvent, WhatsAppProviderMessageClaim } from '../contracts/whatsapp';
import type { ComplianceEvaluation } from '../services/complianceEngine';
import { summarizeWhatsAppClaims } from '../utils/whatsappClaims';
import { getWhatsAppFailedSendEvents, getWhatsAppGpsReviewEvents } from '../utils/whatsappMonitoring';
import {
 buildSmartEsgpEsgCategories,
 type SmartEsgpEsgCategory,
 type SmartEsgpEsgCategoryId,
 type SmartEsgpLanguage,
} from '../domain/esgPractices';
import { PolygonMap } from './PolygonMap';
import { MspoCertificate } from './MspoCertificate';
import { ConfirmActionDialog, type ConfirmActionRequest } from './ConfirmActionDialog';
import {
 ICON, TAP_TARGET,
 IconApproved, IconArrowDown, IconArrowForward, IconArrowUp, IconBook,
 IconCertificate, IconChevronDown, IconClock, IconDatabase, IconDownload,
 IconDuplicate, IconEnvironment, IconFarmers, IconFlag, IconGovernance,
 IconList, IconPin, IconScore, IconSearch, IconSignal, IconSort,
 IconVerified, IconWarning, IconChat,
 type AppIcon,
} from './icons';
import { TEST_FARMER_IDS } from '../data/mockFarmers';
import { downloadFarmerCertificate } from '../utils/certificateDownload';
import { findFarmerCertificate, formatCertificateTimestamp } from '../utils/certificateValidity';
import {
 ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell
} from 'recharts';

interface DealerDashboardProps {
 farmers: Farmer[];
 whatsappSessions: WhatsAppFarmerSession[];
 whatsappEvents: WhatsAppMonitoringEvent[];
 whatsappGpsReviewEvents?: WhatsAppMonitoringEvent[];
 whatsappFailedSendEvents?: WhatsAppMonitoringEvent[];
 whatsappMessageClaims: WhatsAppProviderMessageClaim[];
 selectedFarmerWhatsappEvents?: WhatsAppMonitoringEvent[] | null;
 evidenceRecords: EvidenceRecord[];
 evidenceReviewQueueRecords?: EvidenceRecord[];
 systemAuditEvents: SystemAuditEvent[];
 systemAuditAlertEvents?: SystemAuditEvent[];
 certificates: CertificateRecord[];
 consentRecords: ConsentRecord[];
 complianceEvaluation: ComplianceEvaluation | null;
 selectedFarmerId: string;
 onSelectFarmer: (id: string) => void;
 onViewCertificate: (id: string) => void;
 onClearFlag: (farmerId: string, justification?: string) => void;
 onApplyOverride: (farmerId: string, overrideDetails: string) => void;
 onReviewEvidence: (
 evidenceId: string,
 decision: NonNullable<EvidenceRecord['review']>['status'],
 notes?: string
 ) => void;
 onResolveIdentityConflict: (phoneNumber: string, decision: 'approve' | 'reject') => void;
 onOpenEvidenceMedia: (evidenceId: string) => void;
 onIssueCertificate: (farmerId: string) => void;
 language?: DashboardLanguage;
 isSampleData?: boolean;
 sampleDataAsOf?: string;
 dataRefreshedAt?: string | null;
}

type DashboardLanguage = SmartEsgpLanguage;
type DashboardFilter = 'all' | 'active' | 'inactive' | 'flagged' | 'certified' | 'pendingCertificates' | 'scoreUnder70';
type DashboardEsgTab = SmartEsgpEsgCategoryId;
type WhatsAppActivityFilter = 'all' | 'attention' | 'failed';
type FilterCounts = Record<DashboardFilter, number>;
type FarmerSortKey = 'name' | 'mpobLicence' | 'plotArea' | 'score' | 'daysCollected' | 'lastActivityDate' | 'status';
type SortDirection = 'asc' | 'desc';

interface FarmerSortState {
 key: FarmerSortKey | null;
 direction: SortDirection;
}

const compareFarmersBy = (a: Farmer, b: Farmer, key: FarmerSortKey): number => {
 switch (key) {
 case 'plotArea':
 return a.plotArea - b.plotArea;
 case 'score':
 return a.score - b.score;
 case 'daysCollected':
 return a.daysCollected - b.daysCollected;
 default:
 return String(a[key]).localeCompare(String(b[key]));
 }
};

interface DashboardEsgCategory extends SmartEsgpEsgCategory {
 bgActive: string;
}

type TriageSeverity = 'critical' | 'warning';

interface TriageItem {
 id: string;
 label: string;
 count: number;
 severity: TriageSeverity;
 icon: AppIcon;
 onActivate: () => void;
}

const TRIAGE_TILE_CLASSES: Record<TriageSeverity | 'clear', string> = {
 critical: 'border-rose-300/55 bg-rose-500/15 text-white hover:bg-rose-500/20',
 warning: 'border-amber-300/55 bg-amber-400/15 text-white hover:bg-amber-400/20',
 clear: 'border-white/12 bg-white/8 text-white/70 hover:bg-white/12',
};

const TRIAGE_ICON_CLASSES: Record<TriageSeverity | 'clear', string> = {
 critical: 'bg-rose-50 text-rose-700',
 warning: 'bg-amber-50 text-amber-700',
 clear: 'bg-white/12 text-white/70',
};

type KpiTone = 'positive' | 'neutral' | 'warning' | 'risk';

interface KpiCardModel {
 label: string;
 value: number;
 suffix?: string;
 helper: string;
 tone: KpiTone;
 icon: AppIcon;
}

const KPI_TONE_CLASSES: Record<KpiTone, { icon: string; value: string; helper: string }> = {
 positive: {
 icon: 'bg-emerald-50 text-emerald-700 border-emerald-100',
 value: 'text-slate-950',
 helper: 'text-emerald-700',
 },
 neutral: {
 icon: 'bg-indigo-50 text-indigo-700 border-indigo-100',
 value: 'text-slate-950',
 helper: 'text-indigo-700',
 },
 warning: {
 icon: 'bg-amber-50 text-amber-700 border-amber-100',
 value: 'text-slate-950',
 helper: 'text-amber-700',
 },
 risk: {
 icon: 'bg-rose-50 text-rose-700 border-rose-100',
 value: 'text-rose-700',
 helper: 'text-rose-700',
 },
};

const DEFAULT_OVERRIDE_TEXT =
 'Owner provided valid land tenure deeds and independent harvest records verifying secondary plot yield.';

const DASHBOARD_ESG_ACTIVE_CLASSES: Record<DashboardEsgTab, string> = {
 E: 'bg-emerald-600 text-white',
 S: 'bg-indigo-600 text-white',
 G: 'bg-amber-600 text-white',
};

const DASHBOARD_COPY = {
 EN: {
 workspaceLabel: 'FELDA auditor workspace',
 title: 'Smart-ESGP evidence workspace',
 summaryPrefix: 'Review farmer evidence, WhatsApp updates, identity checks, and certificate decisions for',
 monitoredSmallholders: 'smallholders',
 signedIn: 'Signed in as FELDA auditor',
 triage: {
 title: 'Review status',
 activeTitle: 'Items need review',
 clearTitle: 'Review queue is clear',
 subtitle: 'See open review items, evidence status, and the next certificate decision in one place.',
 allClear: 'Pending activities',
 noPendingActivities: 'All compliance activities are complete for this farmer.',
 flagged: 'Farmers to review',
 evidence: 'Evidence to review',
 gps: 'GPS outside plot',
 failedSends: 'Failed WhatsApp replies',
 identity: 'Phone identity issues',
 alertsTitle: 'System alerts',
 alertsMore: 'more alerts in audit trail',
 openItems: 'open',
 reviewAction: 'Review',
 priorityQueue: 'Top item',
 signalTitle: 'Evidence status',
 signalMap: 'Plot, GPS, media, and certificate status',
 trustBadge: 'MSPO, EUDR and FELDA sustainability guidelines',
 },
 about: {
 toggle: 'About Smart-ESGP',
 toggleHint: 'Reference only. No action required.',
 },
 provenance: {
 sampleTitle: 'Sample data - not live data',
 sampleBody:
 'The farmer API is not available, so this workspace is showing sample records from {date}. Do not use this data for real certificate decisions.',
 liveLabel: 'Live farmer data',
 refreshedAt: 'Last refreshed',
 neverRefreshed: 'not refreshed yet',
 },
 confirm: {
 reviewHeading: 'Review before recording',
 close: 'Close confirmation dialog',
 cancel: 'Cancel',
 farmerLabel: 'Farmer',
 licenceLabel: 'MPOB licence',
 statusLabel: 'Current status',
 scoreLabel: 'Compliance score',
 evidenceDaysLabel: 'Evidence days',
 eligibilityLabel: 'Rule check result',
 evidenceLabel: 'Evidence record',
 activityLabel: 'Activity',
 gpsLabel: 'GPS check',
 justificationLabel: 'Audit reason (saved in the audit trail)',
 justificationPlaceholder: 'Explain the evidence behind this decision...',
 justificationRequired: 'Add a reason before this decision can be saved.',
 reviewNoteLabel: 'Review note (optional)',
 reviewNotePlaceholder: 'Add a short note for the next reviewer...',
 clearFlagTitle: 'Clear issue flag',
 clearFlagDescription: 'Clearing the flag returns this farmer to certificate review and recalculates the compliance score.',
 clearFlagConsequence: 'The decision is saved under your auditor account and can change the certificate result.',
 clearFlagConfirm: 'Clear flag and record',
 overrideTitle: 'Record rule exception',
 overrideDescription: 'A rule exception keeps the issue on file but lets certificate review continue.',
 overrideConsequence: 'The exception and your reason stay attached to this farmer file.',
 overrideConfirm: 'Record exception',
 issueTitle: 'Issue MSPO certificate',
 issueDescription: 'Issuing creates a certificate record with a verification hash and expiry date.',
 issueConsequence: 'The certificate is added to the registry. It cannot be withdrawn from this screen.',
 issueConfirm: 'Issue certificate',
 approveTitle: 'Approve evidence',
 approveDescription: 'Approved evidence counts towards this farmer\'s compliance score and certificate eligibility.',
 approveConsequence: 'The decision is stored against the evidence record with your reviewer identity.',
 approveConfirm: 'Approve evidence',
 flagTitle: 'Flag evidence for review',
 flagDescription: 'Flagged evidence is held out of the compliance score until somebody resolves it.',
 flagConsequence: 'The submission stays in the review queue until an auditor records a final decision.',
 flagConfirm: 'Flag evidence',
 rejectTitle: 'Reject evidence',
 rejectDescription: 'Rejected evidence is not counted in the score or certificate file.',
 rejectConsequence: 'This cannot be undone from the workspace. The farmer must resend the evidence over WhatsApp.',
 rejectConfirm: 'Reject evidence',
 },
 system: {
 label: 'Farmer evidence',
 title: 'How Smart-ESGP supports traceability',
 body: 'Farmers send consent, location, activity, and document evidence through WhatsApp. Smart-ESGP organizes it for FELDA review.',
 positioningRule: 'Smart-ESGP supports SKN, SIMS, GeoSAWIT, and e-MSPO. It does not replace them.',
 capturedOnce: 'Collected once',
 capturedTitle: 'WhatsApp evidence with consent',
 capturedItems: ['Location or plot proof', 'Farm activity records', 'Photo or document evidence', 'Farmer consent status'],
 complianceOutput: 'Compliance output',
 complianceTitle: 'MSPO/EUDR evidence',
 complianceItems: ['Plot and deforestation review', 'Activity and delivery evidence', 'FELDA approval history'],
 financeOutput: 'Optional output',
 financeTitle: 'Finance review support',
 financeItems: ['Only with separate consent', 'Activity consistency', 'Risk signals checked by a person'],
 },
 kpis: {
 activeFarmers: 'Active farmers',
 activeHelper: 'Active records',
 averageScore: 'Average compliance score',
 averageHelper: 'Average score',
 pendingCertificates: 'Pending certificates',
 pendingHelper: 'Awaiting issue or review',
 flaggedAnomalies: 'Flagged issues',
 flaggedHelper: 'Need auditor review',
 },
 whatsapp: {
 intakeTitle: 'WhatsApp bot intake',
 intakeSubtitle: 'New messages from farmers.',
 active: 'Active',
 linked: 'Linked',
 pending: 'Pending',
 claimsTitle: 'Message control',
 claimsSubtitle: 'Stops duplicate WhatsApp messages.',
 expired: 'Expired',
 done: 'Done',
 dupes: 'Duplicates',
 noClaims: 'No pending message checks.',
 sessionTitle: 'Phone sessions',
 sessionSubtitle: 'Current setup stage by phone.',
 phones: 'phones',
 noSessions: 'No WhatsApp sessions received yet.',
 identityReview: 'identity review',
 unlinkedFarmer: 'Unlinked farmer',
 noLanguage: 'Language not selected',
 conflictRequests: 'Requesting link to',
 newLinkRequest: 'new WhatsApp link request',
 approveLink: 'Approve link',
 rejectLink: 'Reject',
 conflictResolved: 'Conflict resolved',
 messagesTitle: 'Recent farmer messages',
 messagesSubtitle: 'Inbound messages and bot replies.',
 all: 'All',
 gpsReview: 'GPS review',
 failed: 'Failed',
 noGpsReview: 'No recent WhatsApp GPS items need review.',
 noFailedSends: 'No failed WhatsApp outbound sends.',
 noWebhookEvents: 'No WhatsApp activity received yet.',
 activityFilterLabel: 'Filter farmer messages',
 openFarmer: 'Open farmer file',
 humanReview: 'Needs human review',
 botReply: 'Bot reply',
 noMessageText: 'No message text (media or location only)',
 },
 charts: {
 complianceTitle: 'Compliance score spread',
 statusTitle: 'Farmer status spread',
 average: 'Average',
 smallholders: 'smallholders',
 under60: 'Under 60',
 certified: 'Certified',
 inProgress: 'In progress',
 eligibleSoon: 'Eligible soon',
 flagged: 'Flagged',
 inactive: 'Inactive',
 },
 guidelines: {
 title: 'Guidelines library',
 subtitle: 'Reference standards and regulations used during certificate review.',
 referenceType: 'Reference document',
 mspoTitle: 'MSPO standards',
 mspoBody: 'Certification rules for Malaysian Sustainable Palm Oil checks.',
 rspoTitle: 'RSPO',
 rspoBody: 'Reference for responsible palm oil practices and supply chain expectations.',
 eudrTitle: 'EUDR regulations',
 eudrBody: 'Deforestation and traceability requirements for EU market access.',
 feldaTitle: 'FELDA sustainability practices',
 feldaBody: 'FELDA guidance for field practices, evidence, and auditor review.',
 documentLink: 'View documentation',
 documentLinkAria: 'View documentation for',
 },
 filters: {
 farmerOverview: 'Farmer overview',
 complianceCertificates: 'Compliance certificates',
 pendingCertificates: 'Pending certificates',
 flaggedAnomalies: 'Flagged issues',
 activeFarmers: 'Active farmers',
 inactive14Days: 'Inactive 14+ days',
 scoreBelow70: 'Score below 70',
 auditNotice: 'Audit approvals and exceptions are saved in the system audit trail.',
 },
 table: {
 title: 'Farmers in network',
 showing: 'Showing',
 of: 'of',
 searchPlaceholder: 'Search name or MPOB licence...',
 name: 'Name',
 mpobLicence: 'MPOB licence',
 plot: 'Plot (ha)',
 score: 'Score',
 days: 'Days',
 lastActivity: 'Last activity',
 status: 'Status',
 actions: 'Actions',
 noMatches: 'No smallholders match the criteria.',
 view: 'View',
 caption: 'Smallholders in the FELDA network. Select a row to load its detail panel, or open the full certificate review.',
 rowHint: 'Selecting a row loads that farmer in the detail panel below.',
 selectRow: 'Select farmer',
 selectedRow: 'Selected',
 viewDetail: 'Detail',
 openReview: 'Open review',
 sortAscending: 'sorted ascending',
 sortDescending: 'sorted descending',
 },
 detail: {
 farmerDetail: 'Farmer detail',
 status: 'Status',
 anomalyAlert: 'Yield vs land issue alert',
 probableCause: 'Likely reason',
 recommendedAction: 'Next action',
 resolutionPanel: 'Auditor actions',
 overridePlaceholder: 'Explain why this exception is allowed...',
 clearFlag: 'Clear flag',
 logOverride: 'Record temporary exception',
 certificateValid: 'Certificate is valid',
 certificateLabel: 'Certificate',
 certificateActiveText: 'is active. The required checks are complete. Satellite review shows no tree loss after 2020.',
 activeScore: 'Current score',
 evidenceLogs: 'Evidence logs',
 viewPrintCert: 'View and print certificate',
 complianceOnTrack: 'Progress on track',
 progressText: 'The farmer is sending daily evidence through WhatsApp. The score updates when new evidence is received.',
 dayLogged: 'Day {n} logged',
 day90Ready: 'Day 90 (Certificate ready)',
 pipelineTitle: 'Practice checks',
 rulesEngineLabel: 'Rule check',
 complianceEvaluationTitle: 'Compliance result',
 complianceNotAvailable: 'Compliance result is not available yet.',
 scoreDelta: 'Score change',
 rules: 'Rules',
 eligible: 'Eligible',
 yes: 'Yes',
 no: 'No',
 certificationDecisionLabel: 'certificate decision',
 certIssuanceTitle: 'Certificate issue',
 certIssuanceDesc: 'Shows whether FELDA has issued an official certificate for this farmer.',
 issue: 'Issue',
 noCertYet: 'No certificate has been issued for this farmer yet.',
 issued: 'Issued',
 expires: 'Expires',
 hash: 'Hash',
 by: 'By',
 farmerConsentLabel: 'farmer consent',
 pdpaTitle: 'PDPA consent',
 pdpaDesc: 'Confirms the farmer agreed to data collection through WhatsApp.',
 recorded: 'recorded',
 missing: 'missing',
 noConsent: 'No WhatsApp consent record is linked to this farmer yet.',
 response: 'Response',
 at: 'At',
 msg: 'Msg',
 phone: 'Phone',
 pendingEvidenceLabel: 'pending evidence',
 evidenceWaitingTitle: 'Evidence to review',
 evidenceWaitingDesc: 'New WhatsApp submissions appear here before they affect the certificate review.',
 open: 'open',
 auditNotePlaceholder: 'Audit note',
 evidenceDetails: 'Evidence metadata',
 linkedFarmer: 'Linked farmer',
 noEvidenceWaiting: 'No WhatsApp evidence is waiting for FELDA review.',
 mediaPending: 'media pending',
 size: 'Size',
 noGps: 'No GPS',
 view: 'View',
 approve: 'Approve',
 flag: 'Flag',
 reject: 'Reject',
 acceptedEvidenceLabel: 'accepted evidence',
 approvedProofTitle: 'Approved WhatsApp evidence',
 approvedProofDesc: 'Stores reviewed farmer check-ins with media, GPS, hash, and message metadata.',
 records: 'records',
 noApprovedProof: 'No approved WhatsApp proof has been recorded for this farmer yet.',
 media: 'Media',
 stored: 'Stored',
 viewEvidenceMedia: 'View evidence media',
 deforestationLabel: 'deforestation screening',
 satelliteCheckTitle: 'Satellite check',
 satelliteCheckDesc: 'Uses the farmer polygon and satellite reference status to support EUDR deforestation review.',
 clear: 'clear',
 reviewNeeded: 'review needed',
 demoStatus: 'Demo status',
 demoStatusNote: 'Connect a live Sentinel-2 or WHISP service before treating this as final deforestation evidence.',
 auditTrailLabel: 'audit trail',
 plotPolygonMapLabel: 'plot map',
 polygonArea: 'Plot area',
 waypoints: 'waypoints',
 deliveries30d: '30-day deliveries',
 annualProj: 'Annual estimate',
 bioCeiling: 'Yield limit',
 none: 'none',
 pending: 'pending',
 },
 },
 BM: {
 workspaceLabel: 'Ruang kerja auditor FELDA',
 title: 'Papan pemuka bukti Smart-ESGP',
 summaryPrefix: 'Semak bukti pekebun, kemas kini WhatsApp, semakan identiti, dan keputusan sijil untuk',
 monitoredSmallholders: 'pekebun kecil',
 signedIn: 'Log masuk sebagai auditor FELDA',
 triage: {
 title: 'Status semakan',
 activeTitle: 'Item perlu disemak',
 clearTitle: 'Baris gilir semakan kosong',
 subtitle: 'Lihat item semakan, status bukti, dan keputusan sijil seterusnya dalam satu tempat.',
 allClear: 'Aktiviti menunggu',
 noPendingActivities: 'Semua aktiviti pematuhan lengkap untuk pekebun ini.',
 flagged: 'Pekebun perlu disemak',
 evidence: 'Bukti perlu disemak',
 gps: 'GPS di luar plot',
 failedSends: 'Balasan WhatsApp gagal',
 identity: 'Isu identiti telefon',
 alertsTitle: 'Amaran sistem',
 alertsMore: 'amaran lain dalam jejak audit',
 openItems: 'terbuka',
 reviewAction: 'Semak',
 priorityQueue: 'Item utama',
 signalTitle: 'Status bukti',
 signalMap: 'Plot, GPS, media, dan status sijil',
 trustBadge: 'Panduan kelestarian MSPO, EUDR dan FELDA',
 },
 about: {
 toggle: 'Mengenai Smart-ESGP',
 toggleHint: 'Rujukan sahaja. Tiada tindakan diperlukan.',
 },
 provenance: {
 sampleTitle: 'Data contoh - bukan data langsung',
 sampleBody:
 'API pekebun tidak tersedia, jadi ruang kerja ini memaparkan rekod contoh dari {date}. Jangan gunakan data ini untuk keputusan sijil sebenar.',
 liveLabel: 'Data pekebun langsung',
 refreshedAt: 'Kemas kini terakhir',
 neverRefreshed: 'belum dikemas kini',
 },
 confirm: {
 reviewHeading: 'Semak sebelum direkodkan',
 close: 'Tutup dialog pengesahan',
 cancel: 'Batal',
 farmerLabel: 'Pekebun',
 licenceLabel: 'Lesen MPOB',
 statusLabel: 'Status semasa',
 scoreLabel: 'Skor pematuhan',
 evidenceDaysLabel: 'Hari bukti',
 eligibilityLabel: 'Keputusan semakan peraturan',
 evidenceLabel: 'Rekod bukti',
 activityLabel: 'Aktiviti',
 gpsLabel: 'Semakan GPS',
 justificationLabel: 'Sebab audit (disimpan dalam jejak audit)',
 justificationPlaceholder: 'Terangkan bukti di sebalik keputusan ini...',
 justificationRequired: 'Masukkan sebab sebelum keputusan ini boleh disimpan.',
 reviewNoteLabel: 'Nota semakan (pilihan)',
 reviewNotePlaceholder: 'Tambah nota ringkas untuk penyemak seterusnya...',
 clearFlagTitle: 'Kosongkan tanda isu',
 clearFlagDescription: 'Mengosongkan tanda mengembalikan pekebun ini ke semakan sijil dan mengira semula skor pematuhan.',
 clearFlagConsequence: 'Keputusan ini disimpan di bawah akaun auditor anda dan boleh mengubah keputusan sijil.',
 clearFlagConfirm: 'Kosongkan tanda dan rekod',
 overrideTitle: 'Rekod pengecualian peraturan',
 overrideDescription: 'Pengecualian mengekalkan isu dalam fail tetapi membenarkan semakan sijil diteruskan.',
 overrideConsequence: 'Pengecualian dan sebab anda kekal pada fail pekebun ini.',
 overrideConfirm: 'Rekod pengecualian',
 issueTitle: 'Keluarkan sijil MSPO',
 issueDescription: 'Pengeluaran mencipta rekod sijil dengan hash pengesahan dan tarikh tamat tempoh.',
 issueConsequence: 'Sijil ditambah ke dalam daftar. Ia tidak boleh ditarik balik dari skrin ini.',
 issueConfirm: 'Keluarkan sijil',
 approveTitle: 'Luluskan bukti',
 approveDescription: 'Bukti yang diluluskan dikira dalam skor pematuhan dan kelayakan sijil pekebun ini.',
 approveConsequence: 'Keputusan disimpan pada rekod bukti bersama identiti penyemak anda.',
 approveConfirm: 'Luluskan bukti',
 flagTitle: 'Tanda bukti untuk semakan',
 flagDescription: 'Bukti yang ditanda tidak dikira dalam skor pematuhan sehingga ia diselesaikan.',
 flagConsequence: 'Penyerahan kekal dalam baris gilir semakan sehingga auditor merekodkan keputusan muktamad.',
 flagConfirm: 'Tanda bukti',
 rejectTitle: 'Tolak bukti',
 rejectDescription: 'Bukti yang ditolak tidak dikira dalam skor atau fail sijil.',
 rejectConsequence: 'Tindakan ini tidak boleh dibatalkan dari papan pemuka. Pekebun perlu menghantar semula bukti melalui WhatsApp.',
 rejectConfirm: 'Tolak bukti',
 },
 system: {
 label: 'Bukti pekebun',
 title: 'Cara Smart-ESGP menyokong kebolehkesanan',
 body: 'Pekebun menghantar persetujuan, lokasi, aktiviti, dan bukti dokumen melalui WhatsApp. Smart-ESGP menyusunnya untuk semakan FELDA.',
 positioningRule: 'Smart-ESGP menyokong SKN, SIMS, GeoSAWIT, dan e-MSPO. Ia tidak menggantikannya.',
 capturedOnce: 'Dikumpul sekali',
 capturedTitle: 'Bukti WhatsApp dengan persetujuan',
 capturedItems: ['Bukti lokasi atau poligon', 'Rekod aktiviti kebun', 'Bukti foto atau dokumen', 'Status persetujuan pekebun'],
 complianceOutput: 'Output pematuhan',
 complianceTitle: 'Bukti MSPO/EUDR',
 complianceItems: ['Semakan plot dan penyahhutanan', 'Bukti aktiviti dan penghantaran', 'Sejarah kelulusan FELDA'],
 financeOutput: 'Output pilihan',
 financeTitle: 'Sokongan semakan kewangan',
 financeItems: ['Hanya dengan persetujuan berasingan', 'Konsistensi aktiviti', 'Isyarat risiko disemak oleh manusia'],
 },
 kpis: {
 activeFarmers: 'Pekebun aktif',
 activeHelper: 'Rekod aktif',
 averageScore: 'Purata skor pematuhan',
 averageHelper: 'Skor purata',
 pendingCertificates: 'Sijil menunggu',
 pendingHelper: 'Menunggu pengeluaran atau semakan',
 flaggedAnomalies: 'Isu ditanda',
 flaggedHelper: 'Perlu semakan auditor',
 },
 whatsapp: {
 intakeTitle: 'Kemasukan bot WhatsApp',
 intakeSubtitle: 'Mesej baharu daripada pekebun.',
 active: 'Aktif',
 linked: 'Dipaut',
 pending: 'Menunggu',
 claimsTitle: 'Kawalan mesej',
 claimsSubtitle: 'Menghalang mesej WhatsApp berganda.',
 expired: 'Luput',
 done: 'Selesai',
 dupes: 'Pendua',
 noClaims: 'Tiada semakan mesej menunggu.',
 sessionTitle: 'Sesi telefon',
 sessionSubtitle: 'Peringkat tetapan semasa mengikut telefon.',
 phones: 'telefon',
 noSessions: 'Tiada sesi WhatsApp diterima lagi.',
 identityReview: 'semakan identiti',
 unlinkedFarmer: 'Pekebun belum dipaut',
 noLanguage: 'Bahasa belum dipilih',
 conflictRequests: 'Meminta pautan kepada',
 newLinkRequest: 'permohonan pautan WhatsApp baharu',
 approveLink: 'Luluskan pautan',
 rejectLink: 'Tolak',
 conflictResolved: 'Konflik diselesaikan',
 messagesTitle: 'Mesej pekebun terkini',
 messagesSubtitle: 'Mesej masuk dan balasan bot.',
 all: 'Semua',
 gpsReview: 'Semak GPS',
 failed: 'Gagal',
 noGpsReview: 'Tiada item GPS WhatsApp terkini yang perlu disemak.',
 noFailedSends: 'Tiada penghantaran keluar WhatsApp yang gagal.',
 noWebhookEvents: 'Tiada aktiviti WhatsApp diterima lagi.',
 activityFilterLabel: 'Tapis mesej pekebun',
 openFarmer: 'Buka fail pekebun',
 humanReview: 'Perlu semakan manusia',
 botReply: 'Balasan bot',
 noMessageText: 'Tiada teks mesej (media atau lokasi sahaja)',
 },
 charts: {
 complianceTitle: 'Sebaran skor pematuhan',
 statusTitle: 'Sebaran status pekebun',
 average: 'Purata',
 smallholders: 'pekebun kecil',
 under60: 'Bawah 60',
 certified: 'Disijilkan',
 inProgress: 'Dalam proses',
 eligibleSoon: 'Layak tidak lama lagi',
 flagged: 'Ditanda',
 inactive: 'Tidak aktif',
 },
 guidelines: {
 title: 'Pustaka panduan',
 subtitle: 'Piawaian dan peraturan rujukan yang digunakan semasa semakan sijil.',
 referenceType: 'Dokumen rujukan',
 mspoTitle: 'Piawaian MSPO',
 mspoBody: 'Peraturan pensijilan untuk semakan Minyak Sawit Mampan Malaysia.',
 rspoTitle: 'RSPO',
 rspoBody: 'Rujukan untuk amalan sawit bertanggungjawab dan jangkaan rantaian bekalan.',
 eudrTitle: 'Peraturan EUDR',
 eudrBody: 'Keperluan penyahhutanan dan kebolehkesanan untuk akses pasaran EU.',
 feldaTitle: 'Amalan kelestarian FELDA',
 feldaBody: 'Panduan FELDA untuk amalan ladang, bukti, dan semakan auditor.',
 documentLink: 'Lihat dokumentasi',
 documentLinkAria: 'Lihat dokumentasi untuk',
 },
 filters: {
 farmerOverview: 'Ringkasan pekebun',
 complianceCertificates: 'Sijil pematuhan',
 pendingCertificates: 'Sijil menunggu',
 flaggedAnomalies: 'Isu ditanda',
 activeFarmers: 'Pekebun aktif',
 inactive14Days: 'Tidak aktif 14+ hari',
 scoreBelow70: 'Skor bawah 70',
 auditNotice: 'Kelulusan dan pengecualian audit disimpan dalam jejak audit sistem.',
 },
 table: {
 title: 'Pekebun dalam rangkaian',
 showing: 'Memaparkan',
 of: 'daripada',
 searchPlaceholder: 'Cari nama atau lesen MPOB...',
 name: 'Nama',
 mpobLicence: 'Lesen MPOB',
 plot: 'Plot (ha)',
 score: 'Skor',
 days: 'Hari',
 lastActivity: 'Aktiviti akhir',
 status: 'Status',
 actions: 'Tindakan',
 noMatches: 'Tiada pekebun kecil sepadan dengan kriteria.',
 view: 'Lihat',
 caption: 'Pekebun kecil dalam rangkaian FELDA. Pilih baris untuk memuatkan panel butiran, atau buka semakan sijil penuh.',
 rowHint: 'Memilih baris akan memuatkan pekebun itu dalam panel butiran di bawah.',
 selectRow: 'Pilih pekebun',
 selectedRow: 'Dipilih',
 viewDetail: 'Butiran',
 openReview: 'Buka semakan',
 sortAscending: 'disusun menaik',
 sortDescending: 'disusun menurun',
 },
 detail: {
 farmerDetail: 'Butiran pekebun',
 status: 'Status',
 anomalyAlert: 'Amaran isu hasil berbanding tanah',
 probableCause: 'Sebab utama',
 recommendedAction: 'Tindakan seterusnya',
 resolutionPanel: 'Tindakan auditor',
 overridePlaceholder: 'Terangkan sebab pengecualian ini dibenarkan...',
 clearFlag: 'Kosongkan tanda',
 logOverride: 'Rekod pengecualian sementara',
 certificateValid: 'Sijil sah',
 certificateLabel: 'Sijil',
 certificateActiveText: 'aktif. Semakan yang diperlukan telah lengkap. Semakan satelit menunjukkan tiada kehilangan pokok selepas 2020.',
 activeScore: 'Skor semasa',
 evidenceLogs: 'Log bukti',
 viewPrintCert: 'Lihat dan cetak sijil',
 complianceOnTrack: 'Kemajuan mengikut jadual',
 progressText: 'Pekebun menghantar bukti harian melalui WhatsApp. Skor dikemas kini apabila bukti baharu diterima.',
 dayLogged: 'Hari {n} dicatat',
 day90Ready: 'Hari 90 (Sijil sedia)',
 pipelineTitle: 'Semakan amalan',
 rulesEngineLabel: 'Semakan peraturan',
 complianceEvaluationTitle: 'Keputusan pematuhan',
 complianceNotAvailable: 'Keputusan pematuhan belum tersedia.',
 scoreDelta: 'Perubahan skor',
 rules: 'Peraturan',
 eligible: 'Layak',
 yes: 'Ya',
 no: 'Tidak',
 certificationDecisionLabel: 'keputusan sijil',
 certIssuanceTitle: 'Pengeluaran sijil',
 certIssuanceDesc: 'Menunjukkan sama ada FELDA telah mengeluarkan sijil rasmi untuk pekebun ini.',
 issue: 'Keluarkan',
 noCertYet: 'Belum ada sijil dikeluarkan untuk pekebun ini.',
 issued: 'Dikeluarkan',
 expires: 'Tamat tempoh',
 hash: 'Cincang',
 by: 'Oleh',
 farmerConsentLabel: 'persetujuan pekebun',
 pdpaTitle: 'Persetujuan PDPA',
 pdpaDesc: 'Mengesahkan pekebun bersetuju dengan pengumpulan data melalui WhatsApp.',
 recorded: 'direkodkan',
 missing: 'tiada',
 noConsent: 'Tiada rekod persetujuan WhatsApp dipautkan kepada pekebun ini lagi.',
 response: 'Respons',
 at: 'Pada',
 msg: 'Mesej',
 phone: 'Telefon',
 pendingEvidenceLabel: 'bukti menunggu',
 evidenceWaitingTitle: 'Bukti perlu disemak',
 evidenceWaitingDesc: 'Penyerahan WhatsApp baharu dipaparkan di sini sebelum ia menjejaskan semakan sijil.',
 open: 'terbuka',
 auditNotePlaceholder: 'Nota audit',
 evidenceDetails: 'Metadata bukti',
 linkedFarmer: 'Pekebun dipaut',
 noEvidenceWaiting: 'Tiada bukti WhatsApp menunggu semakan FELDA.',
 mediaPending: 'media menunggu',
 size: 'Saiz',
 noGps: 'Tiada GPS',
 view: 'Lihat',
 approve: 'Luluskan',
 flag: 'Tanda',
 reject: 'Tolak',
 acceptedEvidenceLabel: 'bukti diterima',
 approvedProofTitle: 'Bukti WhatsApp diluluskan',
 approvedProofDesc: 'Menyimpan daftar masuk pekebun yang disemak berserta media, GPS, hash, dan butiran mesej.',
 records: 'rekod',
 noApprovedProof: 'Belum ada bukti WhatsApp diluluskan direkodkan untuk pekebun ini.',
 media: 'Media',
 stored: 'Disimpan',
 viewEvidenceMedia: 'Lihat media bukti',
 deforestationLabel: 'saringan penyahhutanan',
 satelliteCheckTitle: 'Semakan satelit',
 satelliteCheckDesc: 'Menggunakan poligon pekebun dan status rujukan satelit untuk menyokong semakan penyahhutanan EUDR.',
 clear: 'bersih',
 reviewNeeded: 'perlu semakan',
 demoStatus: 'Status demo',
 demoStatusNote: 'Sambungkan perkhidmatan Sentinel-2 atau WHISP secara langsung sebelum menganggap ini sebagai bukti penyahhutanan muktamad.',
 auditTrailLabel: 'jejak audit tidak boleh diubah',
 plotPolygonMapLabel: 'peta poligon plot (disahkan)',
 polygonArea: 'Keluasan plot',
 waypoints: 'titik laluan',
 deliveries30d: 'Penghantaran 30 hari',
 annualProj: 'Anggaran tahunan',
 bioCeiling: 'Had hasil',
 none: 'tiada',
 pending: 'menunggu',
 },
 },
} satisfies Record<DashboardLanguage, {
 workspaceLabel: string;
 title: string;
 summaryPrefix: string;
 monitoredSmallholders: string;
 signedIn: string;
 triage: Record<string, string>;
 about: Record<string, string>;
 provenance: Record<string, string>;
 confirm: Record<string, string>;
 system: {
 label: string;
 title: string;
 body: string;
 positioningRule: string;
 capturedOnce: string;
 capturedTitle: string;
 capturedItems: string[];
 complianceOutput: string;
 complianceTitle: string;
 complianceItems: string[];
 financeOutput: string;
 financeTitle: string;
 financeItems: string[];
 };
 kpis: Record<string, string>;
 whatsapp: Record<string, string>;
 charts: Record<string, string>;
 guidelines: Record<string, string>;
 filters: Record<string, string>;
 table: Record<string, string>;
 detail: Record<string, string>;
}>;

const getFarmerStatusLabel = (status: FarmerStatus, copy: (typeof DASHBOARD_COPY)['EN']): string => {
 switch (status) {
 case FarmerStatus.CERTIFIED:
 return copy.charts.certified;
 case FarmerStatus.IN_PROGRESS:
 return copy.charts.inProgress;
 case FarmerStatus.ELIGIBLE_SOON:
 return copy.charts.eligibleSoon;
 case FarmerStatus.FLAGGED:
 return copy.charts.flagged;
 case FarmerStatus.INACTIVE:
 return copy.charts.inactive;
 default: {
 const exhaustiveStatus: never = status;
 return exhaustiveStatus;
 }
 }
};

const hasPendingCertificate = (farmer: Farmer) =>
 farmer.status === FarmerStatus.ELIGIBLE_SOON ||
 farmer.mspoCertId === 'UNASSIGNED' ||
 farmer.mspoCertId.startsWith('PENDING');

const matchesDashboardFilter = (farmer: Farmer, filter: DashboardFilter) => {
 switch (filter) {
 case 'all':
 return true;
 case 'active':
 return farmer.status !== FarmerStatus.INACTIVE;
 case 'inactive':
 return farmer.status === FarmerStatus.INACTIVE;
 case 'flagged':
 return farmer.status === FarmerStatus.FLAGGED;
 case 'certified':
 return farmer.status === FarmerStatus.CERTIFIED;
 case 'pendingCertificates':
 return hasPendingCertificate(farmer);
 case 'scoreUnder70':
 return farmer.score < 70;
 default: {
 const exhaustiveFilter: never = filter;
 return exhaustiveFilter;
 }
 }
};

const formatEvidenceFileSize = (sizeBytes?: number) => {
 if (!sizeBytes) return 'none';
 if (sizeBytes < 1024) return `${sizeBytes} B`;
 if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
 return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
};

const getEvidenceReviewStatus = (record: EvidenceRecord): NonNullable<EvidenceRecord['review']>['status'] => {
 if (record.review?.status) return record.review.status;
 if (record.verificationStatus === 'verified') return 'approved';
 if (record.verificationStatus === 'needs_review') return 'flagged';
 return 'pending';
};

const formatLocationValidation = (record: EvidenceRecord) => {
 const validation = record.locationValidation;
 if (!validation) return 'GPS: unchecked';

 const label = validation.status.replace(/_/g, ' ');
 const distance = validation.distanceMeters === undefined ? '' : ` (${validation.distanceMeters}m)`;

 return `GPS: ${label}${distance}`;
};

const formatEvidenceIntake = (record: EvidenceRecord) => {
 const intake = record.intake;
 if (!intake) return 'Intake: legacy';

 const missing = [
 !intake.completeness.linkedFarmer ? 'farmer' : undefined,
 !intake.completeness.hasConsent ? 'consent' : undefined,
 !intake.completeness.hasLocation ? 'gps' : undefined,
 !intake.completeness.hasMedia ? 'media' : undefined,
 !intake.completeness.hasActivity ? 'activity' : undefined,
 ].filter(Boolean);
 const completeness = missing.length === 0 ? 'complete' : `missing ${missing.join('/')}`;
 const source = intake.activitySource.replace('_', ' ');

 return `Intake: ${completeness} - ${source}`;
};

const formatMonitoringLocationValidation = (event: WhatsAppMonitoringEvent) => {
 const validation = event.reply.evidence?.locationValidation;
 if (!validation) return undefined;

 const label = validation.status.replace(/_/g, ' ');
 const distance = validation.distanceMeters === undefined ? '' : ` (${validation.distanceMeters}m)`;

 return `GPS ${label}${distance}`;
};

const getMonitoringLocationValidationClass = (event: WhatsAppMonitoringEvent) => {
 const status = event.reply.evidence?.locationValidation?.status;
 if (status === 'outside_plot' || status === 'missing_location') return 'bg-rose-50 border-rose-100 text-rose-700';
 if (status === 'unknown_plot') return 'bg-amber-50 border-amber-100 text-amber-700';
 if (status === 'inside_plot') return 'bg-emerald-50 border-emerald-100 text-emerald-700';
 return 'bg-slate-50 border-slate-200 text-slate-500';
};

const getFeedbackRiskClass = (riskLevel?: WhatsAppMonitoringEvent['reply']['feedback']['riskLevel']) => {
 if (riskLevel === 'flagged') return 'bg-rose-50 border-rose-200 text-rose-700';
 if (riskLevel === 'watch') return 'bg-amber-50 border-amber-200 text-amber-700';
 return 'bg-emerald-50 border-emerald-200 text-emerald-700';
};

export const DealerDashboard: React.FC<DealerDashboardProps> = ({
 farmers,
 whatsappSessions,
 whatsappEvents,
 whatsappGpsReviewEvents,
 whatsappFailedSendEvents,
 whatsappMessageClaims,
 evidenceRecords,
 evidenceReviewQueueRecords,
 systemAuditAlertEvents,
 certificates,
 consentRecords,
 complianceEvaluation,
 selectedFarmerId,
 onSelectFarmer,
 onViewCertificate,
 onClearFlag,
 onApplyOverride,
 onReviewEvidence,
 onResolveIdentityConflict,
 onOpenEvidenceMedia,
 onIssueCertificate,
 language = 'EN',
 isSampleData = false,
 sampleDataAsOf,
 dataRefreshedAt,
}) => {
 const activeLanguage: DashboardLanguage = language as DashboardLanguage;
 const copy = DASHBOARD_COPY[activeLanguage];
 const [searchQuery, setSearchQuery] = useState('');
 const [currentFilter, setCurrentFilter] = useState<DashboardFilter>('all');
 const [overrideText, setOverrideText] = useState(DEFAULT_OVERRIDE_TEXT);
 const [showCertModal, setShowCertModal] = useState(false);
 const [dashboardEsgTab, setDashboardEsgTab] = useState<DashboardEsgTab>('E');
 const [evidenceReviewNotes, setEvidenceReviewNotes] = useState('');
 const [whatsappActivityFilter, setWhatsappActivityFilter] = useState<WhatsAppActivityFilter>('all');
 const [pendingAction, setPendingAction] = useState<ConfirmActionRequest | null>(null);
 const [farmerSort, setFarmerSort] = useState<FarmerSortState>({ key: null, direction: 'asc' });
 const [showPendingActivities, setShowPendingActivities] = useState(false);

 const handleDownloadCertificate = () => {
 if (selectedFarmer) {
 downloadFarmerCertificate(selectedFarmer, activeLanguage, activeCertificate);
 }
 };

 const selectedFarmer = useMemo(() => {
 return farmers.find((f) => f.id === selectedFarmerId) || farmers[0];
 }, [farmers, selectedFarmerId]);

 const esgCategories = useMemo<DashboardEsgCategory[]>(() => {
 if (!selectedFarmer) return [];
 return buildSmartEsgpEsgCategories(selectedFarmer, activeLanguage, 'dashboard').map((category) => ({
 ...category,
 bgActive: DASHBOARD_ESG_ACTIVE_CLASSES[category.id],
 }));
 }, [activeLanguage, selectedFarmer]);

 const activeDashboardCategory = useMemo(() => {
 return esgCategories.find(cat => cat.id === dashboardEsgTab) || esgCategories[0];
 }, [esgCategories, dashboardEsgTab]);

 const pendingComplianceActivities = useMemo(() => {
 return esgCategories.flatMap((category) =>
 category.items
 .filter((item) => !item.met)
 .map((item) => ({
 category: category.title,
 name: item.name,
 details: item.details,
 anchor: item.anchor,
 }))
 );
 }, [esgCategories]);

 // Sidebar Filter counts
 const filterCounts = useMemo<FilterCounts>(() => {
 return {
 all: farmers.length,
 active: farmers.filter(f => f.status !== FarmerStatus.INACTIVE).length,
 inactive: farmers.filter(f => f.status === FarmerStatus.INACTIVE).length,
 flagged: farmers.filter(f => f.status === FarmerStatus.FLAGGED).length,
 certified: farmers.filter(f => f.status === FarmerStatus.CERTIFIED).length,
 pendingCertificates: farmers.filter(hasPendingCertificate).length,
 scoreUnder70: farmers.filter(f => f.score < 70).length,
 };
 }, [farmers]);

 // Filter & Search table items
 const filteredFarmers = useMemo(() => {
 const normalizedSearchQuery = searchQuery.trim().toLowerCase();

 return farmers.filter((f) => {
 const matchesSearch =
 normalizedSearchQuery.length === 0 ||
 f.name.toLowerCase().includes(normalizedSearchQuery) ||
 f.mpobLicence.toLowerCase().includes(normalizedSearchQuery);

 return matchesSearch && matchesDashboardFilter(f, currentFilter);
 });
 }, [farmers, searchQuery, currentFilter]);

 // Sorting is opt-in: the unsorted view keeps the order the API returned.
 const sortedFarmers = useMemo(() => {
 const { key, direction } = farmerSort;
 if (!key) return filteredFarmers;

 const multiplier = direction === 'asc' ? 1 : -1;
 return [...filteredFarmers].sort((a, b) => compareFarmersBy(a, b, key) * multiplier);
 }, [farmerSort, filteredFarmers]);

 const toggleFarmerSort = (key: FarmerSortKey) => {
 setFarmerSort((current) =>
 current.key === key
 ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
 : { key, direction: 'asc' }
 );
 };

 const farmerColumns: Array<{ key: FarmerSortKey; label: string; align?: 'right' }> = [
 { key: 'name', label: copy.table.name },
 { key: 'mpobLicence', label: copy.table.mpobLicence },
 { key: 'plotArea', label: copy.table.plot },
 { key: 'score', label: copy.table.score },
 { key: 'daysCollected', label: copy.table.days },
 { key: 'lastActivityDate', label: copy.table.lastActivity },
 { key: 'status', label: copy.table.status },
 ];

 // Recharts score distribution calculation
 const scoreDistribution = useMemo(() => {
 let countUnder60 = 0;
 let count60to74 = 0;
 let count75to89 = 0;
 let count90to100 = 0;

 farmers.forEach(f => {
 if (f.score < 60) countUnder60++;
 else if (f.score < 75) count60to74++;
 else if (f.score < 90) count75to89++;
 else count90to100++;
 });

 return [
 { name: copy.charts.under60, count: countUnder60 },
 { name: '60 - 74', count: count60to74 },
 { name: '75 - 89', count: count75to89 },
 { name: '90 - 100', count: count90to100 },
 ];
 }, [copy.charts.under60, farmers]);

 // Recharts status distribution calculation
 const statusDistribution = useMemo(() => {
 const counts = {
 Certified: 0,
 'In progress': 0,
 'Eligible soon': 0,
 Flagged: 0,
 Inactive: 0,
 };

 farmers.forEach(f => {
 if (f.status === FarmerStatus.CERTIFIED) counts.Certified++;
 else if (f.status === FarmerStatus.IN_PROGRESS) counts['In progress']++;
 else if (f.status === FarmerStatus.ELIGIBLE_SOON) counts['Eligible soon']++;
 else if (f.status === FarmerStatus.FLAGGED) counts.Flagged++;
 else if (f.status === FarmerStatus.INACTIVE) counts.Inactive++;
 });

 return [
 { status: copy.charts.certified, count: counts.Certified, key: 'Certified' },
 { status: copy.charts.inProgress, count: counts['In progress'], key: 'In progress' },
 { status: copy.charts.eligibleSoon, count: counts['Eligible soon'], key: 'Eligible soon' },
 { status: copy.charts.flagged, count: counts.Flagged, key: 'Flagged' },
 { status: copy.charts.inactive, count: counts.Inactive, key: 'Inactive' },
 ];
 }, [copy.charts.certified, copy.charts.eligibleSoon, copy.charts.flagged, copy.charts.inProgress, copy.charts.inactive, farmers]);

 // Average compliance score (test accounts excluded)
 const averageScore = useMemo(() => {
 const scoredFarmers = farmers.filter((f) => !TEST_FARMER_IDS.has(f.id));
 if (scoredFarmers.length === 0) return 0;
 const sum = scoredFarmers.reduce((acc, f) => acc + f.score, 0);
 return Math.round(sum / scoredFarmers.length);
 }, [farmers]);

 const pendingCertificates = useMemo(() => {
 return farmers.filter(hasPendingCertificate).length;
 }, [farmers]);

 const kpiCards = useMemo<KpiCardModel[]>(() => [
 {
 label: copy.kpis.activeFarmers,
 value: filterCounts.active,
 helper: copy.kpis.activeHelper,
 tone: 'positive',
 icon: IconFarmers,
 },
 {
 label: copy.kpis.averageScore,
 value: averageScore,
 suffix: '/100',
 helper: copy.kpis.averageHelper,
 tone: 'neutral',
 icon: IconScore,
 },
 {
 label: copy.kpis.pendingCertificates,
 value: pendingCertificates,
 helper: copy.kpis.pendingHelper,
 tone: 'warning',
 icon: IconList,
 },
 {
 label: copy.kpis.flaggedAnomalies,
 value: filterCounts.flagged,
 helper: copy.kpis.flaggedHelper,
 tone: 'risk',
 icon: IconFlag,
 },
 ], [averageScore, copy.kpis.activeFarmers, copy.kpis.activeHelper, copy.kpis.averageHelper, copy.kpis.averageScore, copy.kpis.flaggedAnomalies, copy.kpis.flaggedHelper, copy.kpis.pendingCertificates, copy.kpis.pendingHelper, filterCounts.active, filterCounts.flagged, pendingCertificates]);

 const whatsappMonitoring = useMemo(() => {
 const activeSessions = whatsappSessions.filter((session) => session.step === 'active').length;
 const needsFollowUp = whatsappSessions.filter((session) => session.step !== 'active').length;
 const linkedSessions = whatsappSessions.filter((session) => !!session.farmerId).length;
 const geofenceAttentionEvents = whatsappGpsReviewEvents || getWhatsAppGpsReviewEvents(whatsappEvents);
 const failedSendEvents = whatsappFailedSendEvents || getWhatsAppFailedSendEvents(whatsappEvents);
 const visibleEvents = whatsappActivityFilter === 'attention'
 ? geofenceAttentionEvents
 : whatsappActivityFilter === 'failed'
 ? failedSendEvents
 : whatsappEvents;
 const recentEvents = visibleEvents.slice(0, 5);
 const claimSummary = summarizeWhatsAppClaims(whatsappMessageClaims);

 return {
 activeSessions,
 needsFollowUp,
 linkedSessions,
 recentEvents,
 geofenceAttentionCount: geofenceAttentionEvents.length,
 failedSendCount: failedSendEvents.length,
 activeClaims: claimSummary.activeClaims,
 expiredClaims: claimSummary.expiredClaims,
 processedClaims: claimSummary.processedClaims,
 duplicateMessages: claimSummary.duplicateMessages,
 openClaims: claimSummary.openClaims.slice(0, 3),
 };
 }, [whatsappSessions, whatsappEvents, whatsappGpsReviewEvents, whatsappFailedSendEvents, whatsappMessageClaims, whatsappActivityFilter]);

 const whatsappActivityFilters = useMemo<Array<{ id: WhatsAppActivityFilter; label: string; count: number }>>(
 () => [
 { id: 'all', label: copy.whatsapp.all, count: whatsappEvents.length },
 { id: 'attention', label: copy.whatsapp.gpsReview, count: whatsappMonitoring.geofenceAttentionCount },
 { id: 'failed', label: copy.whatsapp.failed, count: whatsappMonitoring.failedSendCount },
 ],
 [
 copy.whatsapp.all,
 copy.whatsapp.failed,
 copy.whatsapp.gpsReview,
 whatsappEvents.length,
 whatsappMonitoring.failedSendCount,
 whatsappMonitoring.geofenceAttentionCount,
 ]
 );

 const farmerNameById = useMemo(() => {
 return new Map(farmers.map((farmer) => [farmer.id, farmer.name]));
 }, [farmers]);

 const selectedFarmerEvidence = useMemo(() => {
 return evidenceRecords
 .filter((record) => record.farmerId === selectedFarmer?.id)
 .slice(0, 5);
 }, [evidenceRecords, selectedFarmer]);

 const activeCertificate = useMemo(
 () => findFarmerCertificate(certificates, selectedFarmer?.id),
 [certificates, selectedFarmer]
 );

 const selectedFarmerCertificates = useMemo(() => {
 return certificates
 .filter((certificate) => certificate.farmerId === selectedFarmer?.id)
 .slice(0, 3);
 }, [certificates, selectedFarmer]);

 const selectedFarmerConsents = useMemo(() => {
 return consentRecords
 .filter((record) => record.farmerId === selectedFarmer?.id)
 .slice(0, 3);
 }, [consentRecords, selectedFarmer]);

 const openEvidenceRecords = useMemo(() => {
 const source = evidenceReviewQueueRecords || evidenceRecords;
 return source.filter((record) => {
 const reviewStatus = getEvidenceReviewStatus(record);
 return reviewStatus === 'pending' || reviewStatus === 'flagged';
 });
 }, [evidenceRecords, evidenceReviewQueueRecords]);

 const evidenceReviewQueue = useMemo(() => openEvidenceRecords.slice(0, 5), [openEvidenceRecords]);

 const identityConflictSessions = useMemo(
 () => whatsappSessions.filter((session) => session.identityStatus === 'conflict'),
 [whatsappSessions]
 );

 const auditAlerts = systemAuditAlertEvents ?? [];

 const focusSection = (sectionId: string) => {
 const section = document.getElementById(sectionId);
 section?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
 };

 // Highest-risk queues, ordered by open volume so the first screen shows work, not positioning copy.
 const triageItems = useMemo<TriageItem[]>(() => {
 const items: TriageItem[] = [
 {
 id: 'flagged',
 label: copy.triage.flagged,
 count: filterCounts.flagged,
 severity: 'critical',
 icon: IconFlag,
 onActivate: () => {
 setCurrentFilter('flagged');
 const firstFlagged = farmers.find((farmer) => farmer.status === FarmerStatus.FLAGGED);
 if (firstFlagged) {
 onSelectFarmer(firstFlagged.id);
 }
 focusSection('farmers-table-section');
 },
 },
 {
 id: 'evidence',
 label: copy.triage.evidence,
 count: openEvidenceRecords.length,
 severity: 'warning',
 icon: IconFlag,
 onActivate: () => focusSection('felda-evidence-review-queue'),
 },
 {
 id: 'gps',
 label: copy.triage.gps,
 count: whatsappMonitoring.geofenceAttentionCount,
 severity: 'warning',
 icon: IconPin,
 onActivate: () => {
 setWhatsappActivityFilter('attention');
 focusSection('whatsapp-activity-monitor');
 },
 },
 {
 id: 'failed-sends',
 label: copy.triage.failedSends,
 count: whatsappMonitoring.failedSendCount,
 severity: 'critical',
 icon: IconChat,
 onActivate: () => {
 setWhatsappActivityFilter('failed');
 focusSection('whatsapp-activity-monitor');
 },
 },
 {
 id: 'identity',
 label: copy.triage.identity,
 count: identityConflictSessions.length,
 severity: 'critical',
 icon: IconFarmers,
 onActivate: () => focusSection('whatsapp-operations-monitor'),
 },
 ];

 const severityWeight: Record<TriageSeverity, number> = { critical: 2, warning: 1 };
 return items.sort((a, b) => (
 b.count - a.count ||
 severityWeight[b.severity] - severityWeight[a.severity] ||
 a.label.localeCompare(b.label)
 ));
 }, [
 copy.triage.evidence,
 copy.triage.failedSends,
 copy.triage.flagged,
 copy.triage.gps,
 copy.triage.identity,
 farmers,
 filterCounts.flagged,
 identityConflictSessions.length,
 onSelectFarmer,
 openEvidenceRecords.length,
 whatsappMonitoring.failedSendCount,
 whatsappMonitoring.geofenceAttentionCount,
 ]);

 const openTriageCount = triageItems.reduce((total, item) => total + item.count, 0);
 const primaryTriageItem = triageItems[0];
 const PrimaryTriageIcon = primaryTriageItem?.icon ?? IconApproved;
 const secondaryTriageItems = triageItems.slice(1);
 const dataFreshnessLabel = isSampleData
 ? copy.provenance.sampleTitle
 : formatCertificateTimestamp(dataRefreshedAt, activeLanguage);

 // whispStatus is a descriptive sentence, not a code, so the badge has to match on it directly.
 const isWhispClear = selectedFarmer?.whispStatus?.startsWith('Clean') ?? false;

 // Every irreversible or certificate-changing action is staged here first and only
 // committed from the confirmation dialog, so it can never be triggered by a single click.
 const buildFarmerFacts = (farmer: Farmer) => [
 { label: copy.confirm.farmerLabel, value: farmer.name },
 { label: copy.confirm.licenceLabel, value: farmer.mpobLicence },
 { label: copy.confirm.statusLabel, value: getFarmerStatusLabel(farmer.status, copy) },
 { label: copy.confirm.scoreLabel, value: `${farmer.score} / 100` },
 ];

 const requestClearFlag = () => {
 setPendingAction({
 id: 'clear-flag',
 tone: 'approval',
 title: copy.confirm.clearFlagTitle,
 description: copy.confirm.clearFlagDescription,
 consequence: copy.confirm.clearFlagConsequence,
 facts: buildFarmerFacts(selectedFarmer),
 confirmLabel: copy.confirm.clearFlagConfirm,
 cancelLabel: copy.confirm.cancel,
 note: {
 label: copy.confirm.justificationLabel,
 placeholder: copy.confirm.justificationPlaceholder,
 required: true,
 initialValue: overrideText,
 requiredMessage: copy.confirm.justificationRequired,
 },
 onConfirm: (justification) => {
 setOverrideText(justification);
 onClearFlag(selectedFarmer.id, justification);
 setPendingAction(null);
 },
 });
 };

 const requestApplyOverride = () => {
 setPendingAction({
 id: 'apply-override',
 tone: 'destructive',
 title: copy.confirm.overrideTitle,
 description: copy.confirm.overrideDescription,
 consequence: copy.confirm.overrideConsequence,
 facts: buildFarmerFacts(selectedFarmer),
 confirmLabel: copy.confirm.overrideConfirm,
 cancelLabel: copy.confirm.cancel,
 note: {
 label: copy.confirm.justificationLabel,
 placeholder: copy.confirm.justificationPlaceholder,
 required: true,
 initialValue: overrideText,
 requiredMessage: copy.confirm.justificationRequired,
 },
 onConfirm: (justification) => {
 setOverrideText(justification);
 onApplyOverride(selectedFarmer.id, justification);
 setPendingAction(null);
 },
 });
 };

 const requestIssueCertificate = () => {
 setPendingAction({
 id: 'issue-certificate',
 tone: 'approval',
 title: copy.confirm.issueTitle,
 description: copy.confirm.issueDescription,
 consequence: copy.confirm.issueConsequence,
 facts: [
 ...buildFarmerFacts(selectedFarmer),
 { label: copy.confirm.evidenceDaysLabel, value: `${selectedFarmer.daysCollected}` },
 {
 label: copy.confirm.eligibilityLabel,
 value: complianceEvaluation?.certificationEligible ? copy.detail.yes : copy.detail.no,
 },
 ],
 confirmLabel: copy.confirm.issueConfirm,
 cancelLabel: copy.confirm.cancel,
 onConfirm: () => {
 onIssueCertificate(selectedFarmer.id);
 setPendingAction(null);
 },
 });
 };

 const requestEvidenceDecision = (
 record: EvidenceRecord,
 decision: 'approved' | 'flagged' | 'rejected'
 ) => {
 const decisionCopy =
 decision === 'approved'
 ? {
 tone: 'approval' as const,
 title: copy.confirm.approveTitle,
 description: copy.confirm.approveDescription,
 consequence: copy.confirm.approveConsequence,
 confirmLabel: copy.confirm.approveConfirm,
 }
 : decision === 'flagged'
 ? {
 tone: 'destructive' as const,
 title: copy.confirm.flagTitle,
 description: copy.confirm.flagDescription,
 consequence: copy.confirm.flagConsequence,
 confirmLabel: copy.confirm.flagConfirm,
 }
 : {
 tone: 'destructive' as const,
 title: copy.confirm.rejectTitle,
 description: copy.confirm.rejectDescription,
 consequence: copy.confirm.rejectConsequence,
 confirmLabel: copy.confirm.rejectConfirm,
 };

 setPendingAction({
 id: `evidence-${decision}-${record.id}`,
 tone: decisionCopy.tone,
 title: decisionCopy.title,
 description: decisionCopy.description,
 consequence: decisionCopy.consequence,
 facts: [
 { label: copy.confirm.farmerLabel, value: farmerNameById.get(record.farmerId) || record.farmerId },
 { label: copy.confirm.evidenceLabel, value: record.id },
 { label: copy.confirm.activityLabel, value: record.activityType },
 { label: copy.confirm.gpsLabel, value: formatLocationValidation(record) },
 ],
 confirmLabel: decisionCopy.confirmLabel,
 cancelLabel: copy.confirm.cancel,
 note: {
 label: copy.confirm.reviewNoteLabel,
 placeholder: copy.confirm.reviewNotePlaceholder,
 required: false,
 initialValue: evidenceReviewNotes,
 requiredMessage: copy.confirm.justificationRequired,
 },
 onConfirm: (notes) => {
 setEvidenceReviewNotes(notes);
 onReviewEvidence(record.id, decision, notes || undefined);
 setPendingAction(null);
 },
 });
 };

 const renderEvidenceReviewQueue = () => (
 <section
 className="bg-white border border-slate-200 rounded-xl p-4 xl:p-5 flex flex-col gap-4 shadow-sm"
 id="felda-evidence-review-queue"
 aria-labelledby="evidence-review-queue-title"
 >
 <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
 <div className="min-w-0">
 <span className="text-xs text-slate-500 block font-medium">
 {copy.detail.pendingEvidenceLabel}
 </span>
 <h4 id="evidence-review-queue-title" className="text-base font-semibold text-slate-950 mt-1">
 {copy.detail.evidenceWaitingTitle}
 </h4>
 <p className="text-xs text-slate-600 mt-1 leading-relaxed font-sans">
 {copy.detail.evidenceWaitingDesc}
 </p>
 </div>
 <span className="text-xs font-medium bg-amber-50 border border-amber-100 text-amber-800 px-2.5 py-1 rounded shrink-0">
 {evidenceReviewQueue.length} {copy.detail.open}
 </span>
 </div>

 <div className="flex flex-col gap-3 max-h-[560px] overflow-y-auto pr-1">
 {evidenceReviewQueue.length === 0 ? (
 <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-3 font-semibold">
 {copy.detail.noEvidenceWaiting}
 </div>
 ) : (
 evidenceReviewQueue.map((record) => {
 const reviewStatus = getEvidenceReviewStatus(record);
 const farmerName = farmerNameById.get(record.farmerId) || record.farmerId;
 const locationStatus = record.locationValidation?.status;
 const validationClass =
 locationStatus === 'outside_plot' || locationStatus === 'missing_location'
 ? 'bg-rose-50 border-rose-100 text-rose-700'
 : locationStatus === 'unknown_plot'
 ? 'bg-amber-50 border-amber-100 text-amber-800'
 : 'bg-emerald-50 border-emerald-100 text-emerald-700';
 const mediaMode = record.mediaStorage?.mode.replace(/_/g, ' ') || copy.detail.mediaPending;

 return (
 <article key={record.id} className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
 <header className="flex items-start justify-between gap-3">
 <div className="flex items-start gap-3 min-w-0">
 <span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${
 reviewStatus === 'flagged'
 ? 'bg-rose-50 border-rose-100 text-rose-700'
 : 'bg-amber-50 border-amber-100 text-amber-800'
 }`}>
 <IconFlag className="h-5 w-5" aria-hidden="true" />
 </span>
 <div className="min-w-0">
 <span className="text-sm font-semibold text-slate-950 block truncate">{farmerName}</span>
 <span className="text-xs text-slate-500 block mt-0.5">
 {record.activityType} &middot; {mediaMode}
 </span>
 </div>
 </div>
 <span className={`text-xs font-medium px-2 py-1 rounded border shrink-0 ${
 reviewStatus === 'flagged'
 ? 'bg-rose-50 border-rose-200 text-rose-700'
 : 'bg-amber-50 border-amber-200 text-amber-800'
 }`}>
 {reviewStatus}
 </span>
 </header>

 <p className="text-xs text-slate-700 mt-3 leading-relaxed">{record.summary}</p>

 <div className="flex flex-wrap gap-1.5 mt-3 text-xs">
 <span className={`px-2 py-1 rounded border font-semibold ${validationClass}`}>
 {formatLocationValidation(record)}
 </span>
 <span className="px-2 py-1 rounded border border-slate-200 bg-white text-slate-600 font-semibold">
 {copy.detail.size}: {formatEvidenceFileSize(record.mediaStorage?.sizeBytes)}
 </span>
 <span className="px-2 py-1 rounded border border-slate-200 bg-white text-slate-600 font-semibold">
 {formatEvidenceIntake(record)}
 </span>
 </div>

 <details className="mt-3 rounded-lg border border-slate-200 bg-white">
 <summary className="min-h-10 cursor-pointer list-none px-3 py-2 text-xs font-medium text-slate-700 flex items-center justify-between gap-2">
 <span>{copy.detail.evidenceDetails}</span>
 <IconChevronDown className="h-5 w-5 text-slate-400" aria-hidden="true" />
 </summary>
 <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-2 border-t border-slate-100 px-3 py-3 text-xs">
 <div className="min-w-0">
 <dt className="font-medium text-slate-500">{copy.detail.hash}</dt>
 <dd className="truncate text-slate-700">{record.mediaStorage?.sha256?.slice(0, 16) || copy.detail.none}</dd>
 </div>
 <div className="min-w-0">
 <dt className="font-medium text-slate-500">{copy.detail.phone}</dt>
 <dd className="truncate text-slate-700">{record.phoneNumber}</dd>
 </div>
 <div className="min-w-0">
 <dt className="font-medium text-slate-500">{copy.detail.msg}</dt>
 <dd className="truncate text-slate-700">{record.providerMessageId}</dd>
 </div>
 <div className="min-w-0">
 <dt className="font-medium text-slate-500">GPS</dt>
 <dd className="truncate text-slate-700">
 {record.location ? `${record.location.lat.toFixed(5)}, ${record.location.lng.toFixed(5)}` : copy.detail.noGps}
 </dd>
 </div>
 </dl>
 </details>

 <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-2 2xl:grid-cols-4 gap-2 mt-3">
 <button
 type="button"
 onClick={() => onOpenEvidenceMedia(record.id)}
 disabled={record.mediaStorage?.mode !== 'stored'}
 className={`h-11 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
 record.mediaStorage?.mode === 'stored'
 ? 'bg-white border border-slate-200 hover:border-indigo-300 text-slate-700 cursor-pointer'
 : 'bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed'
 }`}
 id={`btn-view-evidence-media-${record.id}`}
 >
 <IconSearch className="h-5 w-5" aria-hidden="true" />
 <span>{copy.detail.view}</span>
 </button>
 <button
 type="button"
 onClick={() => requestEvidenceDecision(record, 'approved')}
 className="h-11 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
 id={`btn-approve-evidence-${record.id}`}
 >
 <IconApproved className="h-5 w-5" aria-hidden="true" />
 <span>{copy.detail.approve}</span>
 </button>
 <button
 type="button"
 onClick={() => requestEvidenceDecision(record, 'flagged')}
 className="h-11 rounded-lg bg-amber-500 hover:bg-amber-400 text-white text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
 id={`btn-flag-evidence-${record.id}`}
 >
 <IconFlag className="h-5 w-5" aria-hidden="true" />
 <span>{copy.detail.flag}</span>
 </button>
 <button
 type="button"
 onClick={() => requestEvidenceDecision(record, 'rejected')}
 className="h-11 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
 id={`btn-reject-evidence-${record.id}`}
 >
 <IconWarning className="h-5 w-5" aria-hidden="true" />
 <span>{copy.detail.reject}</span>
 </button>
 </div>
 </article>
 );
 })
 )}
 </div>
 </section>
 );

 return (
 <div className="min-w-0 text-slate-900 flex flex-col gap-6" id="dealer-dashboard-workspace">

 {/* Data provenance: sample records must never be mistaken for live operational data */}
 {isSampleData ? (
 <div
 className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4"
 role="status"
 id="data-provenance-notice"
 >
 <IconWarning className="h-4 w-4 shrink-0 text-amber-700 mt-0.5" aria-hidden="true" />
 <div>
 <p className="text-sm font-semibold text-amber-900">{copy.provenance.sampleTitle}</p>
 <p className="text-xs text-amber-900 mt-1 leading-relaxed">
 {copy.provenance.sampleBody.replace('{date}', sampleDataAsOf ?? '-')}
 </p>
 </div>
 </div>
 ) : (
 <p className="data-provenance-live text-xs font-semibold text-slate-500" id="data-provenance-notice">
 <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-600" aria-hidden="true" />
 {copy.provenance.liveLabel} &middot; {copy.provenance.refreshedAt}:{' '}
 {formatCertificateTimestamp(dataRefreshedAt, activeLanguage)}
 </p>
 )}

 {/* Triage band: open review queues come before any explanatory content */}
 <section
 className="relative overflow-hidden rounded-xl border border-emerald-950/40 bg-emerald-950 p-5 md:p-6 text-white shadow-sm"
 id="auditor-triage-band"
 aria-labelledby="auditor-triage-title"
 >
 <div className="triage-layout relative z-10">
 <div className="triage-overview">
 <div className="flex flex-wrap items-center gap-2">
 <span className="inline-flex items-center gap-2 text-xs font-medium text-emerald-100">
 <IconVerified className="h-4 w-4" aria-hidden="true" />
 {copy.triage.trustBadge}
 </span>
 <span className="inline-flex items-center gap-2 rounded-lg bg-lime-300 text-emerald-950 px-3 py-1.5 text-xs font-semibold">
 <IconSignal className="h-4 w-4" aria-hidden="true" />
 {openTriageCount} {copy.triage.openItems}
 </span>
 </div>
 <h2 id="auditor-triage-title" className="type-page-title text-white mt-4">
 {openTriageCount === 0 ? copy.triage.clearTitle : copy.triage.activeTitle}
 </h2>
 <p className="text-sm text-emerald-50/80 mt-2 leading-relaxed font-sans">{copy.triage.subtitle}</p>
 </div>

 {openTriageCount === 0 ? (
 <div className="triage-actions rounded-xl border border-emerald-200/35 bg-emerald-300/12">
 <button
 type="button"
 onClick={() => setShowPendingActivities((current) => !current)}
 className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left text-sm font-semibold text-emerald-50 transition-colors hover:bg-white/8 cursor-pointer"
 id="btn-pending-activities"
 aria-expanded={showPendingActivities}
 aria-controls="pending-activities-list"
 >
 <span className="flex min-w-0 items-center gap-2">
 <IconList className="h-4 w-4 shrink-0" aria-hidden="true" />
 <span>{copy.triage.allClear}</span>
 </span>
 <IconChevronDown
 className={`h-5 w-5 shrink-0 text-emerald-100 transition-transform ${showPendingActivities ? 'rotate-180' : ''}`}
 aria-hidden="true"
 />
 </button>

 {showPendingActivities && (
 <div className="border-t border-emerald-200/25 px-4 py-3" id="pending-activities-list">
 {pendingComplianceActivities.length === 0 ? (
 <p className="text-xs font-medium text-emerald-50/80">
 {copy.triage.noPendingActivities}
 </p>
 ) : (
 <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
 {pendingComplianceActivities.map((activity) => (
 <li key={`${activity.category}-${activity.name}`} className="rounded-lg border border-white/12 bg-emerald-950/28 p-3">
 <div className="flex items-start justify-between gap-2">
 <span className="text-sm font-semibold text-white">{activity.name}</span>
 <span className="shrink-0 rounded border border-emerald-200/25 bg-white/8 px-1.5 py-0.5 text-xs font-medium text-emerald-50/75">
 {activity.anchor.split(' / ')[0]}
 </span>
 </div>
 <p className="mt-1 text-xs font-medium text-emerald-50/65">{activity.category}</p>
 <p className="mt-1 text-xs leading-relaxed text-emerald-50/78">{activity.details}</p>
 </li>
 ))}
 </ul>
 )}
 </div>
 )}
 </div>
 ) : (
 <div className="triage-actions" id="triage-queue-tiles">
 <button
 type="button"
 onClick={primaryTriageItem.onActivate}
 className={`triage-primary text-left rounded-xl border p-4 flex flex-col gap-3 transition-colors cursor-pointer ${
 primaryTriageItem.count === 0 ? TRIAGE_TILE_CLASSES.clear : TRIAGE_TILE_CLASSES[primaryTriageItem.severity]
 }`}
 id={`btn-triage-${primaryTriageItem.id}`}
 >
 <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${TRIAGE_ICON_CLASSES[primaryTriageItem.count === 0 ? 'clear' : primaryTriageItem.severity]}`}>
 <PrimaryTriageIcon className="h-5 w-5" aria-hidden="true" />
 </span>
 <span className="min-w-0 flex-1">
 <span className="block type-metric text-white" data-metric>{primaryTriageItem.count}</span>
 <span className="block text-xs font-semibold leading-snug mt-1">{primaryTriageItem.label}</span>
 </span>
 <IconArrowForward className="h-5 w-5 shrink-0 text-white/70" aria-hidden="true" />
 </button>

 <ul className="triage-secondary">
 {secondaryTriageItems.map((item) => {
 const Icon = item.icon;
 const itemTone = item.count === 0 ? 'clear' : item.severity;
 return (
 <li key={item.id}>
 <button
 type="button"
 onClick={item.onActivate}
 className={`w-full h-full text-left rounded-xl border p-3.5 flex items-center gap-3 transition-colors cursor-pointer ${TRIAGE_TILE_CLASSES[itemTone]}`}
 id={`btn-triage-${item.id}`}
 >
 <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${TRIAGE_ICON_CLASSES[itemTone]}`}>
 <Icon className="h-4 w-4" aria-hidden="true" />
 </span>
 <span className="min-w-0 flex-1">
 <span className="block text-xl font-semibold leading-none" data-metric>{item.count}</span>
 <span className="block text-xs font-semibold leading-snug mt-1">{item.label}</span>
 </span>
 <IconArrowForward className="h-5 w-5 shrink-0 text-white/70" aria-hidden="true" />
 </button>
 </li>
 );
 })}
 </ul>
 </div>
 )}

 <aside className="triage-evidence rounded-xl border border-white/15 bg-white/5 p-4" aria-label={copy.triage.signalTitle}>
 <div className="flex items-start justify-between gap-3">
 <div>
 <h3 className="text-sm font-semibold text-white">{copy.triage.signalTitle}</h3>
 <p className="text-xs text-emerald-50/75 mt-1">{copy.triage.signalMap}</p>
 </div>
 <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-emerald-800">
 <IconPin className="h-5 w-5" aria-hidden="true" />
 </span>
 </div>

 {/*
 A hand-drawn placeholder map used to sit here. It rendered identical artwork for
 every farmer while announcing itself as that farmer's plot, so it has been replaced
 by the plot facts the panel can actually verify. The real geometry is drawn by
 PolygonMap in the farmer detail panel below.
 */}
 <dl className="mt-3 border-t border-white/15 pt-3">
 <dt className="text-xs font-medium text-emerald-100/70">
 {copy.detail.plotPolygonMapLabel}
 </dt>
 <dd className="mt-1 text-sm font-semibold text-white">{selectedFarmer.plotLocation}</dd>
 <dd className="mt-1 text-xs font-semibold text-emerald-50/80">
 {selectedFarmer.plotArea} ha &middot; {selectedFarmer.polygonWaypoints.length} {copy.detail.waypoints}
 </dd>
 </dl>

 <div className="triage-evidence-signals mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
 {[
 { label: copy.provenance.refreshedAt, value: dataFreshnessLabel, icon: IconClock },
 { label: copy.detail.linkedFarmer, value: selectedFarmer.mpobLicence, icon: IconDatabase },
 { label: copy.confirm.gpsLabel, value: `${whatsappMonitoring.geofenceAttentionCount} ${copy.triage.openItems}`, icon: IconSignal },
 ].map((signal) => {
 const Icon = signal.icon;
 return (
 <div key={signal.label} className="min-w-0">
 <div className="flex items-center gap-2 text-emerald-100">
 <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
 <span className="text-xs font-medium leading-snug">{signal.label}</span>
 </div>
 <p className="text-xs font-semibold text-white/85 mt-1 break-words">{signal.value}</p>
 </div>
 );
 })}
 </div>
 </aside>
 </div>

 {auditAlerts.length > 0 && (
 <div className="relative z-10 mt-5 rounded-xl border border-amber-200/45 bg-amber-300/12 p-4" id="system-audit-alerts">
 <h3 className="text-xs font-semibold text-amber-100">
 {copy.triage.alertsTitle} ({auditAlerts.length})
 </h3>
 <ul className="mt-2 flex flex-col gap-1.5">
 {auditAlerts.slice(0, 3).map((event) => (
 <li key={event.id} className="text-xs text-amber-50 leading-relaxed">
 <span className="font-semibold ">{event.severity}</span> &middot; {event.message}
 <span className="text-amber-100/80"> ({event.createdAt.replace('T', ' ').substring(0, 16)})</span>
 </li>
 ))}
 </ul>
 {auditAlerts.length > 3 && (
 <p className="mt-2 text-xs font-semibold text-amber-100">
 +{auditAlerts.length - 3} {copy.triage.alertsMore}
 </p>
 )}
 </div>
 )}
 </section>

 {/* Metric strip */}
 <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4" id="kpi-cards" aria-label="Dashboard metrics">
 {kpiCards.map((card) => {
 const Icon = card.icon;
 const toneClasses = KPI_TONE_CLASSES[card.tone];
 return (
 <div
 key={card.label}
 className="metric-card bg-white border border-slate-200 rounded-xl p-5 relative overflow-hidden shadow-sm"
 >
 <span className={`metric-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${toneClasses.icon}`}>
 <Icon className="h-5 w-5" aria-hidden="true" />
 </span>
 <div className="min-w-0">
 <span className="metric-label text-sm text-slate-600 font-medium font-sans">{card.label}</span>
 <div className="flex flex-col items-start gap-1 mt-3">
 <span className={`type-metric ${toneClasses.value}`} data-metric>
 {card.value}
 {card.suffix && <span className="text-xs font-medium text-slate-500"> {card.suffix}</span>}
 </span>
 <span className={`text-xs font-semibold ${toneClasses.helper}`}>{card.helper}</span>
 </div>
 </div>
 </div>
 );
 })}
 </div>

 {/* Registry tools and full-width farmer table */}
 <div
 className="flex flex-col gap-5"
 id="dashboard-workbench"
 >

 {/* Evidence queue and registry filters */}
 <div className="registry-tools">
 {renderEvidenceReviewQueue()}

 <section
 className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col gap-4"
 id="farmer-filter-panel"
 aria-label={copy.filters.farmerOverview}
 >
 <h3 className="type-card-heading">{activeLanguage === 'EN' ? 'Filter farmers' : 'Tapis pekebun'}</h3>
 <div className="flex flex-col gap-1">
 <div className="flex flex-col gap-1 mt-2">
 <button
 onClick={() => setCurrentFilter('all')}
 className={`w-full min-h-11 text-left px-3.5 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-between cursor-pointer ${
 currentFilter === 'all' ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
 }`}
 >
 <span className="flex items-center gap-2">
 <IconList className="h-5 w-5 text-slate-400" aria-hidden="true" />
 {copy.filters.farmerOverview}
 </span>
 <span className={`text-xs px-1.5 py-0.5 rounded ${
 currentFilter === 'all' ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-100 text-slate-500'
 }`}>{filterCounts.all}</span>
 </button>

 <button
 onClick={() => setCurrentFilter('certified')}
 className={`w-full min-h-11 text-left px-3.5 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-between cursor-pointer ${
 currentFilter === 'certified' ? 'bg-emerald-50 text-emerald-700 font-semibold' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
 }`}
 >
 <span className="flex items-center gap-2">
 <IconApproved className="h-5 w-5 text-emerald-600" aria-hidden="true" />
 {copy.filters.complianceCertificates}
 </span>
 <span className={`text-xs px-1.5 py-0.5 rounded ${
 currentFilter === 'certified' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
 }`}>{filterCounts.certified}</span>
 </button>

 <button
 onClick={() => setCurrentFilter('pendingCertificates')}
 className={`w-full min-h-11 text-left px-3.5 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-between cursor-pointer ${
 currentFilter === 'pendingCertificates' ? 'bg-amber-50 text-amber-700 font-semibold' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
 }`}
 >
 <span className="flex items-center gap-2">
 <IconCertificate className="h-5 w-5 text-amber-600" aria-hidden="true" />
 {copy.filters.pendingCertificates}
 </span>
 <span className={`text-xs px-1.5 py-0.5 rounded ${
 currentFilter === 'pendingCertificates' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'
 }`}>{filterCounts.pendingCertificates}</span>
 </button>

 <button
 onClick={() => setCurrentFilter('flagged')}
 className={`w-full min-h-11 text-left px-3.5 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-between cursor-pointer ${
 currentFilter === 'flagged' ? 'bg-rose-50 text-rose-700 font-semibold' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
 }`}
 >
 <span className="flex items-center gap-2">
 <IconFlag className="h-5 w-5 text-rose-600" aria-hidden="true" />
 {copy.filters.flaggedAnomalies}
 </span>
 <span className={`text-xs px-1.5 py-0.5 rounded ${
 currentFilter === 'flagged' ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-500'
 }`}>{filterCounts.flagged}</span>
 </button>
 </div>
 </div>

 <div className="flex flex-col gap-1 border-t border-slate-100 pt-4">
 <div className="flex flex-col gap-1 mt-2">
 <button
 onClick={() => setCurrentFilter('active')}
 className={`w-full min-h-11 text-left px-3.5 py-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-between cursor-pointer ${
 currentFilter === 'active' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-500 hover:bg-slate-100'
 }`}
 >
 <span>{copy.filters.activeFarmers}</span>
 <span className="text-xs text-slate-400">{filterCounts.active}</span>
 </button>

 <button
 onClick={() => setCurrentFilter('inactive')}
 className={`w-full min-h-11 text-left px-3.5 py-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-between cursor-pointer ${
 currentFilter === 'inactive' ? 'bg-slate-100 text-slate-700' : 'text-slate-500 hover:bg-slate-100'
 }`}
 >
 <span>{copy.filters.inactive14Days}</span>
 <span className="text-xs text-slate-400">{filterCounts.inactive}</span>
 </button>

 <button
 onClick={() => setCurrentFilter('scoreUnder70')}
 className={`w-full min-h-11 text-left px-3.5 py-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-between cursor-pointer ${
 currentFilter === 'scoreUnder70' ? 'bg-amber-50 text-amber-700' : 'text-slate-500 hover:bg-slate-100'
 }`}
 >
 <span>{copy.filters.scoreBelow70}</span>
 <span className="text-xs text-slate-400">{filterCounts.scoreUnder70}</span>
 </button>
 </div>
 </div>

 <p className="text-xs text-slate-500 leading-relaxed font-sans border-t border-slate-100 pt-4">
 {copy.filters.auditNotice}
 </p>
 </section>
 </div>

 {/* Farmer registry */}
 <div className="min-w-0 flex flex-col gap-4" id="farmers-table-section">

 {/* Table Search & Title */}
 <div className="registry-toolbar flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
 <div className="flex flex-col gap-0.5">
 <div className="flex flex-wrap items-center gap-2">
 <h2 className="type-section-title text-slate-950">{copy.table.title}</h2>
 <span className="text-xs text-slate-500" aria-live="polite">
 {copy.table.showing} {sortedFarmers.length} {copy.table.of} {farmers.length}
 </span>
 </div>
 <span className="text-xs text-slate-500">{copy.table.rowHint}</span>
 </div>
 <div className="relative flex-grow sm:flex-grow-0 sm:w-64">
 <IconSearch className="h-4 w-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
 <input
 type="text"
 placeholder={copy.table.searchPlaceholder}
 aria-label={copy.table.searchPlaceholder}
 value={searchQuery}
 onChange={(e) => setSearchQuery(e.target.value)}
 className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-4 h-11 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
 id="dashboard-search-input"
 />
 </div>
 </div>

 {/* Main Table */}
 <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
 <div className="registry-table-scroll overflow-x-auto" tabIndex={0} role="region" aria-label={copy.table.caption}>
 <table className="w-full text-left border-collapse" id="farmers-data-table">
 <caption className="sr-only">{copy.table.caption}</caption>
 <thead>
 <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600 font-medium">
 <th scope="col" className="py-2 px-4 w-12">
 <span className="sr-only">{copy.table.selectRow}</span>
 </th>
 {farmerColumns.map((column) => {
 const isSorted = farmerSort.key === column.key;
 const SortIcon = !isSorted ? IconSort : farmerSort.direction === 'asc' ? IconArrowUp : IconArrowDown;
 return (
 <th
 key={column.key}
 scope="col"
 className="py-2 px-4"
 aria-sort={isSorted ? (farmerSort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
 >
 <button
 type="button"
 onClick={() => toggleFarmerSort(column.key)}
 className={`inline-flex min-h-11 items-center gap-1.5 rounded px-1 text-left transition-colors cursor-pointer ${
 isSorted ? 'text-slate-900' : 'text-slate-600 hover:text-slate-900'
 }`}
 id={`btn-sort-${column.key}`}
 >
 <span>{column.label}</span>
 <SortIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
 {isSorted && (
 <span className="sr-only">
 {farmerSort.direction === 'asc' ? copy.table.sortAscending : copy.table.sortDescending}
 </span>
 )}
 </button>
 </th>
 );
 })}
 <th scope="col" className="py-2 px-4 text-right">{copy.table.actions}</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-slate-100 text-slate-700">
 {sortedFarmers.length === 0 ? (
 <tr>
 <td colSpan={9} className="py-10 px-4 text-center text-sm text-slate-600">
 <IconSearch className="mx-auto mb-3 h-6 w-6 text-slate-400" aria-hidden="true" />
 <p>{copy.table.noMatches}</p>
 <button type="button" className="mt-3 min-h-11 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-emerald-700 hover:bg-emerald-50" onClick={() => { setSearchQuery(''); setCurrentFilter('all'); }}>
 {activeLanguage === 'EN' ? 'Clear search and filters' : 'Kosongkan carian dan penapis'}
 </button>
 </td>
 </tr>
 ) : (
 sortedFarmers.map((f) => {
 const isSelected = f.id === selectedFarmerId;
 return (
 <tr
 key={f.id}
 onClick={() => onSelectFarmer(f.id)}
 data-selected={isSelected || undefined}
 className={`hover:bg-slate-50 transition-colors cursor-pointer text-xs ${
 isSelected ? 'bg-indigo-50/40 border-l-2 border-indigo-600 font-medium' : ''
 }`}
 >
 <td className="py-3 px-4">
 <input
 type="radio"
 name="selected-farmer-row"
 checked={isSelected}
 onChange={() => onSelectFarmer(f.id)}
 onClick={(event) => event.stopPropagation()}
 className="h-5 w-5 cursor-pointer accent-indigo-600"
 aria-label={`${copy.table.selectRow}: ${f.name}`}
 id={`row-select-${f.id}`}
 />
 </td>
 <td className="py-3 px-4 font-medium text-slate-800">
 {f.name}
 {isSelected && (
 <span className="ml-2 rounded bg-indigo-100 px-1.5 py-0.5 text-xs font-medium text-indigo-800 align-middle">
 {copy.table.selectedRow}
 </span>
 )}
 </td>
 <td className="py-3 px-4 font-semibold text-slate-600">{f.mpobLicence}</td>
 <td className="py-3 px-4 text-slate-600">{f.plotArea.toFixed(1)}</td>
 <td className={`py-3 px-4 font-semibold ${
 f.score >= 75 ? 'text-emerald-600' : f.score >= 50 ? 'text-amber-600' : 'text-rose-600'
 }`}>
 {f.score}
 </td>
 <td className="py-3 px-4 text-slate-600">{f.daysCollected}</td>
 <td className="py-3 px-4 text-slate-600">{f.lastActivityDate}</td>
 <td className="py-3 px-4">
 <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
 f.status === FarmerStatus.CERTIFIED
 ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
 : f.status === FarmerStatus.FLAGGED
 ? 'bg-rose-50 border border-rose-200 text-rose-700 font-semibold'
 : f.status === FarmerStatus.ELIGIBLE_SOON
 ? 'bg-amber-50 border border-amber-200 text-amber-800'
 : f.status === FarmerStatus.INACTIVE
 ? 'bg-slate-100 border border-slate-200 text-slate-600'
 : 'bg-blue-50 border border-blue-200 text-blue-700'
 }`}>
 {getFarmerStatusLabel(f.status, copy)}
 </span>
 </td>
 <td className="py-3 px-4">
 <div className="flex flex-wrap justify-end gap-2">
 <button
 type="button"
 onClick={(event) => {
 event.stopPropagation();
 onSelectFarmer(f.id);
 focusSection('farmer-detail-drilldown');
 }}
 className="h-11 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:border-indigo-300 transition-colors cursor-pointer"
 id={`btn-row-detail-${f.id}`}
 >
 {copy.table.viewDetail}
 </button>
 <button
 type="button"
 onClick={(event) => {
 event.stopPropagation();
 onViewCertificate(f.id);
 }}
 className="h-11 px-3 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-700 transition-colors cursor-pointer inline-flex items-center gap-1.5"
 id={`btn-row-review-${f.id}`}
 >
 <span>{copy.table.openReview}</span>
 <IconArrowForward className="h-5 w-5" aria-hidden="true" />
 </button>
 </div>
 </td>
 </tr>
 );
 })
 )}
 </tbody>
 </table>
 </div>
 </div>
 </div>
 </div>

 {/* Drill-down Detail Panel (Farmer Detail) */}
 <div className="border-t border-slate-200 pt-6 mt-2" id="farmer-detail-drilldown">
 <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
 <div>
 <h3 className="text-base font-semibold text-slate-800 flex flex-wrap items-center gap-2 mt-0.5">
 {copy.detail.farmerDetail}: <span className="text-indigo-600 font-semibold">{selectedFarmer.name}</span>
 <span className="text-xs bg-slate-50 border border-slate-200 text-slate-600 px-2 py-0.5 rounded font-normal">
 {copy.detail.status}: {getFarmerStatusLabel(selectedFarmer.status, copy)}
 </span>
 </h3>
 </div>

 </div>

 <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" id="audit-detail-grid">

 {/* Detail left block: Anomaly or Compliance Summary */}
 <div className="flex flex-col gap-4">

 {/* If Flagged */}
 {selectedFarmer.status === FarmerStatus.FLAGGED && (
 <div className="bg-rose-50/50 border border-rose-200 rounded-2xl p-5 flex flex-col gap-3 shadow-sm" id="flagged-details-card">
 <div className="flex items-center gap-2 text-rose-600">
 <IconWarning className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
 <span className="text-xs font-medium">{copy.detail.anomalyAlert}</span>
 </div>

 {selectedFarmer.anomalies.map((an, idx) => (
 <div key={idx} className="flex flex-col gap-2 font-sans text-xs">
 <p className="text-slate-700 leading-relaxed bg-white p-3 rounded-lg border border-rose-100">
 {an.description}
 </p>
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
 <div className="bg-white border border-slate-200 p-3 rounded-lg">
 <span className="text-xs text-slate-400 block font-medium">{copy.detail.probableCause}</span>
 <span className="text-slate-700 font-semibold block mt-1 leading-normal">{an.probableCause}</span>
 </div>
 <div className="bg-white border border-slate-200 p-3 rounded-lg">
 <span className="text-xs text-slate-400 block font-medium">{copy.detail.recommendedAction}</span>
 <span className="text-amber-700 font-semibold block mt-1 leading-normal">{an.recommendedAction}</span>
 </div>
 </div>
 </div>
 ))}

 {/* FELDA auditor override actions */}
 <div className="mt-2.5 pt-3 border-t border-slate-200 flex flex-col gap-3">
 <span className="text-xs text-slate-400 block font-medium">{copy.detail.resolutionPanel}</span>
 <div className="flex flex-col gap-2">
 <textarea
 value={overrideText}
 onChange={(e) => setOverrideText(e.target.value)}
 placeholder={copy.detail.overridePlaceholder}
 className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs font-sans text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
 rows={2}
 />
 <div className="flex flex-col sm:flex-row gap-2">
 <button
 type="button"
 onClick={requestClearFlag}
 className="min-h-11 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium py-2 px-4 rounded-lg shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer"
 id="btn-auditor-clear-flag"
 >
 <IconApproved className="h-5 w-5" aria-hidden="true" />
 <span>{copy.detail.clearFlag}</span>
 </button>
 <button
 type="button"
 onClick={requestApplyOverride}
 className="min-h-11 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium py-2 px-4 rounded-lg border border-slate-200 shadow-sm transition-all cursor-pointer"
 id="btn-auditor-apply-override"
 >
 {copy.detail.logOverride}
 </button>
 </div>
 </div>
 </div>
 </div>
 )}

 {/* If Certified */}
 {selectedFarmer.status === FarmerStatus.CERTIFIED && (
 <div className="bg-emerald-50/50 border border-emerald-200 rounded-2xl p-5 flex flex-col gap-3 shadow-sm" id="certified-details-card">
 <div className="flex items-center gap-2 text-emerald-700">
 <IconApproved className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
 <span className="text-xs font-medium">{copy.detail.certificateValid}</span>
 </div>
 <div className="text-xs text-slate-700 leading-relaxed font-sans bg-white p-3 rounded-lg border border-emerald-100">
 {copy.detail.certificateLabel} <strong className="text-emerald-700">{selectedFarmer.mspoCertId}</strong> {copy.detail.certificateActiveText}
 </div>

 <div className="grid grid-cols-2 gap-3 text-center">
 <div className="bg-white border border-slate-200 rounded-lg p-2.5">
 <span className="text-xs text-slate-400 block font-medium">{copy.detail.activeScore}</span>
 <span className="text-sm font-semibold text-emerald-700 block mt-0.5">{selectedFarmer.score} / 100</span>
 </div>
 <div className="bg-white border border-slate-200 rounded-lg p-2.5">
 <span className="text-xs text-slate-400 block font-medium">{copy.detail.evidenceLogs}</span>
 <span className="text-sm font-semibold text-slate-700 block mt-0.5">{selectedFarmer.daysCollected} {copy.table.days.toLowerCase()}</span>
 </div>
 </div>

 <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
 <button
 onClick={() => setShowCertModal(true)}
 className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-sans text-xs font-semibold py-2.5 px-4 rounded-xl shadow-sm hover:shadow transition-all cursor-pointer border border-emerald-700"
 id="btn-view-print-cert"
 >
 <IconCertificate className="h-6 w-6" aria-hidden="true" />
 <span>{copy.detail.viewPrintCert}</span>
 </button>
 <button
 onClick={handleDownloadCertificate}
 className="flex items-center justify-center gap-2 bg-white hover:bg-emerald-50 text-emerald-800 font-sans text-xs font-semibold py-2.5 px-4 rounded-xl shadow-sm hover:shadow transition-all cursor-pointer border border-emerald-200"
 id="btn-download-cert"
 >
 <IconDownload className="h-6 w-6" aria-hidden="true" />
 <span>{activeLanguage === 'EN' ? 'Download certificate' : 'Muat turun sijil'}</span>
 </button>
 </div>
 </div>
 )}

 {/* If general In Progress */}
 {selectedFarmer.status !== FarmerStatus.FLAGGED && selectedFarmer.status !== FarmerStatus.CERTIFIED && (
 <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 flex flex-col gap-3 shadow-sm" id="progress-details-card">
 <div className="flex items-center gap-2 text-slate-700">
 <IconBook className="h-4 w-4 text-indigo-600" aria-hidden="true" />
 <span className="text-xs font-medium">{copy.detail.complianceOnTrack}</span>
 </div>
 <p className="text-xs text-slate-500 leading-relaxed font-sans">
 {copy.detail.progressText}
 </p>

 <div className="h-2 bg-slate-300 rounded-full overflow-hidden relative mt-1">
 <div
 className="h-full bg-emerald-500 rounded-full absolute left-0 top-0 transition-all duration-500"
 style={{ width: `${(selectedFarmer.daysCollected / 90) * 100}%` }}
 />
 </div>
 <div className="flex justify-between text-xs text-slate-500">
 <span>{copy.detail.dayLogged.replace('{n}', String(selectedFarmer.daysCollected))}</span>
 <span>{copy.detail.day90Ready}</span>
 </div>
 </div>
 )}

 {/* Smart-ESGP Compliance Pipeline Widget */}
 <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col gap-3 shadow-sm">
 <div className="flex justify-between items-center border-b border-slate-100 pb-2">
 <span className="text-xs text-slate-400 block font-medium">{copy.detail.pipelineTitle}</span>
 <span className="text-xs font-medium bg-indigo-50 border border-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded ">
 MSPO 2.0 & EUDR
 </span>
 </div>

 {/* Tab Selector */}
 <div className="grid grid-cols-3 gap-1.5 bg-slate-50 border border-slate-200 p-1 rounded-lg">
 {esgCategories.map((cat) => {
 const isActive = dashboardEsgTab === cat.id;
 return (
 <button
 key={cat.id}
 onClick={() => setDashboardEsgTab(cat.id)}
 className={`min-h-11 px-1 text-center rounded-md transition-all cursor-pointer font-sans text-xs font-medium flex items-center justify-center gap-1 ${
 isActive
 ? cat.bgActive + ' shadow-sm'
 : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100/50'
 }`}
 id={`db-esg-tab-${cat.id.toLowerCase()}`}
 >
 {cat.id === 'E' ? <IconEnvironment className="h-5 w-5" aria-hidden="true" /> : cat.id === 'S' ? <IconFarmers className="h-5 w-5" aria-hidden="true" /> : <IconGovernance className="h-5 w-5" aria-hidden="true" />}
 <span>{cat.id}</span>
 </button>
 );
 })}
 </div>

 {/* Active Category Header */}
 {activeDashboardCategory && (
 <div className="flex flex-col gap-2">
 <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-500">
 <strong className="text-slate-700 block font-medium mb-0.5">{activeDashboardCategory.title}</strong>
 {activeDashboardCategory.subtitle}
 </div>

 {/* List of micro checkpoints */}
 <div className="flex flex-col gap-2.5 mt-1 overflow-y-auto max-h-[160px] pr-1">
 {activeDashboardCategory.items.map((item, idx) => (
 <div key={idx} className="flex items-start gap-2">
 <div className="mt-0.5 flex-shrink-0">
 {item.met ? (
 <IconApproved className="h-4 w-4 text-emerald-600" aria-hidden="true" />
 ) : (
 <IconWarning className="h-4 w-4 text-slate-400" aria-hidden="true" />
 )}
 </div>
 <div className="flex-grow text-xs">
 <div className="flex justify-between items-start gap-2">
 <span className={`font-semibold ${item.met ? 'text-slate-800' : 'text-slate-400 font-medium'}`}>
 {item.name}
 </span>
 <span className="text-xs text-indigo-700 font-semibold bg-indigo-50 border border-indigo-100/50 px-1 rounded shrink-0">
 {item.anchor.split(' / ')[0]}
 </span>
 </div>
 <p className="text-slate-400 text-xs mt-0.5 leading-relaxed font-sans">{item.details}</p>
 </div>
 </div>
 ))}
 </div>
 </div>
 )}
 </div>

 {/* Server-side Compliance Engine Rules */}
 <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col gap-3 shadow-sm" id="compliance-engine-rule-panel">
 <div className="flex justify-between items-center border-b border-slate-100 pb-2">
 <div>
 <span className="text-xs text-slate-400 block font-medium">{copy.detail.rulesEngineLabel}</span>
 <h4 className="text-sm font-semibold text-slate-800">{copy.detail.complianceEvaluationTitle}</h4>
 </div>
 <span className={`text-xs font-medium px-1.5 py-0.5 rounded border ${
 complianceEvaluation?.certificationEligible
 ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
 : complianceEvaluation?.status === FarmerStatus.FLAGGED
 ? 'bg-rose-50 border-rose-200 text-rose-700'
 : 'bg-amber-50 border-amber-200 text-amber-700'
 }`}>
 {getFarmerStatusLabel(complianceEvaluation?.status || selectedFarmer.status, copy)}
 </span>
 </div>

 {!complianceEvaluation ? (
 <div className="text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-xl p-3 font-semibold">
 {copy.detail.complianceNotAvailable}
 </div>
 ) : (
 <div className="flex flex-col gap-2">
 <div className="grid grid-cols-3 gap-2">
 <div className="bg-slate-50 border border-slate-200 rounded-lg p-2">
 <span className="text-xs text-slate-400 font-medium block">{copy.detail.scoreDelta}</span>
 <span className="text-sm font-semibold text-slate-800 block mt-0.5">+{complianceEvaluation.scoreDelta}</span>
 </div>
 <div className="bg-slate-50 border border-slate-200 rounded-lg p-2">
 <span className="text-xs text-slate-400 font-medium block">{copy.detail.rules}</span>
 <span className="text-sm font-semibold text-slate-800 block mt-0.5">
 {complianceEvaluation.rules.filter((rule) => rule.passed).length}/{complianceEvaluation.rules.length}
 </span>
 </div>
 <div className="bg-slate-50 border border-slate-200 rounded-lg p-2">
 <span className="text-xs text-slate-400 font-medium block">{copy.detail.eligible}</span>
 <span className={`text-sm font-semibold block mt-0.5 ${complianceEvaluation.certificationEligible ? 'text-emerald-700' : 'text-amber-700'}`}>
 {complianceEvaluation.certificationEligible ? copy.detail.yes : copy.detail.no}
 </span>
 </div>
 </div>

 <div className="flex flex-col gap-2 max-h-[180px] overflow-y-auto pr-1">
 {complianceEvaluation.rules.map((rule) => (
 <div key={rule.id} className="flex items-start gap-2 bg-slate-50 border border-slate-200 rounded-xl p-3">
 {rule.passed ? (
 <IconApproved className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" aria-hidden="true" />
 ) : (
 <IconWarning className="h-4 w-4 text-rose-500 mt-0.5 flex-shrink-0" aria-hidden="true" />
 )}
 <div className="min-w-0">
 <span className="text-xs font-medium text-slate-700 block">{rule.label}</span>
 <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{rule.details}</p>
 </div>
 </div>
 ))}
 </div>
 </div>
 )}
 </div>

 {/* Certificate Registry */}
 <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col gap-3 shadow-sm" id="certificate-registry-panel">
 <div className="flex justify-between items-center border-b border-slate-100 pb-2">
 <div>
 <span className="text-xs text-slate-400 block font-medium">{copy.detail.certificationDecisionLabel}</span>
 <h4 className="text-sm font-semibold text-slate-800">{copy.detail.certIssuanceTitle}</h4>
 <p className="text-xs text-slate-500 mt-1 font-sans">{copy.detail.certIssuanceDesc}</p>
 </div>
 <button
 type="button"
 onClick={requestIssueCertificate}
 disabled={!complianceEvaluation?.certificationEligible && selectedFarmer.status !== FarmerStatus.CERTIFIED}
 className={`h-11 shrink-0 text-xs font-medium px-4 rounded-lg border flex items-center gap-1.5 transition-colors ${
 complianceEvaluation?.certificationEligible || selectedFarmer.status === FarmerStatus.CERTIFIED
 ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-700 cursor-pointer'
 : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
 }`}
 id="btn-issue-certificate"
 >
 <IconCertificate className="h-5 w-5" aria-hidden="true" />
 <span>{copy.detail.issue}</span>
 </button>
 </div>

 <div className="flex flex-col gap-2 max-h-[160px] overflow-y-auto pr-1">
 {selectedFarmerCertificates.length === 0 ? (
 <div className="text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-xl p-3 font-semibold">
 {copy.detail.noCertYet}
 </div>
 ) : (
 selectedFarmerCertificates.map((certificate) => (
 <div key={certificate.id} className="bg-slate-50 border border-slate-200 rounded-xl p-3">
 <div className="flex items-center justify-between gap-3">
 <span className="text-xs font-medium text-slate-800">{certificate.certificateNumber}</span>
 <span className="text-xs font-medium px-2 py-0.5 rounded border bg-emerald-50 border-emerald-200 text-emerald-700">
 {certificate.status}
 </span>
 </div>
 <div className="grid grid-cols-2 gap-2 mt-2 text-xs text-slate-500">
 <span className="truncate">{copy.detail.issued}: {certificate.issuedAt.replace('T', ' ').substring(0, 10)}</span>
 <span className="truncate">{copy.detail.expires}: {certificate.expiresAt.replace('T', ' ').substring(0, 10)}</span>
 <span className="truncate">{copy.detail.hash}: {certificate.verificationHash.slice(0, 12)}</span>
 <span className="truncate">{copy.detail.by}: {certificate.issuedBy}</span>
 </div>
 </div>
 ))
 )}
 </div>
 </div>

 {/* PDPA Consent Registry */}
 <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col gap-3 shadow-sm" id="pdpa-consent-registry-panel">
 <div className="flex justify-between items-center border-b border-slate-100 pb-2">
 <div>
 <span className="text-xs text-slate-400 block font-medium">{copy.detail.farmerConsentLabel}</span>
 <h4 className="text-sm font-semibold text-slate-800">{copy.detail.pdpaTitle}</h4>
 <p className="text-xs text-slate-500 mt-1 font-sans">{copy.detail.pdpaDesc}</p>
 </div>
 <span className={`text-xs font-medium px-1.5 py-0.5 rounded border ${
 selectedFarmerConsents.length > 0
 ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
 : 'bg-amber-50 border-amber-200 text-amber-700'
 }`}>
 {selectedFarmerConsents.length > 0 ? copy.detail.recorded : copy.detail.missing}
 </span>
 </div>

 <div className="flex flex-col gap-2 max-h-[170px] overflow-y-auto pr-1">
 {selectedFarmerConsents.length === 0 ? (
 <div className="text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-xl p-3 font-semibold">
 {copy.detail.noConsent}
 </div>
 ) : (
 selectedFarmerConsents.map((record) => (
 <div key={record.id} className="bg-slate-50 border border-slate-200 rounded-xl p-3">
 <div className="flex items-center justify-between gap-3">
 <span className="text-xs font-medium text-slate-800">{record.consentVersion}</span>
 <span className="text-xs font-medium px-2 py-0.5 rounded border bg-emerald-50 border-emerald-200 text-emerald-700">
 {record.language}
 </span>
 </div>
 <p className="text-xs text-slate-600 mt-1 leading-relaxed">
 {record.consentText}
 </p>
 <div className="grid grid-cols-2 gap-2 mt-2 text-xs text-slate-500">
 <span className="truncate">{copy.detail.response}: {record.responseText}</span>
 <span className="truncate">{copy.detail.at}: {record.consentedAt.replace('T', ' ').substring(0, 16)}</span>
 <span className="truncate">{copy.detail.msg}: {record.providerMessageId}</span>
 <span className="truncate">{copy.detail.phone}: {record.phoneNumber}</span>
 </div>
 </div>
 ))
 )}
 </div>
 </div>

 {/* Structured Evidence Register */}
 <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col gap-3 shadow-sm" id="structured-evidence-register">
 <div className="flex justify-between items-center border-b border-slate-100 pb-2">
 <div>
 <span className="text-xs text-slate-400 block font-medium">{copy.detail.acceptedEvidenceLabel}</span>
 <h4 className="text-sm font-semibold text-slate-800">{copy.detail.approvedProofTitle}</h4>
 <p className="text-xs text-slate-500 mt-1 font-sans">{copy.detail.approvedProofDesc}</p>
 </div>
 <span className="text-xs font-medium bg-emerald-50 border border-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded ">
 {selectedFarmerEvidence.length} {copy.detail.records}
 </span>
 </div>

 <div className="flex flex-col gap-2 max-h-[170px] overflow-y-auto pr-1">
 {selectedFarmerEvidence.length === 0 ? (
 <div className="text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-xl p-3 font-semibold">
 {copy.detail.noApprovedProof}
 </div>
 ) : (
 selectedFarmerEvidence.map((record) => (
 <div key={record.id} className="bg-slate-50 border border-slate-200 rounded-xl p-3">
 <div className="flex items-center justify-between gap-3">
 <span className="text-xs font-medium text-slate-800 capitalize">{record.activityType}</span>
 <span className={`text-xs font-medium px-2 py-0.5 rounded border ${
 record.verificationStatus === 'verified'
 ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
 : 'bg-amber-50 border-amber-200 text-amber-700'
 }`}>
 {record.verificationStatus.replace('_', ' ')}
 </span>
 </div>
 <p className="text-xs text-slate-600 mt-1 leading-relaxed">
 {record.summary}
 </p>
 <div className="grid grid-cols-2 gap-2 mt-2 text-xs text-slate-500">
 <span className="truncate">{copy.detail.media}: {record.mediaId || copy.detail.none}</span>
 <span className="truncate">{copy.detail.stored}: {record.mediaStorage?.mode.replace('_', ' ') || copy.detail.pending}</span>
 <span className="truncate">{copy.detail.hash}: {record.mediaStorage?.sha256?.slice(0, 12) || copy.detail.none}</span>
 <span className="truncate">{copy.detail.size}: {formatEvidenceFileSize(record.mediaStorage?.sizeBytes)}</span>
 <span className="truncate">{copy.detail.phone}: {record.phoneNumber}</span>
 <span className="truncate">{copy.detail.msg}: {record.providerMessageId}</span>
 <span>{record.location ? `${record.location.lat.toFixed(5)}, ${record.location.lng.toFixed(5)}` : copy.detail.noGps}</span>
 <span className={`truncate ${record.locationValidation?.status === 'outside_plot' ? 'text-rose-600' : 'text-slate-500'}`}>
 {formatLocationValidation(record)}
 </span>
 <span className="truncate">{formatEvidenceIntake(record)}</span>
 </div>
 <button
 onClick={() => onOpenEvidenceMedia(record.id)}
 disabled={record.mediaStorage?.mode !== 'stored'}
 className={`mt-3 h-11 w-full rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
 record.mediaStorage?.mode === 'stored'
 ? 'bg-white border border-slate-200 hover:border-indigo-300 text-slate-700 cursor-pointer'
 : 'bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed'
 }`}
 id={`btn-open-register-media-${record.id}`}
 >
 <IconSearch className="h-5 w-5" aria-hidden="true" />
 <span>{copy.detail.viewEvidenceMedia}</span>
 </button>
 </div>
 ))
 )}
 </div>
 </div>

 {/* Deforestation screening support */}
 <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col gap-2.5 shadow-sm">
 <span className="text-xs text-slate-400 block font-medium">{copy.detail.deforestationLabel}</span>
 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
 <div className="flex-grow min-w-0">
 <span className="text-xs font-medium block text-slate-800">{copy.detail.satelliteCheckTitle}</span>
 <span className="text-xs text-slate-500 font-sans block mt-0.5 leading-relaxed">
 {copy.detail.satelliteCheckDesc}
 </span>
 </div>
 <span className={`text-xs font-medium px-2.5 py-1.5 rounded-lg border shrink-0 ${
 isWhispClear
 ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
 : 'bg-amber-50 border-amber-200 text-amber-700'
 }`}>
 {isWhispClear ? copy.detail.clear : copy.detail.reviewNeeded}
 </span>
 </div>

 <div className="text-xs text-slate-500 bg-white border border-slate-200 p-2.5 rounded-lg leading-relaxed">
 {copy.detail.demoStatus}: <span className="font-medium text-slate-700">{selectedFarmer.whispStatus}</span>. {copy.detail.demoStatusNote}
 </div>
 </div>

 {/* Audit Logs Trail */}
 <div className="flex flex-col gap-1 bg-slate-50 p-3.5 border border-slate-200 rounded-xl shadow-sm" id="selected-audit-trail">
 <span className="text-xs text-slate-400 block font-medium">{copy.detail.auditTrailLabel}</span>
 <div className="flex flex-col gap-2 mt-2 max-h-[140px] overflow-y-auto">
 {selectedFarmer.auditLogs.map((log, idx) => (
 <div key={idx} className="text-xs border-l-2 border-slate-300 pl-2 py-0.5 font-sans">
 <div className="flex justify-between text-xs text-slate-400">
 <span>{log.timestamp} &bull; {log.user}</span>
 <span className="text-indigo-700 font-medium text-xs">{log.action}</span>
 </div>
 <p className="text-slate-600 mt-0.5 text-xs leading-relaxed">{log.details}</p>
 </div>
 ))}
 </div>
 </div>

 </div>

 {/* Detail right block: Polygon Map */}
 <div className="flex flex-col gap-3">
 <div className="flex justify-between items-baseline">
 <span className="text-xs text-slate-400 block font-medium">{copy.detail.plotPolygonMapLabel}</span>
 <span className="text-xs font-medium text-slate-600">{selectedFarmer.plotLocation}</span>
 </div>

 <PolygonMap
 waypoints={selectedFarmer.polygonWaypoints}
 isFlagged={selectedFarmer.status === FarmerStatus.FLAGGED}
 className="h-[280px]"
 language={activeLanguage}
 />

 <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs shadow-sm">
 <div>
 <span className="text-xs text-slate-400 block font-medium">{copy.detail.polygonArea}</span>
 <span className="text-slate-800 font-medium block mt-0.5">{selectedFarmer.plotArea} ha</span>
 </div>
 <div>
 <span className="text-xs text-slate-400 block font-medium">{copy.detail.deliveries30d}</span>
 <span className="text-slate-800 font-medium block mt-0.5">{selectedFarmer.actualYield} tonnes</span>
 </div>
 <div>
 <span className="text-xs text-slate-400 block font-medium">{copy.detail.annualProj}</span>
 <span className={`font-medium block mt-0.5 ${selectedFarmer.status === FarmerStatus.FLAGGED ? 'text-rose-500' : 'text-slate-800'}`}>
 {selectedFarmer.annualProjection} tonnes
 </span>
 </div>
 <div>
 <span className="text-xs text-slate-400 block font-medium">{copy.detail.bioCeiling}</span>
 <span className="text-slate-800 font-medium block mt-0.5">{selectedFarmer.expectedYieldCeiling} tonnes</span>
 </div>
 </div>
 </div>
 </div>
 </div>

 {/* WhatsApp Operations Monitor */}
 <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" id="whatsapp-operations-monitor">
 <div className="bg-slate-950 text-white rounded-2xl p-5 shadow-sm flex flex-col gap-4">
 <div>
 <h4 className="text-sm font-semibold">{copy.whatsapp.intakeTitle}</h4>
 <p className="text-xs text-emerald-100/70 mt-1">{copy.whatsapp.intakeSubtitle}</p>
 </div>

 <div className="grid grid-cols-3 gap-2">
 <div className="bg-white/10 border border-white/10 rounded-xl p-3">
 <span className="text-xs text-slate-300 font-medium block">{copy.whatsapp.active}</span>
 <span className="text-xl font-semibold block mt-1">{whatsappMonitoring.activeSessions}</span>
 </div>
 <div className="bg-white/10 border border-white/10 rounded-xl p-3">
 <span className="text-xs text-slate-300 font-medium block">{copy.whatsapp.linked}</span>
 <span className="text-xl font-semibold block mt-1">{whatsappMonitoring.linkedSessions}</span>
 </div>
 <div className="bg-white/10 border border-white/10 rounded-xl p-3">
 <span className="text-xs text-slate-300 font-medium block">{copy.whatsapp.pending}</span>
 <span className="text-xl font-semibold block mt-1 text-amber-200">{whatsappMonitoring.needsFollowUp}</span>
 </div>
 </div>
 </div>

 <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col gap-3">
 <div className="flex items-center justify-between">
 <div>
 <h4 className="text-sm font-semibold text-slate-800">{copy.whatsapp.sessionTitle}</h4>
 <p className="text-xs text-slate-500 mt-1">{copy.whatsapp.sessionSubtitle}</p>
 </div>
 <span className="text-xs bg-slate-50 border border-slate-200 text-slate-600 px-2 py-0.5 rounded font-medium">
 {whatsappSessions.length} {copy.whatsapp.phones}
 </span>
 </div>

 <div className="flex flex-col gap-2 max-h-[170px] overflow-y-auto pr-1">
 {whatsappSessions.length === 0 ? (
 <div className="text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-xl p-3 font-semibold">
 {copy.whatsapp.noSessions}
 </div>
 ) : (
 // Open link requests sort first so none hide beyond the five shown.
 [...whatsappSessions]
 .sort((a, b) => Number(b.identityConflict?.status === 'open') - Number(a.identityConflict?.status === 'open'))
 .slice(0, 5)
 .map((session) => {
 const hasOpenConflict = session.identityStatus === 'conflict' && session.identityConflict?.status === 'open';
 return (
 <div
 key={session.phoneNumber}
 onClick={() => {
 if (hasOpenConflict || !session.farmerId) return;
 onSelectFarmer(session.farmerId);
 focusSection('farmer-detail-drilldown');
 }}
 className={`w-full text-left border rounded-xl p-3 transition-colors ${
 hasOpenConflict ? 'cursor-default' : 'cursor-pointer'
 } ${
 session.identityStatus === 'conflict'
 ? 'bg-rose-50 hover:bg-rose-100 border-rose-200'
 : 'bg-slate-50 hover:bg-slate-100 border-slate-200'
 }`}
 id={`wa-session-${session.phoneNumber}`}
 >
 <div className="flex items-center justify-between gap-3">
 <span className="text-xs font-medium text-slate-800 truncate">{session.phoneNumber}</span>
 <span className={`text-xs font-medium px-2 py-0.5 rounded border ${
 session.identityStatus === 'conflict'
 ? 'bg-rose-100 border-rose-200 text-rose-700'
 : session.step === 'active'
 ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
 : 'bg-amber-50 border-amber-200 text-amber-700'
 }`}>
 {session.identityStatus === 'conflict' ? copy.whatsapp.identityReview : session.step.replace('_', ' ')}
 </span>
 </div>
 <div className="text-xs text-slate-500 mt-1 flex justify-between gap-2">
 <span className="truncate">{session.farmerId ? farmerNameById.get(session.farmerId) || session.farmerId : copy.whatsapp.unlinkedFarmer}</span>
 <span>{session.language || copy.whatsapp.noLanguage}</span>
 </div>
 {session.identityStatus === 'conflict' && (
 <div className="text-xs text-rose-700 mt-1 truncate">
 {session.identityConflict?.type === 'first_link_review'
 ? copy.whatsapp.newLinkRequest
 : session.identityConflict?.type.replace(/_/g, ' ') || 'identity conflict'}
 </div>
 )}
 {hasOpenConflict && (
 <>
 {session.identityConflict?.requestedFarmerId && (
 <div className="text-xs text-slate-500 mt-1 truncate">
 {copy.whatsapp.conflictRequests}: {farmerNameById.get(session.identityConflict.requestedFarmerId) || session.identityConflict.requestedFarmerId}
 </div>
 )}
 <div className="flex gap-2 mt-2" onClick={(event) => event.stopPropagation()}>
 <button
 type="button"
 onClick={() => onResolveIdentityConflict(session.phoneNumber, 'approve')}
 className="flex-1 text-xs font-semibold uppercase bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg py-1.5 cursor-pointer transition-colors"
 id={`wa-session-approve-${session.phoneNumber}`}
 >
 {copy.whatsapp.approveLink}
 </button>
 <button
 type="button"
 onClick={() => onResolveIdentityConflict(session.phoneNumber, 'reject')}
 className="flex-1 text-xs font-semibold uppercase bg-slate-700 hover:bg-slate-800 text-white rounded-lg py-1.5 cursor-pointer transition-colors"
 id={`wa-session-reject-${session.phoneNumber}`}
 >
 {copy.whatsapp.rejectLink}
 </button>
 </div>
 </>
 )}
 {session.identityStatus !== 'conflict' && session.identityConflict?.status === 'resolved' && (
 <div className="text-xs text-emerald-700 mt-1 truncate">
 {copy.whatsapp.conflictResolved} ({session.identityConflict.resolution})
 </div>
 )}
 </div>
 );
 })
 )}
 </div>
 </div>

 {/* Provider message claims: the duplicate-protection state the copy already promised */}
 <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col gap-3" id="whatsapp-claim-monitor">
 <div className="flex items-start gap-2">
 <IconDuplicate className="h-4 w-4 text-slate-500 mt-0.5 shrink-0" aria-hidden="true" />
 <div>
 <h4 className="text-sm font-semibold text-slate-800">{copy.whatsapp.claimsTitle}</h4>
 <p className="text-xs text-slate-500 mt-1">{copy.whatsapp.claimsSubtitle}</p>
 </div>
 </div>

 <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
 {[
 { label: copy.whatsapp.active, value: whatsappMonitoring.activeClaims, valueClass: 'text-slate-800' },
 { label: copy.whatsapp.expired, value: whatsappMonitoring.expiredClaims, valueClass: 'text-rose-700' },
 { label: copy.whatsapp.done, value: whatsappMonitoring.processedClaims, valueClass: 'text-emerald-700' },
 { label: copy.whatsapp.dupes, value: whatsappMonitoring.duplicateMessages, valueClass: 'text-amber-700' },
 ].map((stat) => (
 <div key={stat.label} className="bg-slate-50 border border-slate-200 rounded-xl p-3">
 <span className="text-xs text-slate-500 font-medium block">{stat.label}</span>
 <span className={`text-xl font-semibold block mt-1 ${stat.valueClass}`}>{stat.value}</span>
 </div>
 ))}
 </div>

 <div className="flex flex-col gap-2 max-h-[170px] overflow-y-auto pr-1">
 {whatsappMonitoring.openClaims.length === 0 ? (
 <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-3 font-semibold">
 {copy.whatsapp.noClaims}
 </p>
 ) : (
 whatsappMonitoring.openClaims.map((claim) => (
 <div key={claim.providerMessageId} className="bg-slate-50 border border-slate-200 rounded-xl p-3">
 <div className="flex items-center justify-between gap-3">
 <span className="text-xs font-medium text-slate-800 truncate">{claim.providerMessageId}</span>
 <span className={`text-xs font-medium px-2 py-0.5 rounded border shrink-0 ${
 claim.displayState === 'expired'
 ? 'bg-rose-50 border-rose-200 text-rose-700'
 : 'bg-emerald-50 border-emerald-200 text-emerald-700'
 }`}>
 {claim.displayState === 'expired' ? copy.whatsapp.expired : copy.whatsapp.active}
 </span>
 </div>
 <div className="text-xs text-slate-500 mt-1 flex justify-between gap-2">
 <span className="truncate">{claim.claimedAt.replace('T', ' ').substring(0, 16)}</span>
 <span className="shrink-0">{copy.whatsapp.dupes}: {claim.duplicateCount}</span>
 </div>
 </div>
 ))
 )}
 </div>
 </div>

 </div>

 {/* Recent farmer messages with the attention filters the intake counters point at */}
 <section
 className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col gap-3"
 id="whatsapp-activity-monitor"
 aria-labelledby="whatsapp-activity-title"
 >
 <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
 <div className="flex items-start gap-2">
 <IconChat className="h-4 w-4 text-slate-500 mt-0.5 shrink-0" aria-hidden="true" />
 <div>
 <h4 id="whatsapp-activity-title" className="text-sm font-semibold text-slate-800">
 {copy.whatsapp.messagesTitle}
 </h4>
 <p className="text-xs text-slate-500 mt-1">{copy.whatsapp.messagesSubtitle}</p>
 </div>
 </div>

 <div
 className="grid grid-cols-3 gap-1 bg-slate-100 border border-slate-200 p-1 rounded-xl"
 role="group"
 aria-label={copy.whatsapp.activityFilterLabel}
 >
 {whatsappActivityFilters.map((filter) => {
 const isActive = whatsappActivityFilter === filter.id;
 return (
 <button
 key={filter.id}
 type="button"
 onClick={() => setWhatsappActivityFilter(filter.id)}
 aria-pressed={isActive}
 className={`h-11 px-3 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
 isActive ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
 }`}
 id={`btn-whatsapp-activity-${filter.id}`}
 >
 {filter.label} ({filter.count})
 </button>
 );
 })}
 </div>
 </div>

 <div className="flex flex-col gap-2 max-h-96 overflow-y-auto pr-1">
 {whatsappMonitoring.recentEvents.length === 0 ? (
 <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-3 font-semibold">
 {whatsappActivityFilter === 'attention'
 ? copy.whatsapp.noGpsReview
 : whatsappActivityFilter === 'failed'
 ? copy.whatsapp.noFailedSends
 : copy.whatsapp.noWebhookEvents}
 </p>
 ) : (
 whatsappMonitoring.recentEvents.map((event) => {
 const gpsLabel = formatMonitoringLocationValidation(event);
 const linkedFarmerId = event.reply.farmerId || event.session?.farmerId;

 return (
 <article
 key={`${event.inbound.providerMessageId}-${event.storedAt}`}
 className="bg-slate-50 border border-slate-200 rounded-xl p-3.5"
 >
 <header className="flex flex-wrap items-start justify-between gap-2">
 <div className="min-w-0">
 <span className="text-xs font-medium text-slate-800 block truncate">{event.inbound.fromPhone}</span>
 <span className="text-xs text-slate-500 block mt-0.5">
 {event.inbound.kind} &middot; {event.reply.intent.replace(/_/g, ' ')}
 </span>
 </div>
 <div className="flex flex-wrap justify-end gap-1.5 shrink-0">
 {event.reply.feedback && (
 <span className={`text-xs font-medium px-2 py-0.5 rounded border ${getFeedbackRiskClass(event.reply.feedback.riskLevel)}`}>
 {event.reply.feedback.riskLevel}
 </span>
 )}
 {event.outbound && (
 <span className={`text-xs font-medium px-2 py-0.5 rounded border ${
 event.outbound.mode === 'failed'
 ? 'bg-rose-50 border-rose-200 text-rose-700'
 : event.outbound.mode === 'sent'
 ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
 : 'bg-slate-100 border-slate-200 text-slate-600'
 }`}>
 {event.outbound.mode.replace('_', ' ')}
 </span>
 )}
 </div>
 </header>

 <p className="text-xs text-slate-800 mt-2 leading-relaxed">
 {event.inbound.text || <span className="text-slate-500 italic">{copy.whatsapp.noMessageText}</span>}
 </p>
 <p className="text-xs text-slate-600 mt-2 leading-relaxed border-l-2 border-slate-300 pl-2.5">
 <span className="font-medium text-slate-500">{copy.whatsapp.botReply}: </span>
 {event.reply.text}
 </p>

 <div className="flex flex-wrap items-center gap-2 mt-2.5 text-xs text-slate-500">
 <span>{event.storedAt.replace('T', ' ').substring(0, 16)}</span>
 {gpsLabel && (
 <span className={`px-2 py-0.5 rounded border font-semibold ${getMonitoringLocationValidationClass(event)}`}>
 {gpsLabel}
 </span>
 )}
 {event.reply.requiresHumanReview && (
 <span className="px-2 py-0.5 rounded border font-semibold bg-amber-50 border-amber-200 text-amber-800">
 {copy.whatsapp.humanReview}
 </span>
 )}
 {event.outbound?.error && (
 <span className="px-2 py-0.5 rounded border font-semibold bg-rose-50 border-rose-200 text-rose-700 truncate max-w-full">
 {event.outbound.error}
 </span>
 )}
 </div>

 {linkedFarmerId && (
 <button
 type="button"
 onClick={() => {
 onSelectFarmer(linkedFarmerId);
 focusSection('farmer-detail-drilldown');
 }}
 className="mt-3 h-11 w-full sm:w-auto px-4 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:border-indigo-300 transition-colors cursor-pointer inline-flex items-center justify-center gap-1.5"
 id={`btn-open-farmer-${event.inbound.providerMessageId}`}
 >
 <span>{copy.whatsapp.openFarmer}</span>
 <IconArrowForward className="h-5 w-5" aria-hidden="true" />
 </button>
 )}
 </article>
 );
 })
 )}
 </div>
 </section>

 <section
 className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm"
 id="guidelines-library"
 aria-labelledby="guidelines-library-title"
 >
 <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
 <div>
 <h3 id="guidelines-library-title" className="type-section-title text-slate-950">
 {copy.guidelines.title}
 </h3>
 <p className="mt-1 text-sm text-slate-500">
 {copy.guidelines.subtitle}
 </p>
 </div>
 <span className="w-fit rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
 {copy.guidelines.referenceType}
 </span>
 </div>

 <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
 {[
 {
 id: 'mspo',
 title: copy.guidelines.mspoTitle,
 body: copy.guidelines.mspoBody,
 tone: 'bg-emerald-50 text-emerald-700 border-emerald-100',
 href: 'https://mspo.org.my/mspo-certification-scheme',
 },
 {
 id: 'rspo',
 title: copy.guidelines.rspoTitle,
 body: copy.guidelines.rspoBody,
 tone: 'bg-indigo-50 text-indigo-700 border-indigo-100',
 href: 'https://rspo.org/standards/',
 },
 {
 id: 'eudr',
 title: copy.guidelines.eudrTitle,
 body: copy.guidelines.eudrBody,
 tone: 'bg-amber-50 text-amber-700 border-amber-100',
 href: 'https://environment.ec.europa.eu/topics/forests/deforestation/regulation-deforestation-free-products_en',
 },
 {
 id: 'felda',
 title: copy.guidelines.feldaTitle,
 body: copy.guidelines.feldaBody,
 tone: 'bg-slate-50 text-slate-700 border-slate-200',
 href: 'https://www.felda.gov.my/en/',
 },
 ].map((guideline) => (
 <article key={guideline.title} className="flex h-full min-w-0 flex-col rounded-xl border border-slate-200 bg-slate-50/60 p-4">
 <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-lg border ${guideline.tone}`}>
 <IconBook className="h-5 w-5" aria-hidden="true" />
 </div>
 <h4 className="type-card-heading text-slate-950">{guideline.title}</h4>
 <p className="mt-1.5 text-sm text-slate-600">
 {guideline.body}
 </p>
 <a
 href={guideline.href}
 target="_blank"
 rel="noopener noreferrer"
 aria-label={`${copy.guidelines.documentLinkAria} ${guideline.title}`}
 className="mt-auto inline-flex w-fit items-center gap-1.5 rounded-lg pt-3 text-xs font-medium text-emerald-700 hover:text-emerald-800 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
 id={`link-guideline-${guideline.id}`}
 >
 <span>{copy.guidelines.documentLink}</span>
 <IconArrowForward className="h-4 w-4" aria-hidden="true" />
 </a>
 </article>
 ))}
 </div>
 </section>

 {/* Analytics Charts Section */}
 <div className="grid grid-cols-1 md:grid-cols-2 gap-6" id="compliance-charts-grid">
 {/* Compliance Score Distribution Bar Chart */}
 <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col shadow-sm">
 <div className="flex items-center justify-between mb-4">
 <div>
 <h4 className="text-sm font-semibold text-slate-800">{copy.charts.complianceTitle}</h4>
 </div>
 <span className="text-xs bg-indigo-50 border border-indigo-200 text-indigo-700 px-2 py-0.5 rounded font-medium">
 {copy.charts.average}: {averageScore} / 100
 </span>
 </div>
 <div className="h-[220px] w-full" id="score-distribution-chart-container">
 <ResponsiveContainer width="100%" height="100%">
 <BarChart data={scoreDistribution} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
 <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef3f0" />
 <XAxis
 dataKey="name"
 tick={{ fill: '#55655e', fontSize: 12, fontWeight: 600 }}
 axisLine={{ stroke: '#dbe6df' }}
 tickLine={false}
 />
 <YAxis
 tick={{ fill: '#55655e', fontSize: 12, fontWeight: 600 }}
 axisLine={false}
 tickLine={false}
 allowDecimals={false}
 />
 <Tooltip
 cursor={{ fill: '#f8fafc', radius: 6 }}
 contentStyle={{
 backgroundColor: '#ffffff',
 borderRadius: '12px',
 border: '1px solid #dbe6df',
 boxShadow: '0 4px 12px -1px rgb(0 0 0 / 0.08)'
 }}
 labelStyle={{ fontWeight: 600, fontSize: '12px', color: '#14241f' }}
 itemStyle={{ fontSize: '12px', fontWeight: 500 }}
 />
 <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={45}>
 {scoreDistribution.map((entry, index) => {
 let color = '#365A7D';
 if (index === 0) color = '#C94B3D';
 if (entry.name === '60 - 74') color = '#C8912E';
 if (entry.name === '75 - 89') color = '#365A7D';
 if (entry.name === '90 - 100') color = '#0F7A55';
 return <Cell key={`cell-score-${index}`} fill={color} />;
 })}
 </Bar>
 </BarChart>
 </ResponsiveContainer>
 </div>
 </div>

 {/* Progress Status Bar Chart */}
 <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col shadow-sm">
 <div className="flex items-center justify-between mb-4">
 <div>
 <h4 className="text-sm font-semibold text-slate-800">{copy.charts.statusTitle}</h4>
 </div>
 <span className="text-xs bg-emerald-50 border border-emerald-200 text-emerald-700 px-2 py-0.5 rounded font-medium">
 {farmers.length} {copy.charts.smallholders}
 </span>
 </div>
 <div className="h-[220px] w-full" id="status-distribution-chart-container">
 <ResponsiveContainer width="100%" height="100%">
 <BarChart data={statusDistribution} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
 <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef3f0" />
 <XAxis
 dataKey="status"
 tick={{ fill: '#55655e', fontSize: 12, fontWeight: 600 }}
 axisLine={{ stroke: '#dbe6df' }}
 tickLine={false}
 />
 <YAxis
 tick={{ fill: '#55655e', fontSize: 12, fontWeight: 600 }}
 axisLine={false}
 tickLine={false}
 allowDecimals={false}
 />
 <Tooltip
 cursor={{ fill: '#f8fafc', radius: 6 }}
 contentStyle={{
 backgroundColor: '#ffffff',
 borderRadius: '12px',
 border: '1px solid #dbe6df',
 boxShadow: '0 4px 12px -1px rgb(0 0 0 / 0.08)'
 }}
 labelStyle={{ fontWeight: 600, fontSize: '12px', color: '#14241f' }}
 itemStyle={{ fontSize: '12px', fontWeight: 500 }}
 />
 <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={45}>
 {statusDistribution.map((entry, index) => {
 let color = '#365A7D';
 if (entry.key === 'Certified') color = '#0F7A55';
 if (entry.key === 'In progress') color = '#365A7D';
 if (entry.key === 'Eligible soon') color = '#C8912E';
 if (entry.key === 'Flagged') color = '#C94B3D';
 if (entry.key === 'Inactive') color = '#6E7F77';
 return <Cell key={`cell-status-${index}`} fill={color} />;
 })}
 </Bar>
 </BarChart>
 </ResponsiveContainer>
 </div>
 </div>
 </div>

 {/* Reference material: positioning content lives below the work, behind a disclosure */}
 <details className="bg-white border border-slate-200 rounded-xl" id="smart-esgp-about">
 <summary className="cursor-pointer list-none px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
 <span className="text-sm font-semibold text-slate-800">{copy.about.toggle}</span>
 <span className="text-xs font-semibold text-slate-500">{copy.about.toggleHint}</span>
 </summary>

 <section className="border-t border-slate-200 p-5 grid grid-cols-1 xl:grid-cols-[1.05fr_1.5fr] gap-4" id="smart-esgp-positioning">
 <div className="bg-emerald-950 text-white border border-emerald-950 rounded-xl p-5 shadow-sm">
 <span className="text-xs font-semibold text-emerald-100/80">
 {copy.system.label}
 </span>
 <h3 className="text-lg font-semibold mt-2 leading-tight">{copy.system.title}</h3>
 <p className="text-sm text-emerald-50/80 mt-2 leading-relaxed font-sans">
 {copy.system.body}
 </p>
 <div className="mt-4 bg-white/10 border border-white/10 rounded-lg p-3 text-xs text-emerald-50/85 font-semibold leading-relaxed">
 {copy.system.positioningRule}
 </div>
 </div>

 <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
 {[
 {
 label: copy.system.capturedOnce,
 title: copy.system.capturedTitle,
 items: copy.system.capturedItems,
 },
 {
 label: copy.system.complianceOutput,
 title: copy.system.complianceTitle,
 items: copy.system.complianceItems,
 },
 {
 label: copy.system.financeOutput,
 title: copy.system.financeTitle,
 items: copy.system.financeItems,
 },
 ].map((pathway) => (
 <div key={pathway.title} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
 <span className="text-xs font-semibold text-slate-500">
 {pathway.label}
 </span>
 <h4 className="text-sm font-semibold text-slate-950 mt-1 leading-snug">{pathway.title}</h4>
 <ul className="mt-3 space-y-2 text-xs text-slate-600 font-semibold leading-relaxed">
 {pathway.items.map((item) => (
 <li key={item} className="flex items-start gap-2">
 <IconApproved className="h-4 w-4 text-emerald-700 mt-0.5 shrink-0" aria-hidden="true" />
 <span>{item}</span>
 </li>
 ))}
 </ul>
 </div>
 ))}
 </div>
 </section>
 </details>

 {showCertModal && (
 <MspoCertificate
 farmer={selectedFarmer}
 certificate={activeCertificate}
 onClose={() => setShowCertModal(false)}
 lang={activeLanguage}
 />
 )}

 <ConfirmActionDialog
 request={pendingAction}
 onCancel={() => setPendingAction(null)}
 reviewHeading={copy.confirm.reviewHeading}
 closeLabel={copy.confirm.close}
 />
 </div>
 );
};
