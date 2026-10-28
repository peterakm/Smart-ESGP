const DEFAULT_CLAIM_TTL_SECONDS = 300;
const MIN_CLAIM_TTL_SECONDS = 30;
const MAX_CLAIM_TTL_SECONDS = 3600;

export interface WhatsAppClaimTtlResult {
 ok: boolean;
 seconds: number;
 message?: string;
}

export const resolveWhatsAppClaimTtlSeconds = (value: string | undefined): WhatsAppClaimTtlResult => {
 if (!value?.trim()) {
 return {
 ok: true,
 seconds: DEFAULT_CLAIM_TTL_SECONDS,
 };
 }

 if (!/^\d+$/.test(value.trim())) {
 return {
 ok: false,
 seconds: DEFAULT_CLAIM_TTL_SECONDS,
 message: 'SMART_ESGP_WHATSAPP_CLAIM_TTL_SECONDS must be an integer number of seconds.',
 };
 }

 const seconds = Number(value.trim());
 if (seconds < MIN_CLAIM_TTL_SECONDS || seconds > MAX_CLAIM_TTL_SECONDS) {
 return {
 ok: false,
 seconds: DEFAULT_CLAIM_TTL_SECONDS,
 message: `SMART_ESGP_WHATSAPP_CLAIM_TTL_SECONDS must be between ${MIN_CLAIM_TTL_SECONDS} and ${MAX_CLAIM_TTL_SECONDS}.`,
 };
 }

 return {
 ok: true,
 seconds,
 };
};

export const resolveWhatsAppClaimTtlMs = (env: NodeJS.ProcessEnv = process.env) => {
 return resolveWhatsAppClaimTtlSeconds(env.SMART_ESGP_WHATSAPP_CLAIM_TTL_SECONDS).seconds * 1000;
};
