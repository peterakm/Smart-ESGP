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

export interface SmartEsgpApiUser {
 name: string;
 role: SmartEsgpRole;
 token: string;
}

export interface SmartEsgpAuthConfig {
 requireAuth: boolean;
 viewerToken?: string;
 dealerToken?: string;
 auditorToken?: string;
 users?: SmartEsgpApiUser[];
 whatsappAppSecret?: string;
 allowUnsignedWebhooks?: boolean;
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

// Hashing first gives both sides the same length, so the comparison time does
// not reveal how long the secret is.
export const timingSafeEqual = (left: string, right: string) => {
 const leftDigest = crypto.createHash('sha256').update(left).digest();
 const rightDigest = crypto.createHash('sha256').update(right).digest();

 return crypto.timingSafeEqual(leftDigest, rightDigest);
};

const API_USER_NAME = /^[a-zA-Z0-9._@-]{1,64}$/;
const isRole = (value: string): value is SmartEsgpRole => value === 'viewer' || value === 'dealer' || value === 'auditor';

// SMART_ESGP_API_USERS gives each person their own token so audit events name
// who acted: "name:role:token" entries separated by commas.
export const parseApiUsers = (value: string | undefined): SmartEsgpApiUser[] => {
 if (!value?.trim()) return [];

 return value.split(',').map((entry) => {
 const [name = '', role = '', ...tokenParts] = entry.trim().split(':');
 const token = tokenParts.join(':');

 if (!API_USER_NAME.test(name) || !isRole(role) || token.length < 16) {
 throw new Error(
 `SMART_ESGP_API_USERS entry "${name || entry.trim().slice(0, 20)}" must be name:role:token with role viewer, dealer or auditor and a token of at least 16 characters.`
 );
 }

 return { name, role, token };
 });
};

const resolveRoleForToken = (
 token: string | undefined,
 config: SmartEsgpAuthConfig
): { role?: SmartEsgpRole; actorId?: string } => {
 if (!token) return {};

 const user = config.users?.find((candidate) => timingSafeEqual(token, candidate.token));
 if (user) return { role: user.role, actorId: user.name };

 if (config.auditorToken && timingSafeEqual(token, config.auditorToken)) return { role: 'auditor' };
 if (config.dealerToken && timingSafeEqual(token, config.dealerToken)) return { role: 'dealer' };
 if (config.viewerToken && timingSafeEqual(token, config.viewerToken)) return { role: 'viewer' };
 return {};
};

const AUTH_FAILURE_WINDOW_MS = 60_000;
const authFailures = new Map<string, { count: number; resetAt: number }>();

// Only wrong tokens count: a dashboard with no token yet polls and gets 401s,
// and that must keep showing the token prompt rather than a lockout.
const authFailureLimit = () => {
 const parsed = Number.parseInt(process.env.SMART_ESGP_AUTH_FAILURE_LIMIT_PER_MINUTE || '', 10);
 return Number.isFinite(parsed) && parsed > 0 ? parsed : 20;
};

const isAuthFailureLimited = (key: string, now: number) => {
 const entry = authFailures.get(key);
 return !!entry && entry.resetAt > now && entry.count >= authFailureLimit();
};

const recordAuthFailure = (key: string, now: number) => {
 const entry = authFailures.get(key);
 const bucket = !entry || entry.resetAt <= now ? { count: 0, resetAt: now + AUTH_FAILURE_WINDOW_MS } : entry;
 bucket.count += 1;
 authFailures.set(key, bucket);

 if (authFailures.size > 10_000) {
 for (const [bucketKey, value] of authFailures.entries()) {
 if (value.resetAt <= now) authFailures.delete(bucketKey);
 }
 }
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
 const users = parseApiUsers(env.SMART_ESGP_API_USERS);
 const anyTokenConfigured = !!viewerToken || !!dealerToken || !!auditorToken || users.length > 0;
 const oidc = createOidcConfig(env);

 return {
 requireAuth: env.SMART_ESGP_REQUIRE_AUTH === 'true' || anyTokenConfigured || !!oidc,
 viewerToken,
 dealerToken,
 auditorToken,
 users,
 whatsappAppSecret: env.WHATSAPP_APP_SECRET,
 allowUnsignedWebhooks: env.SMART_ESGP_ALLOW_UNSIGNED_WHATSAPP_WEBHOOKS === 'true',
 oidc,
 };
};

const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const FORWARDING_HEADERS = ['x-forwarded-for', 'x-forwarded-host', 'x-real-ip', 'forwarded', 'cf-connecting-ip'];

// With no tokens configured the API is an open local demo. Tunnels and proxies
// (cloudflared, ngrok, load balancers) connect from loopback too but add
// forwarding headers, so those requests could come from anyone on the internet.
export const isDirectLocalRequest = (req: express.Request) => {
 return LOOPBACK_ADDRESSES.has(req.socket.remoteAddress || '')
 && !FORWARDING_HEADERS.some((header) => req.header(header));
};

export const requireRole = (config: SmartEsgpAuthConfig, minimumRole: SmartEsgpRole): express.RequestHandler => {
 return async (req: SmartEsgpRequest, res, next) => {
 if (!config.requireAuth) {
 if (!isDirectLocalRequest(req)) {
 res.status(401).json({
 error: 'Authentication required. Set SMART_ESGP_AUDITOR_TOKEN (or SMART_ESGP_REQUIRE_AUTH=true) before exposing this service.',
 });
 return;
 }

 req.smartEsgpRole = 'auditor';
 next();
 return;
 }

 const token = readBearerToken(req);
 const failureKey = req.ip || req.socket.remoteAddress || 'unknown';
 const now = Date.now();

 if (token && isAuthFailureLimited(failureKey, now)) {
 res.status(429).json({ error: 'Too many failed sign-in attempts. Please wait a minute and try again.' });
 return;
 }

 let { role: resolvedRole, actorId } = resolveRoleForToken(token, config);

 if (!resolvedRole && config.oidc) {
 try {
 const oidcResult = await resolveRoleForOidcToken(token, config);
 resolvedRole = oidcResult.role;
 actorId = oidcResult.actorId;
 } catch {
 if (token) recordAuthFailure(failureKey, now);
 res.status(401).json({ error: 'Authentication required.' });
 return;
 }
 }

 if (!resolvedRole) {
 if (token) recordAuthFailure(failureKey, now);
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
 // Without the app secret a forged webhook cannot be told apart from Meta's,
 // so only accept unsigned ones from a local simulator unless explicitly allowed.
 if (config.allowUnsignedWebhooks || isDirectLocalRequest(req)) {
 next();
 return;
 }

 res.status(401).json({ error: 'WHATSAPP_APP_SECRET must be configured to accept webhooks from outside this machine.' });
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
