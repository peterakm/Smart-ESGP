import { Farmer, FarmerStatus } from '../types';

export type SmartEsgpLanguage = 'EN' | 'BM';
export type SmartEsgpEsgCategoryId = 'E' | 'S' | 'G';
export type SmartEsgpEsgSurface = 'dashboard' | 'verification';

export interface SmartEsgpEsgPractice {
 name: string;
 anchor: string;
 met: boolean;
 details: string;
}

export interface SmartEsgpEsgCategory {
 id: SmartEsgpEsgCategoryId;
 title: string;
 subtitle: string;
 maxPoints: number;
 pointsPerPractice: number;
 items: SmartEsgpEsgPractice[];
}

interface EsgPracticeCopy {
 name: string;
 details: string;
}

interface EsgCategoryCopy {
 dashboardTitle: string;
 verificationTitle: string;
 subtitle: string;
 items: readonly EsgPracticeCopy[];
}

const ESG_COPY = {
 EN: {
 E: {
 dashboardTitle: 'Farm environment checks (E)',
 verificationTitle: 'Farm environment checks',
 subtitle: 'Checks that show the plot is mapped, forest-safe, river-safe, and chemical-safe.',
 items: [
 {
 name: 'Map the farm',
 details: 'Send GPS location or walk the farm boundary so Smart-ESGP can verify the registered plot.',
 },
 {
 name: 'Do not clear forest',
 details: 'Do not clear forest land. GPS and satellite checks help confirm the plot remains deforestation-free.',
 },
 {
 name: 'Do not burn',
 details: 'Do not burn leaves, fronds, or cleared land. Use manual or mechanical clearing instead.',
 },
 {
 name: 'Use chemicals safely',
 details: 'Keep chemicals away from rivers. Share evidence of safe storage, spraying, and empty container disposal.',
 },
 ],
 },
 S: {
 dashboardTitle: 'People and worker checks (S)',
 verificationTitle: 'People and worker checks',
 subtitle: 'Checks for safe work, fair labour, basic welfare, and good community conduct.',
 items: [
 {
 name: 'Wear safety gear',
 details: 'Use gloves, boots, masks, and other protective equipment during spraying, harvesting, and field work.',
 },
 {
 name: 'No child or forced labour',
 details: 'Declare that only legal and voluntary labour is used, with no under-age or forced work.',
 },
 {
 name: 'Provide water and rest',
 details: 'Workers and helpers have drinking water, safe rest, and basic welfare during farm activity.',
 },
 {
 name: 'Respect community boundaries',
 details: 'Farm activity does not block access, overlap disputed land, or leave local complaints unresolved.',
 },
 ],
 },
 G: {
 dashboardTitle: 'Records and traceability checks (G)',
 verificationTitle: 'Records and traceability checks',
 subtitle: 'Records that connect land rights, MPOB identity, farm activity, and fruit movement.',
 items: [
 {
 name: 'Keep land and MPOB proof',
 details: 'Submit land title, lease, FELDA lot record, or recognised tenure proof linked to MPOB identity.',
 },
 {
 name: 'Record fresh fruit sales',
 details: 'Record buyer, date, weight, delivery note, and destination for traceable fresh fruit bunch movement.',
 },
 {
 name: 'Log today\'s farm activity',
 details: 'Log harvest, pruning, spraying, fertiliser, weeding, and inspections through WhatsApp evidence.',
 },
 {
 name: 'Respond to audit requests',
 details: 'Consent, review history, and audit trail allow FELDA to approve, reject, or request corrections.',
 },
 ],
 },
 },
 BM: {
 E: {
 dashboardTitle: 'Semakan alam sekitar kebun (E)',
 verificationTitle: 'Semakan alam sekitar kebun',
 subtitle: 'Semakan yang menunjukkan plot dipetakan, hutan dilindungi, sungai selamat, dan bahan kimia dikawal.',
 items: [
 {
 name: 'Petakan kebun',
 details: 'Hantar lokasi GPS atau jalan di sempadan kebun supaya Smart-ESGP boleh sahkan lot berdaftar.',
 },
 {
 name: 'Jangan buka hutan',
 details: 'Jangan buka kawasan hutan. Semakan GPS dan satelit membantu mengesahkan lot bebas penyahhutanan.',
 },
 {
 name: 'Jangan membakar',
 details: 'Jangan bakar daun, pelepah, atau tanah. Guna pembersihan manual atau mekanikal.',
 },
 {
 name: 'Guna bahan kimia dengan selamat',
 details: 'Jauhkan bahan kimia dari sungai. Kongsi bukti storan, semburan, dan pelupusan bekas kosong yang selamat.',
 },
 ],
 },
 S: {
 dashboardTitle: 'Semakan pekerja dan komuniti (S)',
 verificationTitle: 'Semakan pekerja dan komuniti',
 subtitle: 'Semakan untuk kerja selamat, buruh adil, kebajikan asas, dan hubungan komuniti yang baik.',
 items: [
 {
 name: 'Pakai peralatan keselamatan',
 details: 'Guna sarung tangan, but, pelitup muka, dan alat perlindungan lain semasa semburan, menuai, dan kerja kebun.',
 },
 {
 name: 'Tiada buruh kanak-kanak atau paksa',
 details: 'Isytiharkan bahawa hanya buruh sah dan sukarela digunakan, tanpa kerja bawah umur atau paksaan.',
 },
 {
 name: 'Sediakan air dan rehat',
 details: 'Pekerja dan pembantu mempunyai air minum, rehat selamat, dan kebajikan asas semasa aktiviti kebun.',
 },
 {
 name: 'Hormati sempadan komuniti',
 details: 'Aktiviti kebun tidak menghalang laluan, bertindih tanah dipertikaikan, atau meninggalkan aduan tempatan belum selesai.',
 },
 ],
 },
 G: {
 dashboardTitle: 'Semakan rekod dan kebolehkesanan (G)',
 verificationTitle: 'Semakan rekod dan kebolehkesanan',
 subtitle: 'Rekod jelas yang menghubungkan hak tanah, identiti MPOB, aktiviti kebun, dan pergerakan buah.',
 items: [
 {
 name: 'Simpan bukti tanah dan MPOB',
 details: 'Hantar geran, pajakan, rekod lot FELDA, atau bukti hak guna tanah yang dipadankan dengan identiti MPOB.',
 },
 {
 name: 'Rekod jualan BTS',
 details: 'Rekod pembeli, tarikh, berat, nota penghantaran, dan destinasi supaya pergerakan BTS boleh dijejak.',
 },
 {
 name: 'Catat aktiviti kebun hari ini',
 details: 'Log aktiviti menuai, memangkas, menyembur, membaja, merumput, dan pemeriksaan melalui bukti WhatsApp.',
 },
 {
 name: 'Jawab permintaan audit',
 details: 'Persetujuan, sejarah semakan, dan jejak audit membolehkan FELDA meluluskan, menolak, atau meminta pembetulan.',
 },
 ],
 },
 },
} satisfies Record<SmartEsgpLanguage, Record<SmartEsgpEsgCategoryId, EsgCategoryCopy>>;

const ESG_ANCHORS: Record<SmartEsgpEsgCategoryId, readonly string[]> = {
 E: [
 'EUDR Art. 3 / MSPO P1, C2',
 'EUDR Art. 3 / MSPO P5, C5 & C6',
 'MSPO P5, C7',
 'MSPO P5, C1 & C3',
 ],
 S: [
 'MSPO P4',
 'MSPO P4 / Legal compliance',
 'MSPO P4',
 'MSPO P3 / MSPO P1',
 ],
 G: [
 'MSPO P3 / EUDR Art. 3',
 'MSPO P2 / EUDR Art. 9',
 'MSPO P1 / EUDR buyer checks',
 'MSPO P1 / EUDR risk check',
 ],
};

const ESG_CATEGORY_MAX_POINTS: Record<SmartEsgpEsgCategoryId, number> = {
 E: 40,
 S: 30,
 G: 30,
};

const getPracticeStatuses = (farmer: Farmer): Record<SmartEsgpEsgCategoryId, readonly boolean[]> => {
 const isFlagged = farmer.status === FarmerStatus.FLAGGED;

 return {
 E: [
 farmer.polygonWaypoints.length >= 10,
 farmer.score >= 60,
 farmer.score >= 50,
 farmer.score >= 65 && !isFlagged,
 ],
 S: [
 farmer.score >= 70,
 farmer.score >= 50 && farmer.pdpaConsent,
 farmer.score >= 60,
 farmer.score >= 55 && !isFlagged,
 ],
 G: [
 Boolean(farmer.mpobLicence),
 farmer.daysCollected >= 45 && !isFlagged,
 farmer.score >= 75,
 farmer.pdpaConsent && !isFlagged,
 ],
 };
};

export const buildSmartEsgpEsgCategories = (
 farmer: Farmer,
 language: SmartEsgpLanguage,
 surface: SmartEsgpEsgSurface
): SmartEsgpEsgCategory[] => {
 const statuses = getPracticeStatuses(farmer);
 const categoryIds: SmartEsgpEsgCategoryId[] = ['E', 'S', 'G'];

 return categoryIds.map((id) => {
 const categoryCopy = ESG_COPY[language][id];

 return {
 id,
 title: surface === 'dashboard' ? categoryCopy.dashboardTitle : categoryCopy.verificationTitle,
 subtitle: categoryCopy.subtitle,
 maxPoints: ESG_CATEGORY_MAX_POINTS[id],
 pointsPerPractice: ESG_CATEGORY_MAX_POINTS[id] / categoryCopy.items.length,
 items: categoryCopy.items.map((item, index) => ({
 ...item,
 anchor: ESG_ANCHORS[id][index],
 met: statuses[id][index],
 })),
 };
 });
};

export const calculateSmartEsgpEsgCategoryScore = (category: SmartEsgpEsgCategory): number => {
 return category.items.filter((item) => item.met).length * category.pointsPerPractice;
};

export const formatSmartEsgpEsgPoints = (points: number): string => {
 return Number.isInteger(points) ? points.toString() : points.toFixed(1);
};
