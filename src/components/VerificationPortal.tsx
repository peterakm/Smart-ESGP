import React, { useState, useMemo } from 'react';
import { CertificateRecord, Farmer, FarmerStatus } from '../types';
import type { ComplianceEvaluation } from '../services/complianceEngine';
import {
 buildSmartEsgpEsgCategories,
 calculateSmartEsgpEsgCategoryScore,
 type SmartEsgpEsgCategory,
 type SmartEsgpEsgCategoryId,
 type SmartEsgpLanguage,
} from '../domain/esgPractices';
import {
 ICON,
 IconApproved, IconCertificate, IconDocument, IconDownload, IconEnvironment,
 IconFarmers, IconGlobe, IconGovernance, IconHash, IconPin, IconRejected,
 IconVerified, IconWarning,
} from './icons';
import { MspoCertificate } from './MspoCertificate';
import { EsgScoreBreakdown } from './certification/EsgScoreBreakdown';
import { downloadFarmerCertificate } from '../utils/certificateDownload';
import {
 buildCertificateValidity,
 findFarmerCertificate,
 formatCertificateDate,
 formatCertificateTimestamp,
 getUnavailableLabel,
} from '../utils/certificateValidity';

interface VerificationPortalProps {
 farmer: Farmer;
 complianceEvaluation?: ComplianceEvaluation | null;
 certificates?: CertificateRecord[];
 onBack?: () => void;
 language?: SmartEsgpLanguage;
 onLanguageChange?: (language: SmartEsgpLanguage) => void;
 isSampleData?: boolean;
 sampleDataAsOf?: string;
 dataRefreshedAt?: string | null;
}

type Language = SmartEsgpLanguage;
type EsgCategoryId = SmartEsgpEsgCategoryId;
type EsgColor = 'emerald' | 'indigo' | 'amber';

type VerificationCopyKey =
 | 'subTitle'
 | 'verifiedBy'
 | 'certValid'
 | 'certFlagged'
 | 'certInvalid'
 | 'issued'
 | 'expires'
 | 'remaining'
 | 'lastEvidence'
 | 'farmerPlot'
 | 'farmerName'
 | 'mspoCert'
 | 'mpobLicence'
 | 'plotLoc'
 | 'plotArea'
 | 'polyWaypoints'
 | 'deforestStatus'
 | 'criteriaMet'
 | 'mspoP1'
 | 'mspoP4'
 | 'mspoP6'
 | 'eudrArt9'
 | 'eudrArt3'
 | 'yieldVerif'
 | 'pdpaConsent'
 | 'complianceScore'
 | 'evidenceSummary'
 | 'dailyCheckins'
 | 'activitiesRec'
 | 'weighbridgeDeliv'
 | 'auditHash'
 | 'buyerNotice'
 | 'anchored'
 | 'transactions'
 | 'back'
 | 'sampleDataTitle'
 | 'sampleDataBody'
 | 'noCertificateTitle'
 | 'noCertificateBody'
 | 'certificateNumber'
 | 'issuedBy'
 | 'hashUnavailable'
 | 'frozenOn'
 | 'noAnomalyDetail';

interface EsgCategory extends SmartEsgpEsgCategory {
 color: EsgColor;
 bgActive: string;
 borderCol: string;
 badgeBg: string;
}

const VERIFICATION_ESG_STYLES: Record<EsgCategoryId, Omit<EsgCategory, keyof SmartEsgpEsgCategory>> = {
 E: {
 color: 'emerald',
 bgActive: 'bg-emerald-600 text-white',
 borderCol: 'border-emerald-200/80',
 badgeBg: 'bg-emerald-50 border border-emerald-200 text-emerald-700',
 },
 S: {
 color: 'indigo',
 bgActive: 'bg-indigo-600 text-white',
 borderCol: 'border-indigo-200/80',
 badgeBg: 'bg-indigo-50 border border-indigo-200 text-indigo-700',
 },
 G: {
 color: 'amber',
 bgActive: 'bg-amber-600 text-white',
 borderCol: 'border-amber-200/80',
 badgeBg: 'bg-amber-50 border border-amber-200 text-amber-700',
 },
};

export const VerificationPortal: React.FC<VerificationPortalProps> = ({
 farmer,
 complianceEvaluation,
 certificates,
 onBack,
 language = 'EN',
 onLanguageChange,
 isSampleData = false,
 sampleDataAsOf,
 dataRefreshedAt,
}) => {
 const lang: Language = language as Language;
 const [showCertModal, setShowCertModal] = useState(false);

 const isCertified = farmer.status === FarmerStatus.CERTIFIED;
 const isFlagged = farmer.status === FarmerStatus.FLAGGED;

 const activeCertificate = useMemo(
 () => findFarmerCertificate(certificates, farmer.id),
 [certificates, farmer.id]
 );
 const certificateValidity = useMemo(() => buildCertificateValidity(activeCertificate), [activeCertificate]);

 const handleDownloadCertificate = () => {
 downloadFarmerCertificate(farmer, lang, activeCertificate);
 };

 // Language dictionaries
 const t = {
 EN: {
 subTitle: 'FELDA certificate review',
 verifiedBy: 'Reviewed in Smart-ESGP. Data last refreshed:',
 sampleDataTitle: 'Sample data - not live data',
 sampleDataBody: 'The farmer API is not available, so this file shows sample records from {date}. It is not proof of certificate status.',
 noCertificateTitle: 'No certificate issued',
 noCertificateBody: 'No certificate record exists for this farmer, so the issue date, expiry date, and verification hash cannot be shown.',
 certificateNumber: 'Certificate number',
 issuedBy: 'Issued by',
 hashUnavailable: 'Not available until the certificate is issued',
 frozenOn: 'Verification frozen on',
 noAnomalyDetail: 'No issue detail is recorded for this file.',
 certValid: 'Certificate valid',
 certFlagged: 'Certificate flagged / under review',
 certInvalid: 'Certificate inactive',
 issued: 'Issued',
 expires: 'Expires',
 remaining: 'days remaining',
 lastEvidence: 'Last evidence submitted',
 farmerPlot: 'Farmer and plot',
 farmerName: 'Farmer name',
 mspoCert: 'MSPO certificate ID',
 mpobLicence: 'MPOB licence',
 plotLoc: 'Plot location',
 plotArea: 'Plot area (verified polygon)',
 polyWaypoints: 'Polygon waypoints',
 deforestStatus: 'Post-2020 deforestation status',
 criteriaMet: 'Compliance checks met',
 mspoP1: 'MSPO MS2530:2022 - Principle 1 (legality)',
 mspoP4: 'MSPO MS2530:2022 - Principle 4 (good practices)',
 mspoP6: 'MSPO MS2530:2022 - Principle 6 (environment)',
 eudrArt9: 'EUDR Article 9 - plot polygon location',
 eudrArt3: 'EUDR Article 3 - no post-2020 deforestation',
 yieldVerif: 'Yield and land check',
 pdpaConsent: 'PDPA 2024 consent on file',
 complianceScore: 'Compliance score',
 evidenceSummary: 'Evidence summary (last 90 days)',
 dailyCheckins: 'Daily check-ins submitted',
 activitiesRec: 'Activity classes recorded',
 weighbridgeDeliv: 'Weighbridge deliveries',
 auditHash: 'Audit hash',
 buyerNotice: 'A mill buyer can use this record to support EU buyer checks.',
 anchored: 'stored in the approved registry',
 transactions: 'transactions',
 back: 'Back to workspace',
 },
 BM: {
 subTitle: 'Semakan sijil FELDA',
 verifiedBy: 'Disemak dalam Smart-ESGP. Data dikemas kini terakhir:',
 sampleDataTitle: 'Data contoh - bukan data langsung',
 sampleDataBody: 'API pekebun tidak tersedia, jadi fail ini memaparkan rekod contoh dari {date}. Ini bukan bukti status sijil.',
 noCertificateTitle: 'Tiada sijil dikeluarkan',
 noCertificateBody: 'Tiada rekod sijil untuk pekebun ini, jadi tarikh pengeluaran, tarikh tamat tempoh, dan hash pengesahan tidak boleh dipaparkan.',
 certificateNumber: 'Nombor sijil',
 issuedBy: 'Dikeluarkan oleh',
 hashUnavailable: 'Tidak tersedia sehingga sijil dikeluarkan',
 frozenOn: 'Pengesahan dibekukan pada',
 noAnomalyDetail: 'Tiada butiran isu direkodkan untuk fail ini.',
 certValid: 'Sijil sah',
 certFlagged: 'Sijil ditanda / dalam semakan',
 certInvalid: 'Sijil tidak aktif',
 issued: 'Dikeluarkan',
 expires: 'Tamat tempoh',
 remaining: 'hari berbaki',
 lastEvidence: 'Bukti terakhir dihantar',
 farmerPlot: 'Pekebun dan plot',
 farmerName: 'Nama pekebun',
 mspoCert: 'ID sijil MSPO',
 mpobLicence: 'No. Lesen MPOB',
 plotLoc: 'Lokasi lot tanah',
 plotArea: 'Keluasan lot (poligon disahkan)',
 polyWaypoints: 'Titik koordinat plot',
 deforestStatus: 'Status penyahhutanan pasca-2020',
 criteriaMet: 'Semakan pematuhan dipenuhi',
 mspoP1: 'MSPO MS2530:2022 - Prinsip 1 (undang-undang)',
 mspoP4: 'MSPO MS2530:2022 - Prinsip 4 (amalan baik)',
 mspoP6: 'MSPO MS2530:2022 - Prinsip 6 (alam sekitar)',
 eudrArt9: 'EUDR Artikel 9 - Geolokasi poligon plot',
 eudrArt3: 'EUDR Artikel 3 - Bebas penyahhutanan selepas 2020',
 yieldVerif: 'Semakan hasil dan tanah (tiada tanda manipulasi)',
 pdpaConsent: 'Persetujuan PDPA 2024 dalam fail',
 complianceScore: 'Skor pematuhan',
 evidenceSummary: 'Ringkasan bukti (90 hari terakhir)',
 dailyCheckins: 'Log harian dihantar',
 activitiesRec: 'Kategori aktiviti direkodkan',
 weighbridgeDeliv: 'Penghantaran pusat timbang',
 auditHash: 'Cincang log audit',
 buyerNotice: 'Pembeli kilang boleh menggunakan rekod ini untuk menyokong semakan pembeli EU.',
 anchored: 'disimpan dalam lejar yang diluluskan',
 transactions: 'transaksi',
 back: 'Kembali ke ruang kerja',
 }
 } satisfies Record<Language, Record<VerificationCopyKey, string>>;

 const currentT = t[lang];

 const [activeEsgTab, setActiveEsgTab] = useState<EsgCategoryId>('E');

 const esgCategories = useMemo<EsgCategory[]>(() => {
 return buildSmartEsgpEsgCategories(farmer, lang, 'verification').map((category) => ({
 ...category,
 ...VERIFICATION_ESG_STYLES[category.id],
 }));
 }, [farmer, lang]);

 const activeCategory = useMemo(() => {
 return esgCategories.find(cat => cat.id === activeEsgTab) || esgCategories[0];
 }, [esgCategories, activeEsgTab]);

 // Score weights use the shared 40/30/30 ESG model.
 const esgScoreByCategory = useMemo(() => {
 return esgCategories.reduce(
 (scores, category) => ({
 ...scores,
 [category.id]: calculateSmartEsgpEsgCategoryScore(category),
 }),
 {} as Record<EsgCategoryId, number>
 );
 }, [esgCategories]);

 const earnedEPoints = esgScoreByCategory.E ?? 0;
 const earnedSPoints = esgScoreByCategory.S ?? 0;
 const earnedGPoints = esgScoreByCategory.G ?? 0;

 const totalCalculatedScore = earnedEPoints + earnedSPoints + earnedGPoints;

 // Certificate dates come from the registry record only; nothing is invented here.
 const issueDate = formatCertificateDate(certificateValidity.issuedAtIso, lang);
 const expiryDate = formatCertificateDate(certificateValidity.expiresAtIso, lang);
 const refreshedAtLabel = isSampleData
 ? `${sampleDataAsOf ?? getUnavailableLabel(lang)} (${lang === 'EN' ? 'sample data' : 'data contoh'})`
 : formatCertificateTimestamp(dataRefreshedAt, lang);
 const provenanceLine = `${currentT.verifiedBy} ${refreshedAtLabel}`;
 const primaryAnomaly = farmer.anomalies[0];
 const flagRaisedLog = farmer.auditLogs.find((log) => log.action.toLowerCase() === 'flag raised');

 return (
 <div className="text-slate-900 font-sans" id="verification-portal-root">
 {/* Top Bar */}
 <div className="verification-file-header bg-white border border-slate-200 rounded-xl py-4 px-5 shadow-sm">
 <div className="mx-auto flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
 <div className="flex flex-wrap items-center gap-3">
 {onBack && (
 <button
 onClick={onBack}
 className="min-h-11 text-xs font-medium text-white bg-slate-950 hover:bg-slate-800 px-4 rounded-lg border border-slate-900 transition-colors cursor-pointer"
 id="btn-back-to-dashboard"
 >
 {currentT.back}
 </button>
 )}
 <div>
 <h2 className="type-section-title text-slate-950 flex items-center gap-2">
 {lang === 'EN' ? 'Certificate review file' : 'Fail semakan sijil'}
 </h2>
 <p className="text-sm text-slate-600 font-medium mt-0.5">
 {farmer.name} - {currentT.subTitle}
 </p>
 <p className="text-xs text-emerald-700 mt-1">{currentT.mpobLicence}: {farmer.mpobLicence}</p>
 </div>
 </div>
 {onLanguageChange && <div className="flex items-center gap-2 border border-slate-200 rounded-lg p-1 bg-slate-50">
 <button
 onClick={() => onLanguageChange?.('EN')}
 aria-pressed={lang === 'EN'}
 className={`h-11 min-w-11 px-3 text-xs font-medium rounded-md transition-all cursor-pointer ${
 lang === 'EN' ? 'bg-emerald-700 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
 }`}
 id="lang-en-btn"
 >
 EN
 </button>
 <button
 onClick={() => onLanguageChange?.('BM')}
 aria-pressed={lang === 'BM'}
 className={`h-11 min-w-11 px-3 text-xs font-medium rounded-md transition-all cursor-pointer ${
 lang === 'BM' ? 'bg-emerald-700 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
 }`}
 id="lang-bm-btn"
 >
 BM
 </button>
 </div>}
 </div>
 </div>

 <div className="verification-content mx-auto mt-5 flex flex-col gap-5">

 {isSampleData && (
 <div
 className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4"
 role="status"
 id="portal-sample-data-notice"
 >
 <IconWarning className="w-5 h-5 shrink-0 text-amber-700 mt-0.5" aria-hidden="true" />
 <div>
 <p className="text-sm font-semibold text-amber-900">{currentT.sampleDataTitle}</p>
 <p className="text-xs text-amber-900 mt-1 leading-relaxed">
 {currentT.sampleDataBody.replace('{date}', sampleDataAsOf ?? '-')}
 </p>
 </div>
 </div>
 )}

 {/* Certificate Banner (Valid vs Flagged) */}
 {isCertified ? (
 <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row items-center gap-6 animate-fade-in" id="valid-banner">
 <div className="flex-grow text-center md:text-left">
 <span className="text-xs font-medium text-emerald-800 bg-emerald-100 px-3 py-1 rounded-full border border-emerald-200/50">
 MSPO MS2530:2022 + EUDR compliant
 </span>
 <h2 className="type-page-title text-emerald-950 mt-2">
 {currentT.certValid}
 </h2>
 {certificateValidity.isIssued ? (
 <>
 <p className="text-sm font-semibold text-emerald-800/90 mt-1">
 {currentT.issued}: {issueDate} - {currentT.expires}: {expiryDate}
 </p>
 <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-emerald-700 mt-3 justify-center md:justify-start">
 {certificateValidity.daysRemaining !== undefined && (
 <span>{certificateValidity.daysRemaining} {currentT.remaining}</span>
 )}
 <span>{currentT.lastEvidence}: {farmer.lastActivityDate}</span>
 {certificateValidity.certificateNumber && (
 <span>{currentT.certificateNumber}: {certificateValidity.certificateNumber}</span>
 )}
 </div>
 </>
 ) : (
 <div className="mt-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-left">
 <p className="text-sm font-semibold text-amber-900">{currentT.noCertificateTitle}</p>
 <p className="text-xs text-amber-900 mt-1 leading-relaxed">{currentT.noCertificateBody}</p>
 </div>
 )}
 <p className="text-xs text-emerald-800 mt-4 border-t border-emerald-200 pt-2 font-semibold">
 {provenanceLine}
 </p>
 </div>
 <div className="flex-shrink-0 w-full md:w-auto flex flex-col gap-2">
 <button
 onClick={() => setShowCertModal(true)}
 className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-5 py-3 rounded-xl shadow-md hover:shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2 border border-emerald-700"
 id="btn-portal-view-cert"
 >
 <IconCertificate className="h-5 w-5" aria-hidden="true" />
 <span>{lang === 'EN' ? 'View certificate sheet' : 'Lihat lembaran sijil'}</span>
 </button>
 <button
 onClick={handleDownloadCertificate}
 className="w-full bg-white hover:bg-emerald-50 text-emerald-800 font-semibold text-xs px-5 py-3 rounded-xl shadow-sm hover:shadow transition-all cursor-pointer flex items-center justify-center gap-2 border border-emerald-200"
 id="btn-portal-download-cert"
 >
 <IconDownload className="w-4 h-4" aria-hidden="true" />
 <span>{lang === 'EN' ? 'Download certificate' : 'Muat turun sijil'}</span>
 </button>
 </div>
 </div>
 ) : isFlagged ? (
 <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row items-center gap-6 animate-fade-in" id="flagged-banner">
 <div className="flex-grow text-center md:text-left">
 <span className="text-xs font-medium text-rose-700 bg-rose-100 px-3 py-1 rounded-full border border-rose-200/50">
 Audit issue / suspended
 </span>
 <h2 className="type-page-title text-rose-950 mt-2">
 {currentT.certFlagged}
 </h2>
 {flagRaisedLog && (
 <p className="text-sm font-semibold text-rose-800 mt-1">
 {currentT.frozenOn}: {flagRaisedLog.timestamp}
 </p>
 )}
 <p className="text-xs text-rose-700 mt-2 font-medium bg-white/70 px-2.5 py-1.5 rounded-lg border border-rose-200 inline-block leading-relaxed">
 {primaryAnomaly?.description ?? currentT.noAnomalyDetail}
 </p>
 <p className="text-xs text-rose-700 mt-4 border-t border-rose-200 pt-2 font-semibold">
 {provenanceLine}
 </p>
 </div>
 </div>
 ) : (
 <div className="bg-slate-100 border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row items-center gap-6 animate-fade-in" id="in-progress-banner">
 <div className="flex-grow text-center md:text-left">
 <span className="text-xs font-medium text-slate-600 bg-slate-200 px-3 py-1 rounded-full border border-slate-300/40">
 Evidence collection
 </span>
 <h2 className="type-page-title text-slate-950 mt-2">
 {farmer.status === FarmerStatus.IN_PROGRESS ? (lang === 'EN' ? 'In progress (collecting evidence)' : 'Dalam proses (mengumpul bukti)') : currentT.certInvalid}
 </h2>
 <p className="text-sm font-semibold text-slate-600 mt-1">
 {lang === 'EN' ? `Current score: ${farmer.score}/100. Evidence days: ${farmer.daysCollected}/90` : `Skor semasa: ${farmer.score}/100. Hari bukti: ${farmer.daysCollected}/90`}
 </p>
 <p className="text-xs text-slate-500 mt-4 border-t border-slate-200 pt-2 font-semibold">
 {provenanceLine}
 </p>
 </div>
 </div>
 )}

 {/* Details Grid */}
 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
 {/* Column 1: Farmer & Plot */}
 <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col gap-4">
 <h3 className="type-card-heading text-slate-700 border-b border-slate-100 pb-2 flex items-center gap-2">
 <IconDocument className="w-4 h-4 text-indigo-600" aria-hidden="true" />
 {currentT.farmerPlot}
 </h3>

 <div className="grid grid-cols-1 gap-y-3 font-sans">
 <div>
 <span className="text-xs text-slate-400 block font-medium">{currentT.farmerName}</span>
 <span className="text-sm font-semibold text-slate-800">{farmer.name}</span>
 </div>

 <div>
 <span className="text-xs text-slate-400 block font-medium">{currentT.mspoCert}</span>
 <span className="text-sm font-medium text-indigo-700">{farmer.mspoCertId}</span>
 </div>

 <div>
 <span className="text-xs text-slate-400 block font-medium">{currentT.mpobLicence}</span>
 <span className="text-sm font-semibold text-slate-800">{farmer.mpobLicence}</span>
 </div>

 <div>
 <span className="text-xs text-slate-400 block font-medium">{currentT.plotLoc}</span>
 <span className="text-sm font-semibold text-slate-800 flex items-center gap-1">
 <IconPin className={`${ICON.STATUS} text-slate-400`} aria-hidden="true" />
 {farmer.plotLocation}
 </span>
 </div>

 <div>
 <span className="text-xs text-slate-400 block font-medium">{currentT.plotArea}</span>
 <span className="text-sm font-medium text-slate-800">{farmer.plotArea} hectares</span>
 </div>

 <div>
 <span className="text-xs text-slate-400 block font-medium">{currentT.polyWaypoints}</span>
 <span className="text-xs bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-md text-slate-600 block mt-1">
 {farmer.polygonWaypoints.length} collected, +/-4m accuracy
 </span>
 </div>

 <div>
 <span className="text-xs text-slate-400 block font-medium">{currentT.deforestStatus}</span>
 <span className={`text-xs font-medium font-sans flex items-center gap-1.5 mt-1 ${isFlagged ? 'text-rose-600' : 'text-emerald-600'}`}>
 <span className={`w-2 h-2 rounded-full ${isFlagged ? 'bg-rose-500' : 'bg-emerald-500'}`} />
 {farmer.whispStatus}
 </span>
 </div>
 </div>
 </div>

 {/* Column 2: Compliance Criteria checklist */}
 <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col gap-4">
 <div className="border-b border-slate-100 pb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
 <h3 className="type-card-heading text-slate-700 flex items-center gap-2">
 <IconVerified className="w-4 h-4 text-indigo-600" aria-hidden="true" />
 <span>{lang === 'EN' ? 'Practice checks' : 'Semakan amalan'}</span>
 </h3>
 <span className="text-xs font-medium bg-indigo-50 border border-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full ">
 MSPO 2.0 / EUDR audit
 </span>
 </div>

 {/* ESG Tab Selectors */}
 <div className="grid grid-cols-3 gap-2 bg-slate-50 border border-slate-200 p-1.5 rounded-xl">
 {esgCategories.map((cat) => {
 const isActive = activeEsgTab === cat.id;
 return (
 <button
 key={cat.id}
 onClick={() => setActiveEsgTab(cat.id)}
 className={`min-h-11 py-2 px-1 text-center rounded-lg transition-all cursor-pointer font-sans text-xs font-medium flex flex-col items-center gap-0.5 ${
 isActive
 ? cat.bgActive + ' shadow-sm'
 : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100/60'
 }`}
 id={`esg-tab-${cat.id.toLowerCase()}`}
 >
 {cat.id === 'E' ? <IconEnvironment className={ICON.NAV} aria-hidden="true" /> : cat.id === 'S' ? <IconFarmers className={ICON.NAV} aria-hidden="true" /> : <IconGovernance className={ICON.NAV} aria-hidden="true" />}
 <span>{cat.id}</span>
 </button>
 );
 })}
 </div>

 {/* Active Category Description */}
 <div className="bg-slate-50/60 border border-slate-200 rounded-xl p-3 text-xs text-slate-500 leading-relaxed font-sans">
 <strong className="text-slate-800 block text-xs font-medium mb-0.5">{activeCategory.title}</strong>
 {activeCategory.subtitle}
 </div>

 {/* ESG Items List */}
 <div className="flex flex-col gap-3.5 mt-1 overflow-y-auto max-h-[280px] pr-1">
 {activeCategory.items.map((item, idx) => (
 <div key={idx} className="flex items-start gap-2.5">
 <div className="mt-0.5 flex-shrink-0">
 {item.met ? (
 <IconApproved className="w-4 h-4 text-emerald-600" aria-hidden="true" />
 ) : (
 <IconRejected className="w-4 h-4 text-rose-500" aria-hidden="true" />
 )}
 </div>
 <div className="flex-grow">
 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-x-2 gap-y-0.5">
 <span className={`text-xs font-medium ${item.met ? 'text-slate-800' : 'text-slate-400 font-medium'}`}>
 {item.name}
 </span>
 <span className="text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-100 px-1.5 py-0.2 rounded shrink-0">
 {item.anchor}
 </span>
 </div>
 <span className="block text-xs text-slate-500 mt-1 font-sans leading-relaxed">
 {item.details}
 </span>
 </div>
 </div>
 ))}
 </div>

 <div className="mt-auto pt-3 border-t border-slate-100 flex justify-between items-center bg-indigo-50/50 p-3 rounded-xl border border-indigo-200/40 shadow-sm">
 <span className="text-xs font-medium text-slate-700">{currentT.complianceScore}</span>
 <span className={`type-metric ${farmer.score >= 75 ? 'text-indigo-700' : 'text-slate-600'}`}>
 {farmer.score} / 100
 </span>
 </div>
 </div>
 </div>

 {/* Score formula and weights */}
 <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col gap-5 animate-fade-in" id="score-breakdown-section">
 <div className="border-b border-slate-100 pb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
 <h3 className="type-card-heading text-slate-700 flex items-center gap-2">
 <IconGovernance className="w-4 h-4 text-indigo-600" aria-hidden="true" />
 <span>{lang === 'EN' ? 'Score formula and weights' : 'Formula skor dan pemberat'}</span>
 </h3>
 <span className="text-xs font-medium bg-indigo-50 border border-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full self-start sm:self-auto">
 {lang === 'EN' ? 'MSPO MS2530 weight model' : 'Model pemberat MS2530 MSPO'}
 </span>
 </div>

 {/* Visual formula */}
 <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl text-center shadow-sm">
 <span className="text-xs text-slate-400 block mb-2 font-medium">
 {lang === 'EN' ? 'Main compliance formula' : 'Formula pematuhan utama'}
 </span>
 <div className="text-xs md:text-sm font-semibold text-slate-800 flex flex-wrap justify-center items-center gap-2 leading-none">
 <span className="bg-emerald-50 text-emerald-800 px-2.5 py-1.5 rounded-lg border border-emerald-200 shadow-xs">
 E ({lang === 'EN' ? 'Environment' : 'Alam sekitar'}) [40%]
 </span>
 <span className="text-slate-400 font-normal text-base">+</span>
 <span className="bg-indigo-50 text-indigo-800 px-2.5 py-1.5 rounded-lg border border-indigo-200 shadow-xs">
 S ({lang === 'EN' ? 'Social' : 'Sosial'}) [30%]
 </span>
 <span className="text-slate-400 font-normal text-base">+</span>
 <span className="bg-amber-50 text-amber-800 px-2.5 py-1.5 rounded-lg border border-amber-200 shadow-xs">
 G ({lang === 'EN' ? 'Governance' : 'Tadbir urus'}) [30%]
 </span>
 <span className="text-slate-500 font-normal text-base">=</span>
 <span className="bg-indigo-700 text-white px-3 py-1.5 rounded-lg border border-indigo-700 shadow-sm">
 100% {lang === 'EN' ? 'Total score' : 'Jumlah skor'}
 </span>
 </div>
 </div>

 <EsgScoreBreakdown categories={esgCategories} language={lang} />

 {/* Calculated total */}
 <div className="bg-indigo-50/40 border border-indigo-100 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
 <div className="flex items-center gap-3">
 <div className="bg-indigo-600 text-white rounded-lg p-2 flex-shrink-0 shadow-sm">
 <IconCertificate className="h-6 w-6" aria-hidden="true" />
 </div>
 <div>
 <h4 className="text-xs font-semibold text-slate-800">
 {lang === 'EN' ? 'Score calculation' : 'Kiraan skor'}
 </h4>
 <p className="text-xs text-slate-500 font-medium font-sans mt-0.5">
 {lang === 'EN'
 ? `Parts: E (${earnedEPoints} pts) + S (${earnedSPoints} pts) + G (${earnedGPoints} pts) = ${totalCalculatedScore} / 100`
 : `Bahagian: E (${earnedEPoints} mata) + S (${earnedSPoints} mata) + G (${earnedGPoints} mata) = ${totalCalculatedScore} / 100`}
 </p>
 </div>
 </div>
 <div className="flex items-center gap-3 sm:text-right self-end sm:self-auto shrink-0">
 <div>
 <span className="text-xs text-slate-400 block font-medium leading-none">
 {lang === 'EN' ? 'Score' : 'Skor'}
 </span>
 <span className="type-metric text-indigo-700 block mt-1">
 {farmer.score} / 100
 </span>
 </div>
 <div className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg border ${
 farmer.score >= 75
 ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
 : farmer.score >= 50
 ? 'bg-amber-50 text-amber-700 border-amber-200'
 : 'bg-rose-50 text-rose-700 border-rose-200'
 }`}>
 {farmer.score >= 75
 ? (lang === 'EN' ? 'Passed' : 'Lulus')
 : (lang === 'EN' ? 'Incomplete' : 'Belum lengkap')}
 </div>
 </div>
 </div>
 </div>

 {/* Server-side Rule Evaluation */}
 <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col gap-4 animate-fade-in" id="portal-compliance-engine-rules">
 <div className="border-b border-slate-100 pb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
 <h3 className="type-card-heading text-slate-700 flex items-center gap-2">
 <IconVerified className="w-4 h-4 text-indigo-600" aria-hidden="true" />
 <span>{lang === 'EN' ? 'Rule check' : 'Semakan peraturan'}</span>
 </h3>
 <span className={`text-xs font-medium px-2 py-0.5 rounded-full border self-start sm:self-auto ${
 complianceEvaluation?.certificationEligible
 ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
 : complianceEvaluation?.status === FarmerStatus.FLAGGED
 ? 'bg-rose-50 border-rose-200 text-rose-700'
 : 'bg-amber-50 border-amber-200 text-amber-700'
 }`}>
 {complianceEvaluation?.status || farmer.status}
 </span>
 </div>

 {!complianceEvaluation ? (
 <div className="text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-xl p-3 font-semibold">
 {lang === 'EN' ? 'Compliance decision is loading.' : 'Keputusan pematuhan sedang dimuatkan.'}
 </div>
 ) : (
 <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
 {complianceEvaluation.rules.map((rule) => (
 <div key={rule.id} className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-start gap-2">
 {rule.passed ? (
 <IconApproved className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" aria-hidden="true" />
 ) : (
 <IconRejected className="w-4 h-4 text-rose-500 mt-0.5 flex-shrink-0" aria-hidden="true" />
 )}
 <div>
 <span className="text-xs font-medium text-slate-700">
 {rule.label}
 </span>
 <p className="text-xs text-slate-500 mt-1 leading-relaxed">{rule.details}</p>
 </div>
 </div>
 ))}
 </div>
 )}
 </div>

 {/* Evidence Summary Section */}
 <div className="bg-indigo-50/30 border border-indigo-200 rounded-2xl p-6 shadow-sm flex flex-col gap-5">
 <h3 className="type-card-heading text-indigo-900 border-b border-indigo-100 pb-2 flex items-center gap-2">
 <IconGovernance className="w-4 h-4 text-indigo-700" aria-hidden="true" />
 {currentT.evidenceSummary}
 </h3>

 <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center md:text-left">
 <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm">
 <span className="text-xs text-slate-400 block font-medium">{currentT.dailyCheckins}</span>
 <span className="type-metric text-slate-800 mt-1 block">
 {farmer.evidenceSummary.checkIns} / 90
 </span>
 </div>

 <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm">
 <span className="text-xs text-slate-400 block font-medium">{currentT.activitiesRec}</span>
 <span className="text-xs font-medium text-slate-600 mt-2 block leading-relaxed capitalize">
 {Object.keys(farmer.evidenceSummary.activities).join(', ')}
 </span>
 </div>

 <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm">
 <span className="text-xs text-slate-400 block font-medium">{currentT.weighbridgeDeliv}</span>
 <span className="type-metric text-slate-800 mt-1 block">
 {farmer.evidenceSummary.deliveries} {currentT.transactions}
 </span>
 </div>
 </div>

 <div className="flex flex-col gap-2 mt-2 text-xs border-t border-indigo-100 pt-3">
 <div className="flex flex-wrap items-center gap-1.5 text-slate-500">
 <IconHash className={`${ICON.STATUS} text-slate-400`} aria-hidden="true" />
 <span>{currentT.auditHash}:</span>
 {certificateValidity.verificationHash ? (
 <>
 <span className="text-slate-800 font-medium bg-white border border-slate-200 px-1.5 py-0.5 rounded shadow-sm break-all">
 {certificateValidity.verificationHash}
 </span>
 <span className="text-slate-500">({currentT.anchored})</span>
 </>
 ) : (
 <span className="text-amber-800 font-medium bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
 {currentT.hashUnavailable}
 </span>
 )}
 </div>

 <p className="text-slate-500 leading-relaxed bg-white/70 p-2.5 rounded-lg border border-slate-200 text-xs mt-2 shadow-sm">
 {currentT.buyerNotice}
 </p>
 </div>
 </div>

 </div>

 {showCertModal && (
 <MspoCertificate
 farmer={farmer}
 certificate={activeCertificate}
 onClose={() => setShowCertModal(false)}
 lang={lang}
 />
 )}
 </div>
 );
};
