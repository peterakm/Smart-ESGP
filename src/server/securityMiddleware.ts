import type express from 'express';

const DEFAULT_HSTS_MAX_AGE_SECONDS = 15552000;

const splitCsv = (value: string | undefined) => {
 if (!value?.trim()) return [];
 return value
 .split(',')
 .map((item) => item.trim())
 .filter(Boolean);
};

const parsePositiveInteger = (value: string | undefined, fallback: number) => {
 if (!value?.trim()) return fallback;

 const parsed = Number.parseInt(value, 10);
 return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const firstForwardedValue = (value: string | undefined) => {
 return value?.split(',')[0]?.trim().toLowerCase();
};

const isLocalHostname = (hostname: string) => {
 const normalized = hostname.toLowerCase();
 return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1' || normalized === '[::1]';
};

const isHttpsRequest = (req: express.Request, trustProxy: boolean) => {
 if (req.secure || req.protocol === 'https') return true;
 return trustProxy && firstForwardedValue(req.header('x-forwarded-proto')) === 'https';
};

const buildHttpsRedirectUrl = (req: express.Request) => {
 const host = req.header('host');
 return host ? `https://${host}${req.originalUrl}` : undefined;
};

// Inline styles stay allowed: React style props and the certificate print
// stylesheet rely on them. The Vite dev server additionally needs inline
// scripts (React refresh preamble) and its local websocket.
export const buildContentSecurityPolicy = (options: { devServer?: boolean } = {}) => [
 "default-src 'self'",
 `script-src 'self'${options.devServer ? " 'unsafe-inline'" : ''}`,
 "style-src 'self' 'unsafe-inline'",
 "img-src 'self' data: blob:",
 "font-src 'self' data:",
 `connect-src 'self'${options.devServer ? ' ws://localhost:*' : ''}`,
 "media-src 'self' blob:",
 "object-src 'none'",
 "base-uri 'self'",
 "form-action 'self'",
 "frame-ancestors 'none'",
].join('; ');

export const resolveAllowedCorsOrigins = (env: NodeJS.ProcessEnv) => {
 return splitCsv(env.SMART_ESGP_ALLOWED_ORIGINS);
};

export const applySecurityBaseline = (
 app: express.Express,
 env: NodeJS.ProcessEnv,
 options: { devServer?: boolean } = {}
) => {
 app.disable('x-powered-by');
 const contentSecurityPolicy = buildContentSecurityPolicy(options);

 const trustProxy = env.SMART_ESGP_TRUST_PROXY === 'true';
 const forceHttps = env.SMART_ESGP_FORCE_HTTPS === 'true';
 const hstsMaxAgeSeconds = parsePositiveInteger(
 env.SMART_ESGP_HSTS_MAX_AGE_SECONDS,
 DEFAULT_HSTS_MAX_AGE_SECONDS
 );

 if (trustProxy) {
 app.set('trust proxy', 1);
 }

 const allowedOrigins = new Set(resolveAllowedCorsOrigins(env));

 app.use((req, res, next) => {
 const isHttps = isHttpsRequest(req, trustProxy);

 if (forceHttps && !isHttps && !isLocalHostname(req.hostname)) {
 const redirectUrl = buildHttpsRedirectUrl(req);

 if (redirectUrl) {
 res.redirect(308, redirectUrl);
 return;
 }
 }

 res.setHeader('x-content-type-options', 'nosniff');
 res.setHeader('referrer-policy', 'no-referrer');
 res.setHeader('x-frame-options', 'DENY');
 res.setHeader('permissions-policy', 'camera=(), microphone=()');
 res.setHeader('content-security-policy', contentSecurityPolicy);

 if (isHttps || forceHttps) {
 res.setHeader('strict-transport-security', `max-age=${hstsMaxAgeSeconds}; includeSubDomains`);
 }

 const origin = req.header('origin');
 const isAllowedOrigin = !!origin && allowedOrigins.has(origin);

 if (isAllowedOrigin) {
 res.setHeader('access-control-allow-origin', origin);
 res.setHeader('access-control-allow-credentials', 'true');
 res.setHeader('access-control-allow-methods', 'GET,POST,PUT,PATCH,OPTIONS');
 res.setHeader('access-control-allow-headers', 'authorization,content-type,x-smart-esgp-token,x-hub-signature-256');
 res.setHeader('access-control-max-age', '600');
 res.append('vary', 'Origin');
 }

 if (req.method === 'OPTIONS') {
 if (origin && allowedOrigins.size > 0 && !isAllowedOrigin) {
 res.status(403).json({ error: 'Origin is not allowed.' });
 return;
 }

 res.sendStatus(isAllowedOrigin ? 204 : 404);
 return;
 }

 next();
 });
};
