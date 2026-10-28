import React, { useEffect, useRef } from 'react';
import { CertificateRecord, Farmer } from '../types';
import {
 ICON, IconCertificate, IconClose, IconDownload,
 IconPrint, IconQrCode, IconVerified,
} from './icons';
import { getStableCertificateId } from '../utils/certificates';
import { downloadFarmerCertificate } from '../utils/certificateDownload';
import { buildCertificateValidity, formatCertificateDate } from '../utils/certificateValidity';
import { SmartEsgpMark } from './SmartEsgpMark';

interface MspoCertificateProps {
 farmer: Farmer;
 onClose: () => void;
 lang?: 'EN' | 'BM';
 /** Registry record backing this certificate. Without it the sheet renders as a preview. */
 certificate?: CertificateRecord;
}

export const MspoCertificate: React.FC<MspoCertificateProps> = ({ farmer, onClose, lang = 'EN', certificate }) => {
 const printAreaRef = useRef<HTMLDivElement>(null);

 useEffect(() => {
 const handleKeyDown = (event: KeyboardEvent) => {
 if (event.key === 'Escape') onClose();
 };

 document.addEventListener('keydown', handleKeyDown);
 return () => document.removeEventListener('keydown', handleKeyDown);
 }, [onClose]);

 const handlePrint = () => {
 const printContent = printAreaRef.current?.innerHTML;
 if (printContent) {
 const style = document.createElement('style');
 style.innerHTML = `
 @media print {
 body {
 background: white !important;
 color: black !important;
 padding: 0 !important;
 margin: 0 !important;
 }
 .no-print {
 display: none !important;
 }
 .print-container {
 border: none !important;
 box-shadow: none !important;
 padding: 0 !important;
 margin: 0 auto !important;
 width: 100% !important;
 max-width: 100% !important;
 }
 }
 `;
 document.head.appendChild(style);
 window.print();
 document.head.removeChild(style);
 }
 };

 const handleDownload = () => {
 downloadFarmerCertificate(farmer, lang as 'EN' | 'BM', certificate);
 };

 const isBm = lang === 'BM';
 const certificateLanguage: 'EN' | 'BM' = isBm ? 'BM' : 'EN';
 const validity = buildCertificateValidity(certificate);
 // Never print a date the registry cannot back.
 const issueDate = formatCertificateDate(validity.issuedAtIso, certificateLanguage);
 const expiryDate = formatCertificateDate(validity.expiresAtIso, certificateLanguage);
 const certId = validity.certificateNumber
 ?? (farmer.mspoCertId && farmer.mspoCertId !== 'UNASSIGNED'
 ? farmer.mspoCertId
 : getStableCertificateId(farmer));

 const t = {
 modalTitle: isBm ? 'Daftar sijil Smart-ESGP' : 'Smart-ESGP certificate registry',
 modalSubtitle: isBm ? 'Dokumen pematuhan disemak FELDA' : 'FELDA-reviewed compliance document',
 printBtn: isBm ? 'Cetak / Simpan PDF' : 'Print / Save PDF',
 downloadBtn: isBm ? 'Muat turun sijil' : 'Download certificate',
 mspoHeaderMalaysian: isBm ? 'Malaysia' : 'Malaysia',
 mspoHeaderSustainable: isBm ? 'Minyak sawit mampan' : 'Sustainable palm oil',
 mspoSub: isBm ? 'MS2530:2022 - Pematuhan pekebun kecil' : 'MS2530:2022 - Smallholder compliance',
 ledgerDoc: isBm ? 'Rekod digital Smart-ESGP' : 'Smart-ESGP digital record',
 certTitle: isBm ? 'Sijil perakuan pematuhan' : 'Certificate of compliance',
 certDecl: isBm
 ? 'Ini mengesahkan bahawa pekebun kecil di bawah telah disemak dan memenuhi syarat piawaian:'
 : 'This confirms that the smallholder below has been reviewed and meets the standard requirements for:',
 certStandard: isBm
 ? 'Minyak Sawit Mampan Malaysia (MSPO) - Bahagian 2: Prinsip umum bagi pekebun kecil persendirian'
 : 'Malaysian Sustainable Palm Oil (MSPO) - Part 2: General Principles for Independent Smallholders',
 verifiedCompliant: isBm ? 'Disahkan patuh' : 'Verified compliant',
 labelName: isBm ? 'Nama pekebun kecil:' : 'Smallholder name:',
 labelLicence: isBm ? 'Nombor lesen MPOB:' : 'MPOB licence number:',
 labelGeo: isBm ? 'Geolokasi boleh kesan:' : 'Traceable geolocation:',
 labelEudr: isBm ? 'Bebas penyahhutanan EUDR:' : 'EUDR deforestation-free:',
 eudrValue: isBm ? 'Tiada kehilangan pokok selepas 2020 mengikut semakan satelit' : 'No post-2020 tree loss shown by satellite check',
 scopeSummary: isBm
 ? 'Semakan satelit dan log harian 90 hari menunjukkan tiada penyahhutanan atau pencerobohan zon penampan.'
 : 'Satellite checks and 90 days of daily logs show no deforestation or buffer-zone encroachment.',
 sealLabel: isBm ? 'Meterai rasmi' : 'Official seal',
 leadAuditor: isBm ? 'Ketua juruaudit' : 'Lead auditor',
 auditorPanel: isBm ? 'Panel semakan FELDA' : 'FELDA review panel',
 chairman: isBm ? 'Pegawai sijil FELDA' : 'FELDA certificate officer',
 certIdLabel: isBm ? 'ID sijil: ' : 'Certificate ID: ',
 issueLabel: isBm ? 'Tarikh dikeluarkan: ' : 'Date of issue: ',
 expiryLabel: isBm ? 'Tarikh tamat tempoh: ' : 'Date of expiry: ',
 verifiable: isBm ? 'Boleh disahkan' : 'Verifiable',
 scanLabel: isBm ? 'Imbas untuk semak hash sijil' : 'Scan to check certificate hash',
 previewNotice: isBm
 ? 'Pratonton - bukan sijil yang dikeluarkan. Tiada rekod sijil untuk pekebun ini.'
 : 'Preview - not an issued certificate. No certificate record exists in the registry for this farmer.',
 };

 return (
 <div
 className="fixed inset-0 bg-slate-900/85 backdrop-blur-sm z-[100] flex items-center justify-center p-4 overflow-y-auto no-print"
 id="mspo-cert-modal"
 onMouseDown={(event) => {
 if (event.target === event.currentTarget) onClose();
 }}
 >
 <div
 role="dialog"
 aria-modal="true"
 aria-label={t.modalTitle}
 className="w-full max-w-3xl flex flex-col gap-4 animate-scale-in my-8"
 >

 {/* Modal Controls */}
 <div className="flex justify-between items-center bg-slate-800 text-white px-5 py-3.5 rounded-t-2xl shadow-lg border-b border-slate-700">
 <div className="flex items-center gap-2.5">
 <IconCertificate className="h-5 w-5 text-emerald-400" aria-hidden="true" />
 <div>
 <h3 className="type-label text-emerald-400">{t.modalTitle}</h3>
 <h2 className="type-card-heading text-slate-200">{t.modalSubtitle}</h2>
 </div>
 </div>
 <div className="flex flex-wrap justify-end items-center gap-2">
 <button
 onClick={handleDownload}
 className="flex min-h-11 items-center gap-1.5 bg-white text-slate-900 hover:bg-emerald-50 px-4 rounded-lg text-xs font-medium transition-all cursor-pointer shadow-sm"
 id="btn-download-certificate"
 >
 <IconDownload className={`${ICON.NAV} text-emerald-700`} aria-hidden="true" />
 <span>{t.downloadBtn}</span>
 </button>
 <button
 onClick={handlePrint}
 className="flex min-h-11 items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white px-4 rounded-lg text-xs font-medium transition-all cursor-pointer shadow-sm"
 id="btn-print-certificate"
 >
 <IconPrint className={ICON.NAV} aria-hidden="true" />
 <span>{t.printBtn}</span>
 </button>
 <button
 onClick={onClose}
 className="flex h-11 w-11 items-center justify-center hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-all cursor-pointer"
 aria-label="Close modal"
 id="btn-close-certificate-modal"
 >
 <IconClose className="w-5 h-5" aria-hidden="true" />
 </button>
 </div>
 </div>

 {/* Certificate Sheet Wrapper */}
 <div className="bg-slate-900 p-1 md:p-4 rounded-b-2xl shadow-2xl overflow-x-auto">

 {/* Printable Area */}
 <div
 ref={printAreaRef}
 className="print-container bg-white text-slate-900 w-full min-w-[640px] max-w-2xl mx-auto p-10 md:p-14 border-[16px] border-emerald-800 relative rounded shadow-lg font-sans select-none"
 id="mspo-printable-certificate"
 style={{ backgroundImage: 'radial-gradient(circle, rgba(16, 185, 129, 0.02) 1px, transparent 1px)', backgroundSize: '16px 16px' }}
 >
 {/* Elegant Intricate Gold Inner Border */}
 <div className="absolute inset-2 border-2 border-double border-amber-600/40 pointer-events-none rounded-[2px]" />
 <div className="absolute inset-4 border border-emerald-800/10 pointer-events-none rounded-[2px]" />

 {!validity.isIssued && (
 <p className="relative mb-6 rounded-lg border-2 border-rose-400 bg-rose-50 px-4 py-3 text-center text-xs font-semibold text-rose-700 font-sans">
 {t.previewNotice}
 </p>
 )}

 {/* Certificate Header */}
 <div className="text-center flex flex-col items-center gap-2 relative">
 <div className="flex items-center gap-3">
 <div className="w-14 h-14 bg-white rounded-xl flex items-center justify-center border border-emerald-100 p-1.5 shadow-sm">
 <SmartEsgpMark className="h-full w-full object-contain" />
 </div>
 <div className="text-left font-sans">
 <h4 className="text-xs font-semibold text-emerald-800 leading-none">{t.mspoHeaderMalaysian}</h4>
 <h4 className="text-xs font-semibold text-emerald-900 mt-0.5 leading-none">{t.mspoHeaderSustainable}</h4>
 <p className="text-xs text-slate-400 font-medium mt-1">{t.mspoSub}</p>
 </div>
 </div>

 <div className="w-full h-[2px] bg-gradient-to-r from-transparent via-amber-600/50 to-transparent mt-4 mb-2" />

 <span className="type-label text-amber-700 bg-amber-50 border border-amber-200/50 px-2.5 py-0.5 rounded-full mt-1.5">
 {t.ledgerDoc}
 </span>
 </div>

 {/* Title / Declaration */}
 <div className="text-center mt-6">
 <h1 className="type-section-title text-emerald-900">
 {t.certTitle}
 </h1>
 <p className="text-xs text-slate-500 italic mt-2 font-sans">
 {t.certDecl}
 </p>
 <h3 className="text-xs sm:text-xs font-medium text-slate-800 font-sans mt-3.5 bg-slate-50 px-4 py-2.5 border border-slate-200 inline-block rounded-md max-w-lg leading-relaxed">
 {t.certStandard}
 </h3>
 </div>

 {/* Smallholder Details Block */}
 <div className="mt-8 grid grid-cols-1 gap-4 bg-emerald-50/20 border border-emerald-200/40 rounded-xl p-5 relative font-sans text-xs">
 <div className="absolute top-2 right-3 type-label text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
 {t.verifiedCompliant}
 </div>

 <div className="grid grid-cols-3 border-b border-slate-200/60 pb-3">
 <span className="text-slate-400 text-xs font-medium">{t.labelName}</span>
 <span className="col-span-2 text-slate-800 font-semibold text-sm">{farmer.name}</span>
 </div>

 <div className="grid grid-cols-3 border-b border-slate-200/60 pb-3">
 <span className="text-slate-400 text-xs font-medium">{t.labelLicence}</span>
 <span className="col-span-2 font-medium text-slate-800">{farmer.mpobLicence}</span>
 </div>

 <div className="grid grid-cols-3 border-b border-slate-200/60 pb-3">
 <span className="text-slate-400 text-xs font-medium">{t.labelGeo}</span>
 <span className="col-span-2 text-slate-700 font-semibold">
 {farmer.plotLocation} - ({farmer.plotArea} {isBm ? 'hektar poligon plot' : 'ha plot polygon'})
 </span>
 </div>

 <div className="grid grid-cols-3">
 <span className="text-slate-400 text-xs font-medium">{t.labelEudr}</span>
 <span className="col-span-2 text-emerald-700 font-semibold flex items-center gap-1">
 <IconVerified className="w-4 h-4 text-emerald-600" aria-hidden="true" />
 <span>{t.eudrValue}</span>
 </span>
 </div>
 </div>

 {/* Certification Scope Summary */}
 <div className="mt-6 text-center">
 <p className="text-xs text-slate-500 leading-relaxed max-w-lg mx-auto italic font-sans">
 {t.scopeSummary}
 </p>
 </div>

 {/* Signatures & Stamps Section */}
 <div className="mt-10 grid grid-cols-3 gap-6 items-end font-sans">

 {/* Seal Column */}
 <div className="flex flex-col items-center justify-center text-center">
 <div className="w-16 h-16 rounded-full border-4 border-emerald-800/80 p-1 flex items-center justify-center relative bg-emerald-50/30">
 <div className="w-full h-full rounded-full border-2 border-dashed border-emerald-700 flex items-center justify-center text-center">
 <IconCertificate className="h-6 w-6 text-emerald-800" aria-hidden="true" />
 </div>
 <div className="absolute inset-0 rounded-full border border-amber-600/30 animate-spin-slow pointer-events-none" />
 </div>
 <span className="text-xs font-medium text-emerald-800 mt-2">{t.sealLabel}</span>
 </div>

 {/* Auditor Signature Column */}
 <div className="text-center flex flex-col items-center">
 <span className="font-sans text-sm text-emerald-800 font-semibold h-8 select-none relative">
 Haji Bakri bin Razak
 <div className="absolute -bottom-1 left-2 right-2 h-[1px] bg-emerald-600/30 transform -rotate-1" />
 </span>
 <div className="w-full h-[1px] bg-slate-300 my-1.5" />
 <span className="text-xs font-medium text-slate-800 block">{t.leadAuditor}</span>
 <span className="text-xs text-slate-400">{t.auditorPanel}</span>
 </div>

 {/* FELDA certification officer signature column */}
 <div className="text-center flex flex-col items-center">
 <span className="font-sans text-sm text-indigo-800 font-semibold h-8 select-none relative">
 Dato' Aminuddin bin Ismail
 <div className="absolute -bottom-1 left-4 right-4 h-[1px] bg-indigo-600/30 transform rotate-1" />
 </span>
 <div className="w-full h-[1px] bg-slate-300 my-1.5" />
 <span className="text-xs font-medium text-slate-800 block">{t.chairman}</span>
 <span className="text-xs text-slate-400">Koperasi Sawit Johor 29</span>
 </div>

 </div>

 {/* Certificate Footer Metadata */}
 <div className="mt-10 border-t border-slate-200 pt-4 flex justify-between items-center font-sans">
 <div className="flex flex-col gap-1 text-xs text-slate-400">
 <div>
 <span className="font-medium text-slate-500">{t.certIdLabel}</span>
 <span className="text-emerald-700 font-medium">{certId}</span>
 </div>
 <div>
 <span className="font-medium text-slate-500">{t.issueLabel}</span>
 <span className="text-slate-600 font-medium">{issueDate}</span>
 </div>
 <div>
 <span className="font-medium text-slate-500">{t.expiryLabel}</span>
 <span className="text-slate-600 font-medium">{expiryDate}</span>
 </div>
 </div>

 {/* QR Code and Verification Indicator */}
 <div className="flex items-center gap-2 border border-slate-200/80 p-1.5 rounded bg-slate-50 font-sans shadow-sm">
 <div className="text-right">
 <span className="text-xs text-emerald-800 font-semibold block">{t.verifiable}</span>
 <span className="text-xs text-slate-400 block mt-0.5 leading-none">{t.scanLabel}</span>
 </div>
 <div className="w-8 h-8 bg-white border border-slate-200 rounded flex items-center justify-center p-0.5">
 <IconQrCode className="w-full h-full text-slate-800" aria-hidden="true" />
 </div>
 </div>
 </div>

 </div>

 </div>

 </div>
 </div>
 );
};
