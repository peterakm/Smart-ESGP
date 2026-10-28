export interface WhatsAppRawPayloadRetentionPolicy {
 ok: boolean;
 retain: boolean;
 source: 'default' | 'env';
 production: boolean;
 message: string;
}

const isProductionDeployment = (env: NodeJS.ProcessEnv) => {
 return env.SMART_ESGP_DEPLOYMENT_ENV === 'production' || env.NODE_ENV === 'production';
};

export const resolveWhatsAppRawPayloadRetention = (
 env: NodeJS.ProcessEnv
): WhatsAppRawPayloadRetentionPolicy => {
 const production = isProductionDeployment(env);
 const rawValue = env.SMART_ESGP_RETAIN_WHATSAPP_RAW_PAYLOADS;

 if (!rawValue || rawValue.trim().length === 0) {
 return {
 ok: true,
 retain: !production,
 source: 'default',
 production,
 message: production
 ? 'Production defaults to not retaining raw WhatsApp provider payloads.'
 : 'Local development defaults to retaining raw WhatsApp provider payloads for debugging.',
 };
 }

 const normalized = rawValue.trim().toLowerCase();
 if (normalized !== 'true' && normalized !== 'false') {
 return {
 ok: false,
 retain: false,
 source: 'env',
 production,
 message: 'SMART_ESGP_RETAIN_WHATSAPP_RAW_PAYLOADS must be true or false.',
 };
 }

 const retain = normalized === 'true';

 return {
 ok: true,
 retain,
 source: 'env',
 production,
 message: retain
 ? 'Raw WhatsApp provider payload retention is enabled.'
 : 'Raw WhatsApp provider payload retention is disabled.',
 };
};
