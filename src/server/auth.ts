import crypto from 'node:crypto';
import type express from 'express';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { SmartEsgpRequestContext } from './requestContext';

export type SmartEsgpRole = 'viewer' | 'dealer' | 'auditor';

const roleRank: Record<SmartEsgpRole, number> = {
 viewer: 1,
 dealer: 2,
 auditor: 3,
};

export interface SmartEsgpAuthConfig {
 requireAuth: boolean;
 viewerToken?: string;
 dealerToken?: string;
 auditorToken?: string;
 whatsappAppSecret?: string;
 oidc?: SmartEsgpOidcConfig;
}

export interface SmartEsgpOidcConfig {
 issuer: string;
 audience: string;
 jwksUri: string;
 roleClaim: string;
 viewerRoles: string[];
 dealerRoles: string[];
 auditorRoles: string[];
}

export interface SmartEsgpRequest extends express.Request, SmartEsgpRequestContext {
 smartEsgpRole?: SmartEsgpRole;
 smartEsgpActorId?: string;
 rawBody?: Buffer;
}

const readBearerToken = (req: express.Request) => {
 const authHeader = req.header('authorization');
 if (authHeader?.startsWith('Bearer ')) {
 return authHeader.slice('Bearer '.length).trim();
 }

 return req.header('x-smart-esgp-token') || undefined;
};

const timingSafeEqual = (left: string, right: string) => {
 const leftBuffer = Buffer.from(left);
 const rightBuffer = Buffer.from(right);

 return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const resolveRoleForToken = (token: string | undefined, config: SmartEsgpAuthConfig): SmartEsgpRole | undefined => {
 if (!token) return undefined;
 if (config.auditorToken && timingSafeEqual(token, config.auditorToken)) return 'auditor';
 if (config.dealerToken && timingSafeEqual(token, config.dealerToken)) return 'dealer';
 if (config.viewerToken && timingSafeEqual(token, config.viewerToken)) return 'viewer';
 return undefined;
};

const hasValue = (value: string | undefined) => {
 return !!value && value.trim().length > 0;
};

const splitCsv = (value: string | undefined, fallback: string[]) => {
 if (!value?.trim()) return fallback;
 return value
 .split(',')
 .map((item) => item.trim())
 .filter(Boolean);
};

const isOidcConfigured = (env: NodeJS.ProcessEnv) => {
 return hasValue(env.SMART_ESGP_OIDC_ISSUER)
 && hasValue(env.SMART_ESGP_OIDC_AUDIENCE)
 && hasValue(env.SMART_ESGP_OIDC_JWKS_URI);
};

const createOidcConfig = (env: NodeJS.ProcessEnv): SmartEsgpOidcConfig | undefined => {
 if (!isOidcConfigured(env)) return undefined;

 return {
 issuer: env.SMART_ESGP_OIDC_ISSUER!.trim(),
 audience: env.SMART_ESGP_OIDC_AUDIENCE!.trim(),
 jwksUri: env.SMART_ESGP_OIDC_JWKS_URI!.trim(),
 roleClaim: env.SMART_ESGP_OIDC_ROLE_CLAIM || 'roles',
 viewerRoles: splitCsv(env.SMART_ESGP_OIDC_VIEWER_ROLES, ['smart-esgp.viewer', 'smart-esgp.dealer', 'smart-esgp.auditor']),
 dealerRoles: splitCsv(env.SMART_ESGP_OIDC_DEALER_ROLES, ['smart-esgp.dealer', 'smart-esgp.auditor']),
 auditorRoles: splitCsv(env.SMART_ESGP_OIDC_AUDITOR_ROLES, ['smart-esgp.auditor']),
 };
};

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

const getRemoteJwks = (jwksUri: string) => {
 const cached = jwksCache.get(jwksUri);
 if (cached) return cached;

 const jwks = createRemoteJWKSet(new URL(jwksUri));
 jwksCache.set(jwksUri, jwks);
 return jwks;
};

const claimValues = (payload: JWTPayload, claimName: string) => {
 const rawValue = payload[claimName];
 if (Array.isArray(rawValue)) {
 return rawValue.map((item) => String(item));
 }
 if (typeof rawValue === 'string') {
 return rawValue.split(/[,\s]+/).map((item) => item.trim()).filter(Boolean);
 }
 return [];
};

const roleFromClaims = (payload: JWTPayload, oidc: SmartEsgpOidcConfig): SmartEsgpRole | undefined => {
 const values = new Set(claimValues(payload, oidc.roleClaim));

 if (oidc.auditorRoles.some((role) => values.has(role))) return 'auditor';
 if (oidc.dealerRoles.some((role) => values.has(role))) return 'dealer';
 if (oidc.viewerRoles.some((role) => values.has(role))) return 'viewer';
 return undefined;
};

const resolveRoleForOidcToken = async (
 token: string | undefined,
 config: SmartEsgpAuthConfig
): Promise<{ role?: SmartEsgpRole; actorId?: string }> => {
 if (!token || !config.oidc || token === config.viewerToken || token === config.dealerToken || token === config.auditorToken) {
 return {};
 }

 const verified = await jwtVerify(token, getRemoteJwks(config.oidc.jwksUri), {
 issuer: config.oidc.issuer,
 audience: config.oidc.audience,
 });
 const role = roleFromClaims(verified.payload, config.oidc);

 return {
 role,
 actorId: typeof verified.payload.sub === 'string' ? verified.payload.sub : undefined,
 };
};

export const createAuthConfig = (env: NodeJS.ProcessEnv): SmartEsgpAuthConfig => {
 const viewerToken = env.SMART_ESGP_VIEWER_TOKEN || env.FELDA_VIEWER_TOKEN;
 const dealerToken = env.SMART_ESGP_DEALER_TOKEN || env.FELDA_DEALER_TOKEN;
 const auditorToken = env.SMART_ESGP_AUDITOR_TOKEN || env.FELDA_AUDITOR_TOKEN || env.FELDA_API_TOKEN;
 const anyTokenConfigured = !!viewerToken || !!dealerToken || !!auditorToken;
 const oidc = createOidcConfig(env);

 return {
 requireAuth: env.SMART_ESGP_REQUIRE_AUTH === 'true' || anyTokenConfigured || !!oidc,
 viewerToken,
 dealerToken,
 auditorToken,
 whatsappAppSecret: env.WHATSAPP_APP_SECRET,
 oidc,
 };
};

export const requireRole = (config: SmartEsgpAuthConfig, minimumRole: SmartEsgpRole): express.RequestHandler => {
 return async (req: SmartEsgpRequest, res, next) => {
 if (!config.requireAuth) {
 req.smartEsgpRole = 'auditor';
 next();
 return;
 }

 const token = readBearerToken(req);
 const role = resolveRoleForToken(token, config);
 let resolvedRole = role;
 let actorId: string | undefined;

 if (!resolvedRole && config.oidc) {
 try {
 const oidcResult = await resolveRoleForOidcToken(token, config);
 resolvedRole = oidcResult.role;
 actorId = oidcResult.actorId;
 } catch {
 res.status(401).json({ error: 'Authentication required.' });
 return;
 }
 }

 if (!resolvedRole) {
 res.status(401).json({ error: 'Authentication required.' });
 return;
 }

 if (roleRank[resolvedRole] < roleRank[minimumRole]) {
 res.status(403).json({ error: 'Insufficient role for this action.' });
 return;
 }

 req.smartEsgpRole = resolvedRole;
 req.smartEsgpActorId = actorId;
 next();
 };
};

export const verifyWhatsAppSignature = (config: SmartEsgpAuthConfig): express.RequestHandler => {
 return (req: SmartEsgpRequest, res, next) => {
 if (!config.whatsappAppSecret) {
 next();
 return;
 }

 const signature = req.header('x-hub-signature-256');
 if (!signature?.startsWith('sha256=') || !req.rawBody) {
 res.status(401).json({ error: 'Valid WhatsApp webhook signature required.' });
 return;
 }

 const expectedSignature = `sha256=${crypto
 .createHmac('sha256', config.whatsappAppSecret)
 .update(req.rawBody)
 .digest('hex')}`;

 if (!timingSafeEqual(signature, expectedSignature)) {
 res.status(401).json({ error: 'Invalid WhatsApp webhook signature.' });
 return;
 }

 next();
 };
};
