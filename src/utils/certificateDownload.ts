import type { CertificateRecord, Farmer } from '../types';
import { getStableCertificateId } from './certificates';
import { buildCertificateValidity, formatCertificateDate } from './certificateValidity';

export type CertificateDownloadLanguage = 'EN' | 'BM';

const escapeHtml = (value: string | number | boolean | undefined | null) =>
 String(value ?? '').replace(/[&<>"']/g, (character) => {
 switch (character) {
 case '&':
 return '&amp;';
 case '<':
 return '&lt;';
 case '>':
 return '&gt;';
 case '"':
 return '&quot;';
 case "'":
 return '&#39;';
 default:
 return character;
 }
 });

const slugify = (value: string) =>
 value
 .trim()
 .toLowerCase()
 .replace(/[^a-z0-9]+/g, '-')
 .replace(/^-+|-+$/g, '')
 .slice(0, 72);

export const getCertificateDownloadFilename = (farmer: Farmer) => {
 const certId = farmer.mspoCertId && farmer.mspoCertId !== 'UNASSIGNED'
 ? farmer.mspoCertId
 : getStableCertificateId(farmer);
 const farmerName = slugify(farmer.name) || 'farmer';

 return `${farmerName}-${certId.toLowerCase()}-smart-esgp-certificate.html`;
};

export const buildCertificateDownloadHtml = (
 farmer: Farmer,
 language: CertificateDownloadLanguage = 'EN',
 certificate?: CertificateRecord
) => {
 const isBm = language === 'BM';
 const validity = buildCertificateValidity(certificate);
 const certId = validity.certificateNumber
 ?? (farmer.mspoCertId && farmer.mspoCertId !== 'UNASSIGNED'
 ? farmer.mspoCertId
 : getStableCertificateId(farmer));
 // Dates and hashes are only printed when a registry record backs them.
 const issueDate = formatCertificateDate(validity.issuedAtIso, language);
 const expiryDate = formatCertificateDate(validity.expiresAtIso, language);
 const verificationHash = validity.verificationHash
 ?? (isBm ? 'Tidak tersedia sehingga sijil dikeluarkan' : 'Not available until the certificate is issued');
 const previewNotice = validity.isIssued
 ? ''
 : isBm
 ? 'Pratonton - bukan sijil yang dikeluarkan. Tiada rekod sijil untuk pekebun ini.'
 : 'Preview - not an issued certificate. No certificate record exists for this farmer.';
 const title = isBm ? 'Sijil perakuan pematuhan' : 'Certificate of compliance';
 const standard = isBm
 ? 'Minyak Sawit Mampan Malaysia (MSPO) - Bahagian 2: Prinsip umum bagi pekebun kecil persendirian'
 : 'Malaysian Sustainable Palm Oil (MSPO) - Part 2: General Principles for Independent Smallholders';
 const declaration = isBm
 ? 'Ini mengesahkan bahawa pekebun kecil di bawah telah disemak dan memenuhi syarat piawaian.'
 : 'This confirms that the smallholder below has been reviewed and meets the standard requirements.';
 const markSrc = typeof window === 'undefined'
 ? '/smart-esgp-mark.png'
 : `${window.location.origin}/smart-esgp-mark.png`;

 return `<!doctype html>
<html lang="${isBm ? 'ms' : 'en'}">
<head>
 <meta charset="utf-8">
 <meta name="viewport" content="width=device-width, initial-scale=1">
 <title>${escapeHtml(certId)} - ${escapeHtml(title)}</title>
 <style>
 :root {
 --ink: #14241f;
 --muted: #64746e;
 --canopy: #075f43;
 --canopy-soft: #e7f5ee;
 --line: #dbe6df;
 --gold: #b7791f;
 --slate: #f8fafc;
 }

 * {
 box-sizing: border-box;
 }

 body {
 margin: 0;
 min-width: 320px;
 background: #edf4f1;
 color: var(--ink);
 font-family: Inter, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
 font-size: 16px;
 line-height: 24px;
 font-weight: 400;
 letter-spacing: 0;
 }

 .page {
 max-width: 980px;
 margin: 32px auto;
 padding: 24px;
 }

 .toolbar {
 display: flex;
 justify-content: space-between;
 align-items: center;
 gap: 16px;
 margin-bottom: 18px;
 color: #334155;
 font-size: 13px;
 }

 .toolbar button {
 appearance: none;
 border: 0;
 border-radius: 8px;
 background: var(--canopy);
 color: white;
 cursor: pointer;
 font-weight: 600;
 padding: 10px 14px;
 }

 .certificate {
 position: relative;
 overflow: hidden;
 background: white;
 border: 18px solid var(--canopy);
 box-shadow: 0 20px 60px rgba(15, 31, 27, 0.14);
 padding: 56px;
 }

 .certificate::before {
 content: "";
 position: absolute;
 inset: 12px;
 border: 2px double rgba(183, 121, 31, 0.45);
 pointer-events: none;
 }

 .certificate::after {
 content: "Smart-ESGP";
 position: absolute;
 inset: 0;
 display: grid;
 place-items: center;
 color: rgba(7, 95, 67, 0.035);
 font-size: 92px;
 font-weight: 600;
 transform: rotate(-18deg);
 pointer-events: none;
 }

 header,
 section,
 footer {
 position: relative;
 z-index: 1;
 }

 header {
 text-align: center;
 border-bottom: 2px solid rgba(183, 121, 31, 0.35);
 padding-bottom: 22px;
 }

 .brand {
 display: inline-flex;
 align-items: center;
 gap: 14px;
 text-align: left;
 }

 .seal {
 width: 58px;
 height: 58px;
 border-radius: 12px;
 background: white;
 border: 1px solid rgba(7, 95, 67, 0.16);
 display: grid;
 place-items: center;
 padding: 6px;
 overflow: hidden;
 box-shadow: 0 6px 16px rgba(15, 31, 27, 0.08);
 }

 .seal img {
 width: 100%;
 height: 100%;
 object-fit: contain;
 display: block;
 }

 .eyebrow {
 margin: 0;
 color: var(--canopy);
 font-size: 12px;
 line-height: 18px;
 font-weight: 500;
 letter-spacing: 0;
 }

 .sub {
 margin: 4px 0 0;
 color: var(--muted);
 font-size: 12px;
 line-height: 18px;
 font-weight: 400;
 }

 h1 {
 margin: 30px 0 10px;
 color: var(--canopy);
 font-family: Poppins, Inter, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
 font-size: 28px;
 line-height: 36px;
 font-weight: 600;
 text-align: center;
 }

 .declaration {
 max-width: 720px;
 margin: 0 auto;
 color: var(--muted);
 font-size: 14px;
 line-height: 1.55;
 text-align: center;
 }

 .standard {
 max-width: 760px;
 margin: 20px auto 0;
 background: var(--slate);
 border: 1px solid var(--line);
 border-radius: 8px;
 color: #1f2937;
 font-size: 13px;
 font-weight: 600;
 line-height: 1.45;
 padding: 12px 16px;
 text-align: center;
 }

 .details {
 margin-top: 34px;
 background: rgba(231, 245, 238, 0.42);
 border: 1px solid rgba(15, 122, 85, 0.24);
 border-radius: 8px;
 padding: 22px;
 }

 .row {
 display: grid;
 grid-template-columns: 220px 1fr;
 gap: 18px;
 border-bottom: 1px solid rgba(100, 116, 139, 0.2);
 padding: 13px 0;
 }

 .row:last-child {
 border-bottom: 0;
 }

 .label {
 color: var(--muted);
 font-size: 12px;
 line-height: 18px;
 font-weight: 500;
 }

 .value {
 color: #1f2937;
 font-size: 15px;
 font-weight: 600;
 overflow-wrap: anywhere;
 }

 .summary {
 display: grid;
 grid-template-columns: repeat(4, minmax(0, 1fr));
 gap: 12px;
 margin-top: 24px;
 }

 .metric {
 border: 1px solid var(--line);
 border-radius: 8px;
 background: white;
 padding: 14px;
 }

 .metric span {
 display: block;
 color: var(--muted);
 font-size: 12px;
 line-height: 18px;
 font-weight: 500;
 }

 .metric strong {
 display: block;
 margin-top: 6px;
 color: var(--canopy);
 font-size: 28px;
 line-height: 36px;
 font-weight: 600;
 font-variant-numeric: tabular-nums;
 }

 .preview-notice {
 margin: 0 0 20px;
 padding: 12px 16px;
 border: 2px solid #a7352d;
 border-radius: 8px;
 background: #fff0ed;
 color: #a7352d;
 font-size: 13px;
 font-weight: 600;
 letter-spacing: 0;
 text-align: center;
 }
 .statement {
 margin: 26px auto 0;
 max-width: 760px;
 color: var(--muted);
 font-size: 12px;
 font-style: italic;
 line-height: 1.6;
 text-align: center;
 }

 .signatures {
 display: grid;
 grid-template-columns: 1fr 1fr;
 gap: 42px;
 margin-top: 50px;
 text-align: center;
 }

 .signature-name {
 border-bottom: 1px solid #94a3b8;
 color: var(--canopy);
 font-family: Inter, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
 font-size: 16px;
 line-height: 24px;
 font-style: normal;
 font-weight: 600;
 padding-bottom: 8px;
 }

 .signature-role {
 margin-top: 8px;
 color: #334155;
 font-size: 12px;
 line-height: 18px;
 font-weight: 500;
 }

 footer {
 display: flex;
 justify-content: space-between;
 gap: 18px;
 border-top: 1px solid var(--line);
 margin-top: 42px;
 padding-top: 18px;
 color: var(--muted);
 font-family: Inter, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
 font-size: 12px;
 line-height: 18px;
 }

 .verified {
 color: var(--canopy);
 font-weight: 600;
 text-align: right;
 }

 @media (max-width: 720px) {
 .page {
 margin: 0;
 padding: 0;
 }

 .toolbar {
 padding: 14px;
 margin: 0;
 }

 .certificate {
 border-width: 10px;
 padding: 34px 22px;
 }

 .row {
 grid-template-columns: 1fr;
 gap: 6px;
 }

 .summary,
 .signatures,
 footer {
 grid-template-columns: 1fr;
 flex-direction: column;
 }

 .summary {
 display: grid;
 grid-template-columns: repeat(2, minmax(0, 1fr));
 }

 footer,
 .verified {
 text-align: left;
 }
 }

 @media print {
 body {
 background: white;
 }

 .page {
 margin: 0;
 max-width: none;
 padding: 0;
 }

 .toolbar {
 display: none;
 }

 .certificate {
 min-height: 100vh;
 box-shadow: none;
 }
 }
 </style>
</head>
<body>
 <main class="page">
 <div class="toolbar">
 <strong>${escapeHtml(certId)} - ${escapeHtml(farmer.name)}</strong>
 <button type="button" onclick="window.print()">${isBm ? 'Cetak / Simpan PDF' : 'Print / Save PDF'}</button>
 </div>

 <article class="certificate" aria-label="${escapeHtml(title)}">
 ${previewNotice ? `<p class="preview-notice">${escapeHtml(previewNotice)}</p>` : ''}
 <header>
 <div class="brand">
 <div class="seal"><img src="${escapeHtml(markSrc)}" alt="" aria-hidden="true"></div>
 <div>
 <p class="eyebrow">${isBm ? 'Daftar sijil Smart-ESGP' : 'Smart-ESGP certificate registry'}</p>
 <p class="sub">${isBm ? 'Dokumen pematuhan disemak FELDA' : 'FELDA-reviewed compliance document'}</p>
 </div>
 </div>
 </header>

 <section>
 <h1>${escapeHtml(title)}</h1>
 <p class="declaration">${escapeHtml(declaration)}</p>
 <div class="standard">${escapeHtml(standard)}</div>

 <div class="details">
 <div class="row">
 <div class="label">${isBm ? 'Nama pekebun kecil' : 'Smallholder name'}</div>
 <div class="value">${escapeHtml(farmer.name)}</div>
 </div>
 <div class="row">
 <div class="label">${isBm ? 'Nombor lesen MPOB' : 'MPOB licence number'}</div>
 <div class="value">${escapeHtml(farmer.mpobLicence)}</div>
 </div>
 <div class="row">
 <div class="label">${isBm ? 'ID sijil' : 'Certificate ID'}</div>
 <div class="value">${escapeHtml(certId)}</div>
 </div>
 <div class="row">
 <div class="label">${isBm ? 'Geolokasi boleh kesan' : 'Traceable geolocation'}</div>
 <div class="value">${escapeHtml(farmer.plotLocation)} - ${escapeHtml(farmer.plotArea)} ha plot polygon</div>
 </div>
 <div class="row">
 <div class="label">${isBm ? 'Status penyahhutanan EUDR' : 'EUDR deforestation status'}</div>
 <div class="value">${escapeHtml(farmer.whispStatus)}</div>
 </div>
 </div>

 <div class="summary">
 <div class="metric">
 <span>${isBm ? 'Skor pematuhan' : 'Compliance score'}</span>
 <strong>${escapeHtml(farmer.score)} / 100</strong>
 </div>
 <div class="metric">
 <span>${isBm ? 'Hari bukti' : 'Evidence days'}</span>
 <strong>${escapeHtml(farmer.daysCollected)} / 90</strong>
 </div>
 <div class="metric">
 <span>${isBm ? 'Daftar Masuk' : 'Check-ins'}</span>
 <strong>${escapeHtml(farmer.evidenceSummary.checkIns)}</strong>
 </div>
 <div class="metric">
 <span>${isBm ? 'Penghantaran' : 'Deliveries'}</span>
 <strong>${escapeHtml(farmer.evidenceSummary.deliveries)}</strong>
 </div>
 </div>

 <p class="statement">
 ${isBm
 ? 'Log WhatsApp, semakan geolokasi, bukti aktiviti, rekod penghantaran dan keputusan auditor disusun sebagai jejak bukti untuk menyokong semakan sijil.'
 : 'WhatsApp logs, geolocation checks, activity evidence, delivery records, and auditor decisions are organized as an evidence trail for certificate review.'}
 </p>

 <div class="signatures">
 <div>
 <div class="signature-name">Haji Bakri bin Razak</div>
 <div class="signature-role">${isBm ? 'Ketua juruaudit' : 'Lead auditor'}</div>
 </div>
 <div>
 <div class="signature-name">Dato' Aminuddin bin Ismail</div>
 <div class="signature-role">${isBm ? 'Pegawai sijil FELDA' : 'FELDA certificate officer'}</div>
 </div>
 </div>
 </section>

 <footer>
 <div>
 <div>${isBm ? 'Tarikh dikeluarkan' : 'Date of issue'}: <strong>${escapeHtml(issueDate)}</strong></div>
 <div>${isBm ? 'Tarikh tamat tempoh' : 'Date of expiry'}: <strong>${escapeHtml(expiryDate)}</strong></div>
 <div>${isBm ? 'Cincang pengesahan' : 'Verification hash'}: <strong>${escapeHtml(verificationHash)}</strong></div>
 </div>
 <div class="verified">${isBm ? 'Boleh disahkan' : 'Verifiable'}<br>Smart-ESGP</div>
 </footer>
 </article>
 </main>
</body>
</html>`;
};

export const downloadFarmerCertificate = (
 farmer: Farmer,
 language: CertificateDownloadLanguage = 'EN',
 certificate?: CertificateRecord
) => {
 const certificateHtml = buildCertificateDownloadHtml(farmer, language, certificate);
 const blob = new Blob([certificateHtml], { type: 'text/html;charset=utf-8' });
 const url = URL.createObjectURL(blob);
 const link = document.createElement('a');

 link.href = url;
 link.download = getCertificateDownloadFilename(farmer);
 document.body.appendChild(link);
 link.click();
 link.remove();
 window.setTimeout(() => URL.revokeObjectURL(url), 0);
};
