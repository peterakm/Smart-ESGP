import { useState, useMemo, lazy, Suspense, useEffect } from 'react';
import { initialFarmers, SAMPLE_DATA_AS_OF } from './data/mockFarmers';
import { CertificateRecord, ConsentRecord, EvidenceRecord, Farmer, FarmerStatus, SystemAuditEvent } from './types';
import type { WhatsAppFarmerSession, WhatsAppMonitoringEvent, WhatsAppProviderMessageClaim } from './contracts/whatsapp';
import type { ComplianceEvaluation } from './services/complianceEngine';
import { getStableCertificateId } from './utils/certificates';
import { apiFetch } from './api/client';
import {
 ICON,
 IconBook, IconChart, IconChat, IconClose, IconDashboard, IconDocument,
 IconFarmer, IconList, IconMenu, IconTable,
 type AppIcon,
} from './components/icons';
import { SmartEsgpMark } from './components/SmartEsgpMark';
import { ApiTokenGate } from './components/ApiTokenGate';
import { motion, AnimatePresence, MotionConfig } from 'motion/react';

const DealerDashboard = lazy(() =>
 import('./components/DealerDashboard').then((module) => ({ default: module.DealerDashboard }))
);
const VerificationPortal = lazy(() =>
 import('./components/VerificationPortal').then((module) => ({ default: module.VerificationPortal }))
);

interface FarmersApiResponse {
 farmers: Farmer[];
}

interface FarmerApiResponse {
 farmer: Farmer;
}

interface WhatsAppSessionsApiResponse {
 sessions: WhatsAppFarmerSession[];
}

interface WhatsAppEventsApiResponse {
 events: WhatsAppMonitoringEvent[];
 farmerId?: string;
}

interface WhatsAppClaimsApiResponse {
 claims: WhatsAppProviderMessageClaim[];
}

interface EvidenceApiResponse {
 evidence: EvidenceRecord[];
}

interface SystemAuditEventsApiResponse {
 events: SystemAuditEvent[];
}

interface CertificatesApiResponse {
 certificates: CertificateRecord[];
}

interface ConsentsApiResponse {
 consents: ConsentRecord[];
}

interface CertificateIssueApiResponse {
 certificate: CertificateRecord;
 farmer?: Farmer;
 reused: boolean;
}

interface EvidenceReviewApiResponse {
 evidence: EvidenceRecord;
 farmer?: Farmer;
}

interface IdentityConflictResolveApiResponse {
 session: WhatsAppFarmerSession;
 farmer?: Farmer;
}

interface EvidenceMediaAccessApiResponse {
 accessMode: 'direct_url' | 'authenticated_fetch';
 url: string;
}

interface ComplianceEvaluationApiResponse {
 farmerId: string;
 evaluation: ComplianceEvaluation;
}

type WorkspaceTab = 'dashboard' | 'verification';
type DashboardLanguage = 'EN' | 'BM';

interface WorkspaceNavigationItem {
 id: WorkspaceTab;
 icon: AppIcon;
}

type DashboardAnchorKey = 'triage' | 'metrics' | 'workbench' | 'dossier' | 'whatsapp' | 'guidelines' | 'analytics';

interface DashboardAnchorItem {
 id: string;
 labelKey: DashboardAnchorKey;
 icon: AppIcon;
}

const WORKSPACE_NAVIGATION_ITEMS = [
 {
 id: 'dashboard',
 icon: IconDashboard,
 },
 {
 id: 'verification',
 icon: IconDocument,
 },
] satisfies readonly WorkspaceNavigationItem[];

const DASHBOARD_ANCHOR_ITEMS = [
 { id: 'auditor-triage-band', labelKey: 'triage', icon: IconList },
 { id: 'kpi-cards', labelKey: 'metrics', icon: IconChart },
 { id: 'dashboard-workbench', labelKey: 'workbench', icon: IconTable },
 { id: 'farmer-detail-drilldown', labelKey: 'dossier', icon: IconFarmer },
 { id: 'whatsapp-operations-monitor', labelKey: 'whatsapp', icon: IconChat },
 { id: 'guidelines-library', labelKey: 'guidelines', icon: IconBook },
 { id: 'compliance-charts-grid', labelKey: 'analytics', icon: IconChart },
] satisfies readonly DashboardAnchorItem[];

const WORKSPACE_COPY = {
 EN: {
 auditLabel: 'Smart-ESGP',
 workspaceLabel: "FELDA auditor's workspace",
 dashboardTitle: 'Evidence dashboard',
 verificationTitle: 'Certification review',
 loading: 'Loading workspace...',
 selectedFile: 'Selected certification file',
 backToDashboard: 'Back to dashboard',
 openNavigation: 'Open workspace navigation',
 closeNavigation: 'Close workspace navigation',
 navigationTitle: 'Workspace navigation',
 skipToContent: 'Skip to main content',
 sectionMapTitle: 'Task sections',
 dashboardAnchors: {
 triage: 'Review queue',
 metrics: 'Key numbers',
 workbench: 'Evidence and farmers',
 dossier: 'Farmer file',
 whatsapp: 'WhatsApp messages',
 guidelines: 'Guidelines library',
 analytics: 'Charts',
 },
 nav: {
 dashboard: {
 label: 'Evidence dashboard',
 shortLabel: 'Dashboard',
 description: 'Farmers, WhatsApp intake, audit evidence',
 },
 verification: {
 label: 'Certification review',
 shortLabel: 'Review',
 description: 'Certificate status and rules',
 },
 },
 },
 BM: {
 auditLabel: 'Smart-ESGP',
 workspaceLabel: 'Ruang kerja auditor FELDA',
 dashboardTitle: 'Papan pemuka bukti',
 verificationTitle: 'Semakan pensijilan',
 loading: 'Memuatkan ruang kerja...',
 selectedFile: 'Fail pensijilan dipilih',
 backToDashboard: 'Kembali ke papan pemuka',
 openNavigation: 'Buka navigasi ruang kerja',
 closeNavigation: 'Tutup navigasi ruang kerja',
 navigationTitle: 'Navigasi ruang kerja',
 skipToContent: 'Langkau ke kandungan utama',
 sectionMapTitle: 'Bahagian tugas',
 dashboardAnchors: {
 triage: 'Giliran semakan',
 metrics: 'Nombor utama',
 workbench: 'Bukti dan pekebun',
 dossier: 'Fail pekebun',
 whatsapp: 'Mesej WhatsApp',
 guidelines: 'Pustaka panduan',
 analytics: 'Carta',
 },
 nav: {
 dashboard: {
 label: 'Papan pemuka bukti',
 shortLabel: 'Papan pemuka',
 description: 'Pekebun, WhatsApp, bukti audit',
 },
 verification: {
 label: 'Semakan pensijilan',
 shortLabel: 'Semakan',
 description: 'Status sijil dan peraturan',
 },
 },
 },
} satisfies Record<DashboardLanguage, {
 auditLabel: string;
 workspaceLabel: string;
 dashboardTitle: string;
 verificationTitle: string;
 loading: string;
 selectedFile: string;
 backToDashboard: string;
 openNavigation: string;
 closeNavigation: string;
 navigationTitle: string;
 skipToContent: string;
 sectionMapTitle: string;
 dashboardAnchors: Record<DashboardAnchorKey, string>;
 nav: Record<WorkspaceTab, { label: string; shortLabel: string; description: string }>;
}>;

const KNOWN_APP_PATHS = new Set(['/', '/index.html']);

const AppNotFound = () => (
 <main className="min-h-screen bg-[#f3f6f8] text-slate-900 font-sans selection:bg-emerald-700 selection:text-white grid place-items-center px-4 py-10">
 <section className="w-full max-w-xl rounded-2xl border border-emerald-100 bg-white p-8 shadow-xl shadow-emerald-950/8">
 <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-emerald-100 bg-white p-1.5 shadow-sm">
 <SmartEsgpMark className="h-full w-full object-contain" />
 </div>
 <p className="mt-8 text-xs font-semibold text-emerald-700">404</p>
 <h1 className="mt-2 type-page-title text-slate-950">Page not found</h1>
 <p className="mt-3 text-sm leading-6 text-slate-600">
 The Smart-ESGP workspace does not have a public page at this address.
 </p>
 <a
 href="/"
 className="mt-7 inline-flex min-h-11 items-center rounded-full bg-emerald-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2"
 >
 Return to workspace
 </a>
 </section>
 </main>
);

export default function App() {
 const [farmers, setFarmers] = useState<Farmer[]>(initialFarmers);
 const [whatsappSessions, setWhatsappSessions] = useState<WhatsAppFarmerSession[]>([]);
 const [whatsappEvents, setWhatsappEvents] = useState<WhatsAppMonitoringEvent[]>([]);
 const [whatsappGpsReviewEvents, setWhatsappGpsReviewEvents] = useState<WhatsAppMonitoringEvent[]>([]);
 const [whatsappFailedSendEvents, setWhatsappFailedSendEvents] = useState<WhatsAppMonitoringEvent[]>([]);
 const [whatsappMessageClaims, setWhatsappMessageClaims] = useState<WhatsAppProviderMessageClaim[]>([]);
 const [selectedFarmerWhatsappEvents, setSelectedFarmerWhatsappEvents] = useState<WhatsAppMonitoringEvent[] | null>(null);
 const [evidenceRecords, setEvidenceRecords] = useState<EvidenceRecord[]>([]);
 const [evidenceReviewQueueRecords, setEvidenceReviewQueueRecords] = useState<EvidenceRecord[]>([]);
 const [systemAuditEvents, setSystemAuditEvents] = useState<SystemAuditEvent[]>([]);
 const [systemAuditAlertEvents, setSystemAuditAlertEvents] = useState<SystemAuditEvent[]>([]);
 const [certificates, setCertificates] = useState<CertificateRecord[]>([]);
 const [consentRecords, setConsentRecords] = useState<ConsentRecord[]>([]);
 const [selectedComplianceEvaluation, setSelectedComplianceEvaluation] = useState<ComplianceEvaluation | null>(null);
 const [selectedFarmerId, setSelectedFarmerId] = useState<string>('f-4'); // Tan Wei Hong (flagged) is preselected for interest
 const [activeTab, setActiveTab] = useState<WorkspaceTab>('dashboard');
 const [dashboardLanguage, setDashboardLanguage] = useState<DashboardLanguage>('EN');
 // Farmers start from the bundled sample dataset; this tracks whether live data replaced it.
 const [farmerDataSource, setFarmerDataSource] = useState<'sample' | 'api'>('sample');
 const [farmersRefreshedAt, setFarmersRefreshedAt] = useState<string | null>(null);
 const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
 const [pendingDashboardAnchorId, setPendingDashboardAnchorId] = useState<string | null>(null);
 const [activeDashboardAnchorId, setActiveDashboardAnchorId] = useState('auditor-triage-band');
 const [refreshTick, setRefreshTick] = useState(0);
 // Set when the server rejects this browser's API token (or it has none).
 const [needsApiToken, setNeedsApiToken] = useState(false);

 // Lightweight heartbeat: only the most recent audit event id is fetched every
 // few seconds. Every meaningful backend mutation (WhatsApp activity, evidence
 // review, certificate issuance, farmer updates) writes an audit event, so this
 // is a cheap way to detect "did anything change" without polling every panel's
 // full payload on a blind timer. Panels below only refetch when this changes.
 useEffect(() => {
 let cancelled = false;
 let lastSeenEventId: string | null = null;

 const checkForChanges = async () => {
 try {
 const response = await apiFetch('/api/audit/events?limit=1');
 if (response.status === 401) {
 if (!cancelled) setNeedsApiToken(true);
 return;
 }
 if (!response.ok) return;
 if (!cancelled) setNeedsApiToken(false);

 const data = (await response.json()) as SystemAuditEventsApiResponse;
 const latestId = data.events?.[0]?.id ?? null;

 if (lastSeenEventId === null) {
 lastSeenEventId = latestId;
 return;
 }

 if (latestId !== lastSeenEventId) {
 lastSeenEventId = latestId;
 if (!cancelled) {
 setRefreshTick((tick) => tick + 1);
 }
 }
 } catch (error) {
 console.warn('Change-detection heartbeat failed:', error);
 }
 };

 void checkForChanges();
 const timer = window.setInterval(checkForChanges, 5_000);

 return () => {
 cancelled = true;
 window.clearInterval(timer);
 };
 }, []);

 useEffect(() => {
 let cancelled = false;

 const loadFarmers = async () => {
 try {
 const response = await apiFetch('/api/farmers');
 if (!response.ok) {
 throw new Error(`Farmer API returned ${response.status}`);
 }

 const data = (await response.json()) as FarmersApiResponse;
 if (!Array.isArray(data.farmers) || data.farmers.length === 0 || cancelled) {
 return;
 }

 setFarmers(data.farmers);
 setFarmerDataSource('api');
 setFarmersRefreshedAt(new Date().toISOString());
 setSelectedFarmerId((currentId) =>
 data.farmers.some((farmer) => farmer.id === currentId) ? currentId : data.farmers[0].id
 );
 } catch (error) {
 console.warn('Using local mock farmers because /api/farmers is unavailable:', error);
 }
 };

 void loadFarmers();

 return () => {
 cancelled = true;
 };
 }, [refreshTick]);

 useEffect(() => {
 let cancelled = false;

 const loadSelectedFarmerWhatsAppEvents = async () => {
 try {
 const response = await apiFetch(`/api/whatsapp/farmers/${encodeURIComponent(selectedFarmerId)}/events?limit=50`);
 if (!response.ok) {
 throw new Error(`Farmer WhatsApp events API returned ${response.status}`);
 }

 const data = (await response.json()) as WhatsAppEventsApiResponse;
 if (!cancelled && data.farmerId === selectedFarmerId) {
 setSelectedFarmerWhatsappEvents(Array.isArray(data.events) ? data.events : []);
 }
 } catch (error) {
 if (!cancelled) {
 setSelectedFarmerWhatsappEvents(null);
 }
 console.warn('Farmer-scoped WhatsApp events are unavailable:', error);
 }
 };

 void loadSelectedFarmerWhatsAppEvents();

 return () => {
 cancelled = true;
 };
 }, [selectedFarmerId, refreshTick]);

 useEffect(() => {
 let cancelled = false;

 const loadConsentRecords = async () => {
 try {
 const response = await apiFetch('/api/consents?limit=100');
 if (!response.ok) {
 throw new Error(`Consents API returned ${response.status}`);
 }

 const data = (await response.json()) as ConsentsApiResponse;
 if (!cancelled) {
 setConsentRecords(Array.isArray(data.consents) ? data.consents : []);
 }
 } catch (error) {
 console.warn('Consent records are unavailable:', error);
 }
 };

 void loadConsentRecords();

 return () => {
 cancelled = true;
 };
 }, [refreshTick]);

 useEffect(() => {
 let cancelled = false;

 const loadCertificates = async () => {
 try {
 const response = await apiFetch('/api/certificates?limit=100');
 if (!response.ok) {
 throw new Error(`Certificates API returned ${response.status}`);
 }

 const data = (await response.json()) as CertificatesApiResponse;
 if (!cancelled) {
 setCertificates(Array.isArray(data.certificates) ? data.certificates : []);
 }
 } catch (error) {
 console.warn('Certificate registry is unavailable:', error);
 }
 };

 void loadCertificates();

 return () => {
 cancelled = true;
 };
 }, [refreshTick]);

 useEffect(() => {
 let cancelled = false;

 const loadSystemAuditEvents = async () => {
 try {
 const [response, warningResponse, errorResponse] = await Promise.all([
 apiFetch('/api/audit/events?limit=50'),
 apiFetch('/api/audit/events?severity=warning&limit=25'),
 apiFetch('/api/audit/events?severity=error&limit=25'),
 ]);
 if (!response.ok || !warningResponse.ok || !errorResponse.ok) {
 throw new Error(`Audit API returned ${response.status}`);
 }

 const data = (await response.json()) as SystemAuditEventsApiResponse;
 const warningData = (await warningResponse.json()) as SystemAuditEventsApiResponse;
 const errorData = (await errorResponse.json()) as SystemAuditEventsApiResponse;
 if (!cancelled) {
 setSystemAuditEvents(Array.isArray(data.events) ? data.events : []);
 setSystemAuditAlertEvents([
 ...(Array.isArray(errorData.events) ? errorData.events : []),
 ...(Array.isArray(warningData.events) ? warningData.events : []),
 ].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 25));
 }
 } catch (error) {
 console.warn('System audit events are unavailable:', error);
 }
 };

 void loadSystemAuditEvents();

 return () => {
 cancelled = true;
 };
 }, [refreshTick]);

 useEffect(() => {
 let cancelled = false;

 const loadSelectedEvaluation = async () => {
 try {
 const response = await apiFetch(`/api/compliance/farmers/${encodeURIComponent(selectedFarmerId)}/evaluation?lang=${dashboardLanguage}`);
 if (!response.ok) {
 throw new Error(`Compliance API returned ${response.status}`);
 }

 const data = (await response.json()) as ComplianceEvaluationApiResponse;
 if (!cancelled && data.farmerId === selectedFarmerId) {
 setSelectedComplianceEvaluation(data.evaluation);
 }
 } catch (error) {
 if (!cancelled) {
 setSelectedComplianceEvaluation(null);
 }
 console.warn('Compliance evaluation is unavailable:', error);
 }
 };

 void loadSelectedEvaluation();
 }, [selectedFarmerId, farmers, evidenceRecords, dashboardLanguage, refreshTick]);

 useEffect(() => {
 let cancelled = false;

 const loadWhatsAppMonitoring = async () => {
 try {
 const [sessionsResponse, eventsResponse, gpsReviewEventsResponse, failedSendEventsResponse, claimsResponse] = await Promise.all([
 apiFetch('/api/whatsapp/sessions'),
 apiFetch('/api/whatsapp/events?limit=25'),
 apiFetch('/api/whatsapp/events?gpsReview=true&limit=25'),
 apiFetch('/api/whatsapp/events?outboundMode=failed&limit=25'),
 apiFetch('/api/whatsapp/message-claims?limit=25'),
 ]);

 if (!sessionsResponse.ok || !eventsResponse.ok || !gpsReviewEventsResponse.ok || !failedSendEventsResponse.ok || !claimsResponse.ok) {
 throw new Error('WhatsApp monitoring API returned an error');
 }

 const sessionsData = (await sessionsResponse.json()) as WhatsAppSessionsApiResponse;
 const eventsData = (await eventsResponse.json()) as WhatsAppEventsApiResponse;
 const gpsReviewEventsData = (await gpsReviewEventsResponse.json()) as WhatsAppEventsApiResponse;
 const failedSendEventsData = (await failedSendEventsResponse.json()) as WhatsAppEventsApiResponse;
 const claimsData = (await claimsResponse.json()) as WhatsAppClaimsApiResponse;

 if (cancelled) return;

 setWhatsappSessions(Array.isArray(sessionsData.sessions) ? sessionsData.sessions : []);
 setWhatsappEvents(Array.isArray(eventsData.events) ? eventsData.events : []);
 setWhatsappGpsReviewEvents(Array.isArray(gpsReviewEventsData.events) ? gpsReviewEventsData.events : []);
 setWhatsappFailedSendEvents(Array.isArray(failedSendEventsData.events) ? failedSendEventsData.events : []);
 setWhatsappMessageClaims(Array.isArray(claimsData.claims) ? claimsData.claims : []);
 } catch (error) {
 console.warn('WhatsApp monitoring data is unavailable:', error);
 }
 };

 void loadWhatsAppMonitoring();

 return () => {
 cancelled = true;
 };
 }, [refreshTick]);

 useEffect(() => {
 let cancelled = false;

 const loadEvidence = async () => {
 try {
 const [response, reviewQueueResponse] = await Promise.all([
 apiFetch('/api/evidence?limit=100'),
 apiFetch('/api/evidence?review=open&limit=50'),
 ]);
 if (!response.ok || !reviewQueueResponse.ok) {
 throw new Error(`Evidence API returned ${response.status}`);
 }

 const data = (await response.json()) as EvidenceApiResponse;
 const reviewQueueData = (await reviewQueueResponse.json()) as EvidenceApiResponse;
 if (!cancelled) {
 setEvidenceRecords(Array.isArray(data.evidence) ? data.evidence : []);
 setEvidenceReviewQueueRecords(Array.isArray(reviewQueueData.evidence) ? reviewQueueData.evidence : []);
 }
 } catch (error) {
 console.warn('Evidence data is unavailable:', error);
 }
 };

 void loadEvidence();

 return () => {
 cancelled = true;
 };
 }, [refreshTick]);

 // The mobile drawer must close on Escape and must not leave the page scrollable behind it.
 useEffect(() => {
 if (!isMobileNavOpen) return undefined;

 const handleKeyDown = (event: KeyboardEvent) => {
 if (event.key === 'Escape') setIsMobileNavOpen(false);
 if (event.key !== 'Tab') return;
 const controls = document.querySelectorAll<HTMLElement>('#mobile-nav-drawer button');
 const first = controls[0];
 const last = controls[controls.length - 1];
 if (event.shiftKey && document.activeElement === first) {
 event.preventDefault();
 last?.focus();
 } else if (!event.shiftKey && document.activeElement === last) {
 event.preventDefault();
 first?.focus();
 }
 };

 document.addEventListener('keydown', handleKeyDown);
 const desktopViewport = window.matchMedia('(min-width: 1024px)');
 const closeOnDesktop = () => {
 if (desktopViewport.matches) setIsMobileNavOpen(false);
 };
 desktopViewport.addEventListener('change', closeOnDesktop);
 const previousOverflow = document.body.style.overflow;
 document.body.style.overflow = 'hidden';

 return () => {
 document.removeEventListener('keydown', handleKeyDown);
 desktopViewport.removeEventListener('change', closeOnDesktop);
 document.body.style.overflow = previousOverflow;
 document.getElementById('btn-open-mobile-nav')?.focus();
 };
 }, [isMobileNavOpen]);

 useEffect(() => {
 document.getElementById('workspace-scroll-panel')?.scrollTo({ top: 0, behavior: 'auto' });
 window.scrollTo({ top: 0, behavior: 'auto' });
 }, [activeTab]);

 useEffect(() => {
 if (activeTab !== 'dashboard' || !pendingDashboardAnchorId) return undefined;

 const scrollToTarget = () => {
 const target = document.getElementById(pendingDashboardAnchorId);
 if (!target) return false;
 target.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
 setPendingDashboardAnchorId(null);
 return true;
 };
 // The dashboard may still be loading or waiting for the outgoing pane's animation.
 const observer = new MutationObserver(() => {
 if (scrollToTarget()) observer.disconnect();
 });
 const frameId = window.requestAnimationFrame(() => {
 if (!scrollToTarget()) observer.observe(document.getElementById('workspace-main')!, { childList: true, subtree: true });
 });

 return () => {
 window.cancelAnimationFrame(frameId);
 observer.disconnect();
 };
 }, [activeTab, pendingDashboardAnchorId]);

 useEffect(() => {
 if (activeTab !== 'dashboard') return;
 const panel = document.getElementById('workspace-scroll-panel');
 let frameId = 0;
 const updateSection = () => {
 window.cancelAnimationFrame(frameId);
 frameId = window.requestAnimationFrame(() => {
 const top = document.getElementById('auditor-topbar')?.getBoundingClientRect().bottom ?? 0;
 let current = DASHBOARD_ANCHOR_ITEMS[0].id;
 for (const section of DASHBOARD_ANCHOR_ITEMS) {
 const element = document.getElementById(section.id);
 if (element && element.getBoundingClientRect().top <= top + 48) current = section.id;
 }
 setActiveDashboardAnchorId(current);
 });
 };
 panel?.addEventListener('scroll', updateSection, { passive: true });
 window.addEventListener('scroll', updateSection, { passive: true });
 updateSection();
 return () => {
 panel?.removeEventListener('scroll', updateSection);
 window.removeEventListener('scroll', updateSection);
 window.cancelAnimationFrame(frameId);
 };
 }, [activeTab]);

 // Find currently selected farmer in dashboard
 const selectedFarmer = useMemo(() => {
 return farmers.find((f) => f.id === selectedFarmerId) || farmers[0];
 }, [farmers, selectedFarmerId]);

 const handleViewCertificate = (farmerId: string) => {
 setSelectedFarmerId(farmerId);
 setActiveTab('verification');
 };

 const handleDashboardAnchor = (sectionId: string) => {
 setActiveTab('dashboard');
 setIsMobileNavOpen(false);
 setPendingDashboardAnchorId(sectionId);
 };

 const applyFarmerToState = (updatedFarmer: Farmer) => {
 setFarmers((prev) =>
 prev.map((f) => (f.id === updatedFarmer.id ? updatedFarmer : f))
 );
 };

 const persistFarmerUpdate = async (updatedFarmer: Farmer) => {
 try {
 const response = await apiFetch(`/api/farmers/${encodeURIComponent(updatedFarmer.id)}`, {
 method: 'PUT',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(updatedFarmer),
 });

 if (!response.ok) {
 throw new Error(`Farmer API returned ${response.status}`);
 }

 const data = (await response.json()) as FarmerApiResponse;
 if (data.farmer) {
 applyFarmerToState(data.farmer);
 }
 } catch (error) {
 console.warn('Farmer update is local-only because persistence failed:', error);
 }
 };

 // Handle check-ins, language selects, or fast forwards from WhatsApp
 const handleFarmerUpdate = (updatedFarmer: Farmer) => {
 applyFarmerToState(updatedFarmer);
 void persistFarmerUpdate(updatedFarmer);
 };

 // Auditor action: Clear flag (justification is captured in the confirmation step)
 const handleClearFlag = (farmerId: string, justification?: string) => {
 const farmer = farmers.find((f) => f.id === farmerId);
 if (!farmer) return;

 const clearedJustification = justification?.trim();

 const isEligibleForCert = farmer.daysCollected >= 90;
 const nextStatus = isEligibleForCert ? FarmerStatus.CERTIFIED : FarmerStatus.IN_PROGRESS;
 const updatedFarmer: Farmer = {
 ...farmer,
 status: nextStatus,
 score: Math.max(78, farmer.score + 10), // Boost score back above threshold
 mspoCertId: farmer.mspoCertId === 'UNASSIGNED' || farmer.mspoCertId.startsWith('PENDING')
 ? getStableCertificateId(farmer)
 : farmer.mspoCertId,
 anomalies: [],
 auditLogs: [
 {
 timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
 action: 'Flag cleared',
 user: 'MPOCC lead auditor',
 details: clearedJustification
 ? `Flag cleared after auditor review. Justification: ${clearedJustification}`
 : 'Flag cleared after auditor review. No justification was recorded.',
 },
 ...farmer.auditLogs,
 ],
 };

 handleFarmerUpdate(updatedFarmer);
 };

 // Auditor action: apply a rule exception
 const handleApplyOverride = (farmerId: string, overrideDetails: string) => {
 const farmer = farmers.find((f) => f.id === farmerId);
 if (!farmer) return;

 const isEligibleForCert = farmer.daysCollected >= 90;
 const nextStatus = isEligibleForCert ? FarmerStatus.CERTIFIED : FarmerStatus.IN_PROGRESS;
 const updatedFarmer: Farmer = {
 ...farmer,
 status: nextStatus,
 score: Math.max(80, farmer.score + 15),
 mspoCertId: farmer.mspoCertId === 'UNASSIGNED' || farmer.mspoCertId.startsWith('PENDING')
 ? getStableCertificateId(farmer)
 : farmer.mspoCertId,
 auditLogs: [
 {
 timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
 action: 'Rule exception recorded',
 user: 'FELDA senior auditor',
 details: `Rule exception recorded. Reason: ${overrideDetails}`,
 },
 ...farmer.auditLogs,
 ],
 };

 handleFarmerUpdate(updatedFarmer);
 };

 const handleReviewEvidence = async (
 evidenceId: string,
 decision: NonNullable<EvidenceRecord['review']>['status'],
 notes?: string
 ) => {
 try {
 const response = await apiFetch(`/api/evidence/${encodeURIComponent(evidenceId)}/review`, {
 method: 'PATCH',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 decision,
 notes,
 reviewedBy: 'FELDA dashboard auditor',
 }),
 });

 if (!response.ok) {
 throw new Error(`Evidence review API returned ${response.status}`);
 }

 const data = (await response.json()) as EvidenceReviewApiResponse;

 if (data.evidence) {
 setEvidenceRecords((prev) =>
 prev.map((record) => (record.id === data.evidence.id ? data.evidence : record))
 );

 // The review queue only shows 'pending' or 'flagged' items (matches the
 // backend's ?review=open filter). Update it immediately instead of
 // waiting for the next full refresh, so the queue doesn't keep showing
 // an already-reviewed record as still open.
 const stillOpen = data.evidence.review?.status === 'pending' || data.evidence.review?.status === 'flagged';
 setEvidenceReviewQueueRecords((prev) => {
 const withoutRecord = prev.filter((record) => record.id !== data.evidence.id);
 return stillOpen ? [data.evidence, ...withoutRecord] : withoutRecord;
 });
 }

 if (data.farmer) {
 applyFarmerToState(data.farmer);
 }
 } catch (error) {
 console.warn('Evidence review failed:', error);
 }
 };

 const handleResolveIdentityConflict = async (phoneNumber: string, decision: 'approve' | 'reject') => {
 try {
 const response = await apiFetch(`/api/whatsapp/sessions/${encodeURIComponent(phoneNumber)}/identity-conflict`, {
 method: 'PATCH',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 decision,
 reviewedBy: 'FELDA Dashboard Auditor',
 }),
 });

 if (!response.ok) {
 throw new Error(`Identity conflict API returned ${response.status}`);
 }

 const data = (await response.json()) as IdentityConflictResolveApiResponse;

 if (data.session) {
 setWhatsappSessions((prev) =>
 prev.map((session) => (session.phoneNumber === data.session.phoneNumber ? data.session : session))
 );
 }

 if (data.farmer) {
 applyFarmerToState(data.farmer);
 }
 } catch (error) {
 console.warn('Identity conflict resolution failed:', error);
 }
 };

 const handleOpenEvidenceMedia = async (evidenceId: string) => {
 try {
 const accessResponse = await apiFetch(`/api/evidence/${encodeURIComponent(evidenceId)}/media-url`);
 if (!accessResponse.ok) {
 throw new Error(`Media access API returned ${accessResponse.status}`);
 }

 const access = (await accessResponse.json()) as EvidenceMediaAccessApiResponse;

 if (access.accessMode === 'direct_url') {
 window.open(access.url, '_blank', 'noopener,noreferrer');
 return;
 }

 const mediaResponse = await apiFetch(access.url);
 if (!mediaResponse.ok) {
 throw new Error(`Media stream returned ${mediaResponse.status}`);
 }

 const mediaBlob = await mediaResponse.blob();
 const objectUrl = URL.createObjectURL(mediaBlob);
 window.open(objectUrl, '_blank', 'noopener,noreferrer');
 window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
 } catch (error) {
 console.error('Unable to open evidence media:', error);
 window.alert('Evidence media is not available yet or your session cannot access it.');
 }
 };

 const handleIssueCertificate = async (farmerId: string) => {
 try {
 const response = await apiFetch('/api/certificates/issue', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 farmerId,
 issuedBy: 'FELDA certification officer',
 }),
 });

 if (!response.ok) {
 throw new Error(`Certificate issue API returned ${response.status}`);
 }

 const data = (await response.json()) as CertificateIssueApiResponse;
 if (data.certificate) {
 setCertificates((prev) => {
 const withoutExisting = prev.filter((certificate) => certificate.id !== data.certificate.id);
 return [data.certificate, ...withoutExisting];
 });
 }

 if (data.farmer) {
 applyFarmerToState(data.farmer);
 }
 } catch (error) {
 console.warn('Certificate issuance failed:', error);
 }
 };

 const workspaceCopy = WORKSPACE_COPY[dashboardLanguage];
 const currentPath = typeof window === 'undefined' ? '/' : window.location.pathname;

 if (!KNOWN_APP_PATHS.has(currentPath)) {
 return <AppNotFound />;
 }

 if (needsApiToken) {
 return <ApiTokenGate language={dashboardLanguage} />;
 }

 return (
 <MotionConfig reducedMotion="user">
 <div className="min-h-[100dvh] overflow-x-hidden bg-[#f3f6f8] text-slate-900 font-sans selection:bg-emerald-700 selection:text-white lg:h-[100dvh] lg:overflow-hidden" id="main-container">
 <a
 href="#workspace-main"
 className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-100 focus:rounded-xl focus:bg-slate-950 focus:px-4 focus:py-3 focus:text-sm focus:font-medium focus:text-white"
 >
 {workspaceCopy.skipToContent}
 </a>
 <div className="min-h-[100dvh] min-w-0 max-w-full lg:grid lg:h-[100dvh] lg:min-h-0 lg:grid-cols-[280px_minmax(0,1fr)]" id="workspace-shell">
 <aside className="hidden h-[100dvh] overflow-hidden lg:flex bg-[#0f1f1b] text-white border-r border-emerald-950/70 flex-col" id="auditor-sidebar">
 <div className="p-6 border-b border-white/10">
 <button
 type="button"
 onClick={() => setActiveTab('dashboard')}
 className="flex min-h-11 w-full items-center gap-3 rounded-2xl text-left transition hover:bg-white/6 focus:outline-none"
 aria-label="Go to auditor dashboard"
 id="brand-home-button"
 >
 <div className="w-14 h-14 rounded-xl bg-white p-1.5 flex items-center justify-center shadow-lg shadow-emerald-950/20">
 <SmartEsgpMark className="h-full w-full object-contain" />
 </div>
 <div>
 <p className="text-xs font-medium text-emerald-200/80">FELDA</p>
 <span className="block type-card-heading text-white">Smart-ESGP</span>
 </div>
 </button>
 </div>

 <nav className="flex min-h-0 flex-1 flex-col p-4" id="workspace-tabs">
 <div className="space-y-2">
 {WORKSPACE_NAVIGATION_ITEMS.map((item) => {
 const Icon = item.icon;
 const isActive = activeTab === item.id;
 return (
 <button
 key={item.id}
 onClick={() => setActiveTab(item.id)}
 aria-current={isActive ? 'page' : undefined}
 className={`w-full flex items-start gap-3 rounded-xl px-3.5 py-3 text-left transition-all cursor-pointer ${
 isActive
 ? 'bg-white text-slate-950 shadow-lg shadow-black/10'
 : 'text-emerald-50/75 hover:bg-white/8 hover:text-white'
 }`}
 id={item.id === 'dashboard' ? 'tab-dashboard-trigger' : 'tab-verification-trigger'}
 >
 <Icon className={`${ICON.NAV} mt-0.5 ${isActive ? 'text-emerald-700' : 'text-emerald-200'}`} aria-hidden="true" />
 <span className="min-w-0">
 <span className="block text-sm font-medium">{workspaceCopy.nav[item.id].label}</span>
 <span className={`block mt-0.5 text-xs leading-snug ${isActive ? 'text-slate-500' : 'text-emerald-100/55'}`}>
 {workspaceCopy.nav[item.id].description}
 </span>
 </span>
 </button>
 );
 })}
 </div>

 {activeTab === 'dashboard' && (
 <div className="mt-6 flex min-h-0 flex-1 flex-col border-t border-white/10 pt-4">
 <p className="px-2 text-xs font-semibold text-emerald-100/65">
 {workspaceCopy.sectionMapTitle}
 </p>
 <div className="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1" id="task-sections-scroll">
 {DASHBOARD_ANCHOR_ITEMS.map((item) => {
 const Icon = item.icon;
 return (
 <button
 key={item.id}
 type="button"
 onClick={() => handleDashboardAnchor(item.id)}
 aria-current={activeDashboardAnchorId === item.id ? 'location' : undefined}
 className="flex w-full min-h-11 items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium text-emerald-50/72 transition-colors hover:bg-white/8 hover:text-white cursor-pointer"
 id={`sidebar-anchor-${item.labelKey}`}
 >
 <Icon className="h-4 w-4 text-emerald-200" aria-hidden="true" />
 <span className="truncate">{workspaceCopy.dashboardAnchors[item.labelKey]}</span>
 </button>
 );
 })}
 </div>
 </div>
 )}
 </nav>
 <div className="workspace-sidebar-footer">
 <span className="workspace-avatar" aria-hidden="true">F</span>
 <div><span className="block text-sm font-semibold">FELDA</span><span className="text-xs text-emerald-100/75">{workspaceCopy.workspaceLabel}</span></div>
 </div>
 </aside>

 <div className="min-w-0 flex flex-col lg:h-[100dvh] lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain" id="workspace-scroll-panel">
 <header inert={isMobileNavOpen} className="sticky top-0 z-50 bg-white/92 backdrop-blur border-b border-slate-200/80" id="auditor-topbar">
 <div className="w-full max-w-full px-4 md:px-6 py-3 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
 <div className="flex w-full min-w-0 max-w-full items-center gap-3 xl:w-auto">
 <button
 type="button"
 onClick={() => setIsMobileNavOpen(true)}
 aria-expanded={isMobileNavOpen}
 aria-controls="mobile-nav-drawer"
 aria-label={workspaceCopy.openNavigation}
 className="lg:hidden w-11 h-11 shrink-0 rounded-xl border border-slate-200 bg-white flex items-center justify-center text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
 id="btn-open-mobile-nav"
 >
 <IconMenu className="w-5 h-5" aria-hidden="true" />
 </button>
 <div className="min-w-0">
 <p className="workspace-eyebrow">Smart-ESGP <span aria-hidden="true">/</span> {workspaceCopy.workspaceLabel}</p>
 <h1 className="type-page-title max-w-full whitespace-normal break-words text-slate-950">
 {activeTab === 'dashboard' ? workspaceCopy.dashboardTitle : workspaceCopy.verificationTitle}
 </h1>
 </div>
 </div>

 <div className="flex flex-col sm:flex-row sm:items-center gap-2">
 <div className="grid grid-cols-2 bg-slate-100 border border-slate-200 p-1 rounded-xl" aria-label="Dashboard language">
 {(['EN', 'BM'] as const).map((language) => (
 <button
 key={language}
 type="button"
 onClick={() => setDashboardLanguage(language)}
 aria-pressed={dashboardLanguage === language}
 className={`h-11 min-w-11 rounded-lg px-3 text-xs font-semibold transition-all cursor-pointer ${
 dashboardLanguage === language
 ? 'bg-emerald-700 text-white shadow-sm'
 : 'text-slate-600 hover:bg-white hover:text-slate-900'
 }`}
 id={`btn-dashboard-language-${language.toLowerCase()}`}
 >
 {language}
 </button>
 ))}
 </div>
 {systemAuditAlertEvents.length > 0 && (
 <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 shadow-sm">
 <span className="text-xs font-medium text-amber-800">{systemAuditAlertEvents.length} audit alerts</span>
 </div>
 )}
 </div>
 </div>
 </header>

 {/* Mobile navigation drawer, driven by the header menu button */}
 {isMobileNavOpen && (
 <div className="lg:hidden fixed inset-0 z-100 flex">
 <div
 className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
 onClick={() => setIsMobileNavOpen(false)}
 aria-hidden="true"
 />
 <nav
 id="mobile-nav-drawer"
 role="dialog"
 aria-modal="true"
 aria-label={workspaceCopy.navigationTitle}
 className="relative z-10 flex h-full w-[86%] max-w-xs flex-col bg-[#0f1f1b] text-white shadow-2xl"
 >
 <div className="flex items-center justify-between gap-3 border-b border-white/10 p-4">
 <div className="flex items-center gap-3">
 <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white p-1.5">
 <SmartEsgpMark className="h-full w-full object-contain" />
 </span>
 <span>
 <span className="block text-xs font-medium text-emerald-200/80">
 {workspaceCopy.auditLabel}
 </span>
 <span className="block text-base font-semibold">Smart-ESGP</span>
 </span>
 </div>
 <button
 type="button"
 onClick={() => setIsMobileNavOpen(false)}
 aria-label={workspaceCopy.closeNavigation}
 className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/20 text-white hover:bg-white/10 transition-colors cursor-pointer"
 id="btn-close-mobile-nav"
 autoFocus
 >
 <IconClose className="h-5 w-5" aria-hidden="true" />
 </button>
 </div>

 <div className="flex min-h-0 flex-1 flex-col p-4">
 <div className="space-y-2">
 {WORKSPACE_NAVIGATION_ITEMS.map((item) => {
 const Icon = item.icon;
 const isActive = activeTab === item.id;
 return (
 <button
 key={item.id}
 type="button"
 onClick={() => {
 setActiveTab(item.id);
 setIsMobileNavOpen(false);
 }}
 aria-current={isActive ? 'page' : undefined}
 className={`flex w-full min-h-14 items-start gap-3 rounded-xl px-4 py-3 text-left transition-colors cursor-pointer ${
 isActive ? 'bg-white text-slate-950' : 'text-emerald-50/80 hover:bg-white/10 hover:text-white'
 }`}
 id={`mobile-nav-${item.id}`}
 >
 <Icon className={`mt-0.5 ${ICON.NAV} ${isActive ? 'text-emerald-700' : 'text-emerald-200'}`} aria-hidden="true" />
 <span className="min-w-0">
 <span className="block text-sm font-medium">{workspaceCopy.nav[item.id].label}</span>
 <span className={`mt-0.5 block text-xs leading-snug ${isActive ? 'text-slate-600' : 'text-emerald-100/70'}`}>
 {workspaceCopy.nav[item.id].description}
 </span>
 </span>
 </button>
 );
 })}
 </div>

 <div className="mt-5 flex min-h-0 flex-1 flex-col border-t border-white/10 pt-4">
 <p className="px-1 text-xs font-semibold text-emerald-100/65">
 {workspaceCopy.sectionMapTitle}
 </p>
 <div className="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1" id="mobile-task-sections-scroll">
 {DASHBOARD_ANCHOR_ITEMS.map((item, index) => {
 const Icon = item.icon;
 return (
 <button
 key={item.id}
 type="button"
 onClick={() => handleDashboardAnchor(item.id)}
 className="flex w-full min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-left text-xs font-medium text-emerald-50/80 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
 id={`mobile-anchor-${item.labelKey}`}
 >
 <span className="w-4 shrink-0 text-right text-xs font-semibold text-emerald-100/60">
 {index + 1}
 </span>
 <Icon className="h-4 w-4 text-emerald-200" aria-hidden="true" />
 <span>{workspaceCopy.dashboardAnchors[item.labelKey]}</span>
 </button>
 );
 })}
 </div>
 </div>
 </div>

 </nav>
 </div>
 )}

        <main id="workspace-main" inert={isMobileNavOpen} tabIndex={-1} className="min-w-0 w-full overflow-x-hidden px-4 pt-4 pb-8 md:px-6 md:pt-6 md:pb-10 xl:px-8 xl:pt-8 xl:pb-10">
 <Suspense
 fallback={
 <div className="workspace-loading" role="status">
 <span className="workspace-loading-bar" aria-hidden="true" />
 <p>{workspaceCopy.loading}</p>
 <div className="workspace-loading-grid" aria-hidden="true"><span /><span /><span /><span /></div>
 </div>
 }
 >
 <AnimatePresence mode="wait">
 {activeTab === 'dashboard' && (
 <motion.div
 key="dashboard"
 initial={{ opacity: 0, y: 10 }}
 animate={{ opacity: 1, y: 0 }}
 exit={{ opacity: 0, y: -10 }}
 transition={{ duration: 0.2 }}
 id="pane-dashboard"
 >
 <DealerDashboard
 farmers={farmers}
 whatsappSessions={whatsappSessions}
 whatsappEvents={whatsappEvents}
 whatsappGpsReviewEvents={whatsappGpsReviewEvents}
 whatsappFailedSendEvents={whatsappFailedSendEvents}
 whatsappMessageClaims={whatsappMessageClaims}
 selectedFarmerWhatsappEvents={selectedFarmerWhatsappEvents}
 evidenceRecords={evidenceRecords}
 evidenceReviewQueueRecords={evidenceReviewQueueRecords}
 systemAuditEvents={systemAuditEvents}
 systemAuditAlertEvents={systemAuditAlertEvents}
 certificates={certificates}
 consentRecords={consentRecords}
 complianceEvaluation={selectedComplianceEvaluation}
 selectedFarmerId={selectedFarmerId}
 onSelectFarmer={setSelectedFarmerId}
 onViewCertificate={handleViewCertificate}
 onClearFlag={handleClearFlag}
 onApplyOverride={handleApplyOverride}
 onReviewEvidence={handleReviewEvidence}
 onResolveIdentityConflict={handleResolveIdentityConflict}
 onOpenEvidenceMedia={handleOpenEvidenceMedia}
 onIssueCertificate={handleIssueCertificate}
 language={dashboardLanguage}
 isSampleData={farmerDataSource === 'sample'}
 sampleDataAsOf={SAMPLE_DATA_AS_OF}
 dataRefreshedAt={farmersRefreshedAt}
 />
 </motion.div>
 )}

 {activeTab === 'verification' && (
 <motion.div
 key="verification"
 initial={{ opacity: 0, y: 10 }}
 animate={{ opacity: 1, y: 0 }}
 exit={{ opacity: 0, y: -10 }}
 transition={{ duration: 0.2 }}
 id="pane-verification"
 >
 <VerificationPortal
 farmer={selectedFarmer}
 complianceEvaluation={selectedComplianceEvaluation}
 certificates={certificates}
 onBack={() => setActiveTab('dashboard')}
 language={dashboardLanguage}
 isSampleData={farmerDataSource === 'sample'}
 sampleDataAsOf={SAMPLE_DATA_AS_OF}
 dataRefreshedAt={farmersRefreshedAt}
 />
 </motion.div>
 )}
 </AnimatePresence>
 </Suspense>
 </main>

 </div>
 </div>
 </div>
 </MotionConfig>
 );
}
