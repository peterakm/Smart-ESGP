import { Farmer, FarmerStatus, Waypoint } from '../types';

const ACTIVITY_SEQUENCE: Waypoint['activity'][] = ['harvest', 'prune', 'spray', 'weed', 'inspect'];
const BASE_DATE_UTC = Date.UTC(2026, 5, 30);

/**
 * These records are a fixed sample dataset used only when the farmer API is unreachable.
 * Dates are anchored to this capture date instead of "today" so demo rows can never be
 * mistaken for live operational data.
 */
export const SAMPLE_DATA_AS_OF = '2026-06-30';

// Test-only accounts (WhatsApp onboarding smoke tests) that must not skew portfolio KPIs.
export const TEST_FARMER_IDS: ReadonlySet<string> = new Set(['f-6', 'f-7']);

const deterministicNoise = (index: number, seed: number) => {
 const raw = Math.sin((index + 1) * 12.9898 + seed * 78.233) * 43758.5453;
 return 0.85 + (raw - Math.floor(raw)) * 0.3;
};

const dateDaysAgo = (daysAgo: number) => {
 return new Date(BASE_DATE_UTC - daysAgo * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
};

// Helper to generate stable coordinates around Kluang, Johor (lat: ~2.03, lng: ~103.32)
export const generatePolygon = (centerLat: number, centerLng: number, radius: number, count: number): Waypoint[] => {
 const points: Waypoint[] = [];
 const seed = Math.abs(Math.round((centerLat + centerLng) * 10000));

 for (let i = 0; i < count; i++) {
 const angle = (i / count) * 2 * Math.PI;
 const noise = deterministicNoise(i, seed);
 const lat = centerLat + Math.sin(angle) * radius * noise;
 const lng = centerLng + Math.cos(angle) * radius * noise;
 points.push({
 lat,
 lng,
 timestamp: dateDaysAgo(i),
 activity: ACTIVITY_SEQUENCE[(i + seed) % ACTIVITY_SEQUENCE.length],
 });
 }
 return points;
};

export const initialFarmers: Farmer[] = [
 {
 id: 'f-1',
 name: 'Siti binti Rahman',
 mpobLicence: '500189',
 mspoCertId: 'MS-JHR-04829',
 plotLocation: 'Kluang, Johor',
 plotArea: 1.8,
 polygonWaypoints: generatePolygon(2.035, 103.325, 0.003, 62),
 score: 94,
 daysCollected: 92,
 lastActivityDate: `${SAMPLE_DATA_AS_OF} 08:15`,
 status: FarmerStatus.CERTIFIED,
 post2020Status: 'Clean',
 whispStatus: 'Clean (Sentinel-2 + FAO Whisp)',
 pdpaConsent: true,
 transactionsCount: 11,
 actualYield: 2.2, // tons last 30 days
 annualProjection: 26.4, // tons
 expectedYieldCeiling: 28.4, // 15.79 t/ha * 1.8 ha = 28.4 tonnes
 whatsappLanguage: 'BM',
 onboardingStep: 'completed',
 anomalies: [],
 auditLogs: [
 {
 timestamp: '2026-06-25 14:22',
 action: 'System check',
 user: 'Smart-ESGP rule check',
 details: 'Passed the 90-day requirement with 88 check-ins. The deforestation check is clear and MSPO checks are complete.',
 },
 {
 timestamp: '2026-06-25 14:25',
 action: 'Certificate issued',
 user: 'Smart-ESGP authority',
 details: 'Certificate MS-JHR-04829 was created and sent to e-MSPO. The verification hash was saved.',
 }
 ],
 evidenceSummary: {
 checkIns: 88,
 activities: {
 harvest: 25,
 prune: 18,
 spray: 12,
 weed: 20,
 inspect: 13,
 },
 deliveries: 11,
 },
 },
 {
 id: 'f-2',
 name: 'Ahmad bin Yusof',
 mpobLicence: '500247',
 mspoCertId: 'MS-JHR-04910',
 plotLocation: 'Muar, Johor',
 plotArea: 2.4,
 polygonWaypoints: generatePolygon(2.025, 103.315, 0.0045, 47),
 score: 87,
 daysCollected: 47,
 lastActivityDate: `${SAMPLE_DATA_AS_OF} 07:42`,
 status: FarmerStatus.ELIGIBLE_SOON,
 post2020Status: 'Clean',
 whispStatus: 'Clean (Sentinel-2 + FAO Whisp)',
 pdpaConsent: true,
 transactionsCount: 6,
 actualYield: 3.1,
 annualProjection: 37.2,
 expectedYieldCeiling: 37.9, // 15.79 * 2.4
 whatsappLanguage: 'BM',
 onboardingStep: 'completed',
 anomalies: [],
 auditLogs: [
 {
 timestamp: '2026-06-27 09:10',
 action: 'Daily log check',
 user: 'Smart-ESGP rule check',
 details: 'Day 47 submission verified. Location is within the registered cluster. Area calculation remains stable.',
 }
 ],
 evidenceSummary: {
 checkIns: 45,
 activities: {
 harvest: 12,
 prune: 10,
 spray: 8,
 weed: 9,
 inspect: 6,
 },
 deliveries: 6,
 },
 },
 {
 id: 'f-3',
 name: 'Nor Aisyah binti Hassan',
 mpobLicence: '500678',
 mspoCertId: 'PENDING-678',
 plotLocation: 'Segamat, Johor',
 plotArea: 1.5,
 polygonWaypoints: generatePolygon(2.015, 103.310, 0.0025, 32),
 score: 81,
 daysCollected: 62,
 lastActivityDate: `${SAMPLE_DATA_AS_OF} 09:01`,
 status: FarmerStatus.IN_PROGRESS,
 post2020Status: 'Clean',
 whispStatus: 'Clean (Sentinel-2 + FAO Whisp)',
 pdpaConsent: true,
 transactionsCount: 8,
 actualYield: 1.8,
 annualProjection: 21.6,
 expectedYieldCeiling: 23.6,
 whatsappLanguage: 'EN',
 onboardingStep: 'completed',
 anomalies: [],
 auditLogs: [
 {
 timestamp: '2026-06-28 09:01',
 action: 'Daily log check',
 user: 'Smart-ESGP rule check',
 details: 'Day 62 check-in received with live location and weed clearing image.',
 }
 ],
 evidenceSummary: {
 checkIns: 58,
 activities: {
 harvest: 15,
 prune: 12,
 spray: 10,
 weed: 13,
 inspect: 8,
 },
 deliveries: 8,
 },
 },
 {
 id: 'f-4',
 name: 'Tan Wei Hong',
 mpobLicence: '500562',
 mspoCertId: 'UNASSIGNED',
 plotLocation: 'Batu Pahat, Johor',
 plotArea: 2.0,
 polygonWaypoints: generatePolygon(2.040, 103.330, 0.0035, 28),
 score: 35,
 daysCollected: 28,
 lastActivityDate: `${SAMPLE_DATA_AS_OF} 06:50`,
 status: FarmerStatus.FLAGGED,
 post2020Status: 'Clean',
 whispStatus: 'Clean (Sentinel-2 + FAO Whisp)',
 pdpaConsent: true,
 transactionsCount: 9,
 actualYield: 14.2, // Extremely high for 2 hectares in 30 days!
 annualProjection: 173.0,
 expectedYieldCeiling: 31.5, // 15.79 * 2.0 = ~31.5 tonnes expected yield limit
 whatsappLanguage: 'BM',
 onboardingStep: 'completed',
 anomalies: [
 {
 type: 'Yield vs land issue',
 description: 'Mapped plot: 2.0 ha. Expected annual yield limit: 31.5 tonnes. Reported deliveries in the last 30 days project to 173 tonnes a year, which is far above the expected limit.',
 probableCause: 'Fruit may include supply from outside the mapped plot.',
 recommendedAction: 'Follow up with the farmer, request details for any second plot, or pause the certificate review.',
 severity: 'high',
 },
 ],
 auditLogs: [
 {
 timestamp: '2026-06-27 18:04',
 action: 'Flag raised',
 user: 'Yield and land check',
 details: 'Delivery weight is higher than expected for this plot. Last 30-day deliveries are 14.2 tonnes, above the expected maximum of 2.6 tonnes.',
 }
 ],
 evidenceSummary: {
 checkIns: 24,
 activities: {
 harvest: 8,
 prune: 5,
 spray: 4,
 weed: 4,
 inspect: 3,
 },
 deliveries: 9,
 },
 },
 {
 id: 'f-5',
 name: 'Lim Chee Kong',
 mpobLicence: '500433',
 mspoCertId: 'UNASSIGNED',
 plotLocation: 'Kluang, Johor',
 plotArea: 3.1,
 polygonWaypoints: generatePolygon(2.050, 103.340, 0.005, 15),
 score: 42,
 daysCollected: 15,
 lastActivityDate: `${dateDaysAgo(3)} 17:00`,
 status: FarmerStatus.INACTIVE,
 post2020Status: 'Clean',
 whispStatus: 'Clean (Sentinel-2 + FAO Whisp)',
 pdpaConsent: true,
 transactionsCount: 2,
 actualYield: 0.8,
 annualProjection: 9.6,
 expectedYieldCeiling: 48.9, // 15.79 * 3.1
 whatsappLanguage: 'EN',
 onboardingStep: 'completed',
 anomalies: [],
 auditLogs: [
 {
 timestamp: '2026-06-25 17:00',
 action: 'Inactivity warning',
 user: 'Smart-ESGP rule check',
 details: 'No activity was recorded for 3 days. The compliance score has stopped increasing.',
 }
 ],
 evidenceSummary: {
 checkIns: 12,
 activities: {
 harvest: 3,
 prune: 3,
 spray: 2,
 weed: 2,
 inspect: 2,
 },
 deliveries: 2,
 },
 },
 {
 // Test-only account: unclaimed MPOB licence for WhatsApp onboarding smoke tests.
 id: 'f-6',
 name: 'EL LAK',
 mpobLicence: '000000',
 mspoCertId: 'UNASSIGNED',
 plotLocation: 'Kluang, Johor',
 plotArea: 1.0,
 polygonWaypoints: generatePolygon(2.03, 103.33, 0.002, 10),
 score: 0,
 daysCollected: 0,
 lastActivityDate: `${SAMPLE_DATA_AS_OF} 00:00`,
 status: FarmerStatus.IN_PROGRESS,
 post2020Status: 'Clean',
 whispStatus: 'Clean (Sentinel-2 + FAO Whisp)',
 pdpaConsent: false,
 transactionsCount: 0,
 actualYield: 0,
 annualProjection: 0,
 expectedYieldCeiling: 15.79, // 15.79 * 1.0
 anomalies: [],
 auditLogs: [],
 evidenceSummary: {
 checkIns: 0,
 activities: {
 harvest: 0,
 prune: 0,
 spray: 0,
 weed: 0,
 inspect: 0,
 },
 deliveries: 0,
 },
 },
 {
 // Test-only account: unclaimed MPOB licence for WhatsApp onboarding smoke tests.
 id: 'f-7',
 name: 'Peter',
 mpobLicence: '999999',
 mspoCertId: 'UNASSIGNED',
 plotLocation: 'Kluang, Johor',
 plotArea: 1.5,
 polygonWaypoints: generatePolygon(2.10, 103.40, 0.0025, 12),
 score: 0,
 daysCollected: 0,
 lastActivityDate: `${SAMPLE_DATA_AS_OF} 00:00`,
 status: FarmerStatus.IN_PROGRESS,
 post2020Status: 'Clean',
 whispStatus: 'Clean (Sentinel-2 + FAO Whisp)',
 pdpaConsent: false,
 transactionsCount: 0,
 actualYield: 0,
 annualProjection: 0,
 expectedYieldCeiling: 23.69, // 15.79 * 1.5
 anomalies: [],
 auditLogs: [],
 evidenceSummary: {
 checkIns: 0,
 activities: {
 harvest: 0,
 prune: 0,
 spray: 0,
 weed: 0,
 inspect: 0,
 },
 deliveries: 0,
 },
 },
];
