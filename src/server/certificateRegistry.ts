import { createHash } from 'crypto';
import type { CertificateRecord, Farmer } from '../types';
import { getStableCertificateId } from '../utils/certificates';

const CERTIFICATE_VALID_DAYS = 90;

const addDays = (date: Date, days: number) => {
 const nextDate = new Date(date);
 nextDate.setUTCDate(nextDate.getUTCDate() + days);
 return nextDate;
};

export const createCertificateRecord = (
 farmer: Farmer,
 issuedBy: string,
 issuedAt = new Date()
): CertificateRecord => {
 const certificateNumber = farmer.mspoCertId && farmer.mspoCertId !== 'UNASSIGNED' && !farmer.mspoCertId.startsWith('PENDING')
 ? farmer.mspoCertId
 : getStableCertificateId(farmer);
 const issuedAtIso = issuedAt.toISOString();
 const expiresAtIso = addDays(issuedAt, CERTIFICATE_VALID_DAYS).toISOString();
 const verificationHash = createHash('sha256')
 .update([
 certificateNumber,
 farmer.id,
 farmer.mpobLicence,
 farmer.score,
 farmer.daysCollected,
 issuedAtIso,
 expiresAtIso,
 ].join('|'))
 .digest('hex');

 return {
 id: `cert-${certificateNumber.toLowerCase()}`,
 farmerId: farmer.id,
 certificateNumber,
 status: 'issued',
 issuedAt: issuedAtIso,
 expiresAt: expiresAtIso,
 issuedBy,
 verificationHash,
 scoreAtIssue: farmer.score,
 evidenceDaysAtIssue: farmer.daysCollected,
 standard: 'MSPO-MS2530-2022',
 };
};

export interface CertificateVerificationResult {
 valid: boolean;
 checkedAt: string;
 certificate?: {
 certificateNumber: string;
 status: CertificateRecord['status'];
 issuedAt: string;
 expiresAt: string;
 standard: CertificateRecord['standard'];
 verificationHash: string;
 };
 farmer?: {
 name: string;
 mpobLicence: string;
 plotLocation: string;
 plotArea: number;
 post2020Status: Farmer['post2020Status'];
 whispStatus: Farmer['whispStatus'];
 };
 reason?: string;
}

const maskLicence = (licence: string) => {
 const visible = licence.slice(-3);
 return licence.length > 3 ? `${'*'.repeat(Math.min(licence.length - 3, 6))}${visible}` : licence;
};

export const buildCertificateVerificationResult = (
 certificate: CertificateRecord | undefined,
 farmer: Farmer | undefined,
 checkedAt = new Date()
): CertificateVerificationResult => {
 const checkedAtIso = checkedAt.toISOString();

 if (!certificate) {
 return {
 valid: false,
 checkedAt: checkedAtIso,
 reason: 'Certificate hash was not found.',
 };
 }

 const isIssued = certificate.status === 'issued';
 const isExpired = new Date(certificate.expiresAt).getTime() <= checkedAt.getTime();
 const valid = isIssued && !isExpired && !!farmer;

 return {
 valid,
 checkedAt: checkedAtIso,
 certificate: {
 certificateNumber: certificate.certificateNumber,
 status: isExpired && isIssued ? 'expired' : certificate.status,
 issuedAt: certificate.issuedAt,
 expiresAt: certificate.expiresAt,
 standard: certificate.standard,
 verificationHash: certificate.verificationHash,
 },
 farmer: farmer
 ? {
 name: farmer.name,
 // Public endpoint: enough to match a licence the buyer already holds,
 // without publishing every certified farmer's full licence number.
 mpobLicence: maskLicence(farmer.mpobLicence),
 plotLocation: farmer.plotLocation,
 plotArea: farmer.plotArea,
 post2020Status: farmer.post2020Status,
 whispStatus: farmer.whispStatus,
 }
 : undefined,
 reason: valid
 ? undefined
 : !farmer
 ? 'Certificate exists but linked farmer record was not found.'
 : isExpired
 ? 'Certificate has expired.'
 : `Certificate status is ${certificate.status}.`,
 };
};
