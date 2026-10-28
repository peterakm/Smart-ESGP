export interface FileRepositoryRetentionLimits {
 evidenceRecordLimit: number;
 whatsappEventLimit: number;
 whatsappProviderMessageClaimLimit: number;
 systemAuditEventLimit: number;
}

export interface FileRepositoryRetentionPolicy {
 ok: boolean;
 limits: FileRepositoryRetentionLimits;
 errors: string[];
 message: string;
}

export const DEFAULT_FILE_REPOSITORY_RETENTION_LIMITS: FileRepositoryRetentionLimits = {
 evidenceRecordLimit: 500,
 whatsappEventLimit: 100,
 whatsappProviderMessageClaimLimit: 5000,
 systemAuditEventLimit: 1000,
};

const RETENTION_ENV = [
 {
 key: 'SMART_ESGP_FILE_EVIDENCE_RECORD_LIMIT',
 label: 'evidence records',
 property: 'evidenceRecordLimit',
 min: 1,
 max: 50000,
 },
 {
 key: 'SMART_ESGP_FILE_WHATSAPP_EVENT_LIMIT',
 label: 'WhatsApp webhook events',
 property: 'whatsappEventLimit',
 min: 1,
 max: 10000,
 },
 {
 key: 'SMART_ESGP_FILE_WHATSAPP_CLAIM_LIMIT',
 label: 'WhatsApp provider message claims',
 property: 'whatsappProviderMessageClaimLimit',
 min: 1,
 max: 100000,
 },
 {
 key: 'SMART_ESGP_FILE_AUDIT_EVENT_LIMIT',
 label: 'system audit events',
 property: 'systemAuditEventLimit',
 min: 1,
 max: 50000,
 },
] as const;

const isPositiveInteger = (value: string) => /^\d+$/.test(value);

export const resolveFileRepositoryRetention = (
 env: NodeJS.ProcessEnv
): FileRepositoryRetentionPolicy => {
 const limits: FileRepositoryRetentionLimits = {
 ...DEFAULT_FILE_REPOSITORY_RETENTION_LIMITS,
 };
 const errors: string[] = [];

 RETENTION_ENV.forEach((definition) => {
 const rawValue = env[definition.key];
 if (!rawValue || rawValue.trim().length === 0) {
 return;
 }

 const normalized = rawValue.trim();
 const numericValue = Number(normalized);

 if (
 !isPositiveInteger(normalized)
 || numericValue < definition.min
 || numericValue > definition.max
 ) {
 errors.push(`${definition.key} must be an integer between ${definition.min} and ${definition.max}.`);
 return;
 }

 limits[definition.property] = numericValue;
 });

 const message = errors.length > 0
 ? errors.join(' ')
 : `File repository retention limits: ${limits.evidenceRecordLimit} evidence records, ${limits.whatsappEventLimit} WhatsApp events, ${limits.whatsappProviderMessageClaimLimit} message claims, ${limits.systemAuditEventLimit} audit events.`;

 return {
 ok: errors.length === 0,
 limits,
 errors,
 message,
 };
};

export const normalizeFileRepositoryRetentionLimits = (
 limits: Partial<FileRepositoryRetentionLimits> = {}
): FileRepositoryRetentionLimits => {
 const resolved = {
 ...DEFAULT_FILE_REPOSITORY_RETENTION_LIMITS,
 ...limits,
 };

 return {
 evidenceRecordLimit: Math.max(1, Math.floor(resolved.evidenceRecordLimit)),
 whatsappEventLimit: Math.max(1, Math.floor(resolved.whatsappEventLimit)),
 whatsappProviderMessageClaimLimit: Math.max(1, Math.floor(resolved.whatsappProviderMessageClaimLimit)),
 systemAuditEventLimit: Math.max(1, Math.floor(resolved.systemAuditEventLimit)),
 };
};
