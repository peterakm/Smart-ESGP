import type { CertificateRecord } from '../types';

export type CertificateLanguage = 'EN' | 'BM';

/**
 * Certificate dates, hashes and validity always come from the issued registry record.
 * When no record exists the surfaces must say so rather than printing a plausible date.
 */
export interface CertificateValidity {
 isIssued: boolean;
 certificateNumber?: string;
 issuedAtIso?: string;
 expiresAtIso?: string;
 issuedBy?: string;
 verificationHash?: string;
 status?: CertificateRecord['status'];
 daysRemaining?: number;
 isExpired: boolean;
}

const NOT_ISSUED_LABEL: Record<CertificateLanguage, string> = {
 EN: 'Not issued',
 BM: 'Belum dikeluarkan',
};

const UNAVAILABLE_LABEL: Record<CertificateLanguage, string> = {
 EN: 'Not available',
 BM: 'Tidak tersedia',
};

const DATE_LOCALE: Record<CertificateLanguage, string> = {
 EN: 'en-GB',
 BM: 'ms-MY',
};

/** Newest issued certificate for a farmer, falling back to the newest record of any status. */
export const findFarmerCertificate = (
 certificates: CertificateRecord[] | undefined,
 farmerId: string | undefined
): CertificateRecord | undefined => {
 if (!certificates || !farmerId) return undefined;

 const farmerCertificates = certificates
 .filter((certificate) => certificate.farmerId === farmerId)
 .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));

 return farmerCertificates.find((certificate) => certificate.status === 'issued') ?? farmerCertificates[0];
};

export const buildCertificateValidity = (
 certificate: CertificateRecord | undefined,
 now: Date = new Date()
): CertificateValidity => {
 if (!certificate) {
 return { isIssued: false, isExpired: false };
 }

 const expiresAt = new Date(certificate.expiresAt);
 const hasExpiry = !Number.isNaN(expiresAt.getTime());
 const millisecondsRemaining = hasExpiry ? expiresAt.getTime() - now.getTime() : undefined;

 return {
 isIssued: certificate.status === 'issued',
 certificateNumber: certificate.certificateNumber,
 issuedAtIso: certificate.issuedAt,
 expiresAtIso: certificate.expiresAt,
 issuedBy: certificate.issuedBy,
 verificationHash: certificate.verificationHash,
 status: certificate.status,
 daysRemaining:
 millisecondsRemaining === undefined
 ? undefined
 : Math.max(0, Math.ceil(millisecondsRemaining / 86_400_000)),
 isExpired: millisecondsRemaining !== undefined && millisecondsRemaining <= 0,
 };
};

export const formatCertificateDate = (
 isoDate: string | undefined,
 language: CertificateLanguage
): string => {
 if (!isoDate) return NOT_ISSUED_LABEL[language];

 const parsed = new Date(isoDate);
 if (Number.isNaN(parsed.getTime())) return isoDate;

 return new Intl.DateTimeFormat(DATE_LOCALE[language], {
 day: 'numeric',
 month: 'long',
 year: 'numeric',
 }).format(parsed);
};

export const formatCertificateTimestamp = (
 isoDate: string | undefined | null,
 language: CertificateLanguage
): string => {
 if (!isoDate) return UNAVAILABLE_LABEL[language];

 const parsed = new Date(isoDate);
 if (Number.isNaN(parsed.getTime())) return isoDate;

 return new Intl.DateTimeFormat(DATE_LOCALE[language], {
 day: 'numeric',
 month: 'short',
 year: 'numeric',
 hour: '2-digit',
 minute: '2-digit',
 }).format(parsed);
};

export const getNotIssuedLabel = (language: CertificateLanguage) => NOT_ISSUED_LABEL[language];
export const getUnavailableLabel = (language: CertificateLanguage) => UNAVAILABLE_LABEL[language];
