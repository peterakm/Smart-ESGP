import type { SmartEsgpRepository } from './smartEsgpRepository';
import { resolveFileRepositoryRetention } from './fileRepositoryRetention';
import {
 createWhatsAppCloudApiConfig,
 resolveWhatsAppRequestTimeoutMs,
 summarizeWhatsAppCloudApiConfig,
} from '../services/whatsappCloudApi';
import { resolveWhatsAppClaimTtlSeconds } from './whatsappClaimLease';
import { resolveWhatsAppRawPayloadRetention } from './whatsappRawPayloadRetention';

export type SmartEsgpServiceName = 'dashboard' | 'whatsapp';
export type RuntimeCheckStatus = 'ok' | 'warning' | 'error';

export interface RuntimeCheck {
 id: string;
 status: RuntimeCheckStatus;
 message: string;
}

export interface RuntimeReadiness {
 ok: boolean;
 service: SmartEsgpServiceName;
 environment: 'development' | 'production';
 generatedAt: string;
 checks: RuntimeCheck[];
}

const hasValue = (value: string | undefined) => {
 return !!value && value.trim().length > 0;
};

const hasPositiveIntegerValue = (value: string | undefined) => {
 if (!hasValue(value)) return false;

 const parsed = Number.parseInt(value!, 10);
 return Number.isFinite(parsed) && parsed > 0 && String(parsed) === value!.trim();
};

const PLACEHOLDER_SECRET_PATTERNS = [
 /change[-_ ]?me/i,
 /replace[-_ ]?with/i,
 /placeholder/i,
 /^changeme$/i,
];

const isPlaceholderSecret = (value: string | undefined) => {
 return hasValue(value) && PLACEHOLDER_SECRET_PATTERNS.some((pattern) => pattern.test(value!.trim()));
};

const hasProductionSecret = (value: string | undefined) => {
 return hasValue(value) && !isPlaceholderSecret(value);
};

const authTokenValues = (env: NodeJS.ProcessEnv) => [
 env.SMART_ESGP_VIEWER_TOKEN,
 env.SMART_ESGP_DEALER_TOKEN,
 env.SMART_ESGP_AUDITOR_TOKEN,
 env.FELDA_VIEWER_TOKEN,
 env.FELDA_DEALER_TOKEN,
 env.FELDA_AUDITOR_TOKEN,
 env.FELDA_API_TOKEN,
];

const auditorTokenValues = (env: NodeJS.ProcessEnv) => [
 env.SMART_ESGP_AUDITOR_TOKEN,
 env.FELDA_AUDITOR_TOKEN,
 env.FELDA_API_TOKEN,
];

const hasAnyAuthToken = (env: NodeJS.ProcessEnv, production: boolean) => {
 const validator = production ? hasProductionSecret : hasValue;
 return [
 ...authTokenValues(env),
 ].some(validator);
};

const hasAuditorToken = (env: NodeJS.ProcessEnv, production: boolean) => {
 const validator = production ? hasProductionSecret : hasValue;
 return auditorTokenValues(env).some(validator);
};

const hasOidcConfig = (env: NodeJS.ProcessEnv) => {
 return hasValue(env.SMART_ESGP_OIDC_ISSUER)
 && hasValue(env.SMART_ESGP_OIDC_AUDIENCE)
 && hasValue(env.SMART_ESGP_OIDC_JWKS_URI);
};

export const isProductionDeployment = (env: NodeJS.ProcessEnv) => {
 return env.SMART_ESGP_DEPLOYMENT_ENV === 'production' || env.NODE_ENV === 'production';
};

const resolveRepositoryModeForReadiness = (env: NodeJS.ProcessEnv) => {
 return (env.SMART_ESGP_REPOSITORY || 'file').trim().toLowerCase();
};

const ok = (id: string, message: string): RuntimeCheck => ({ id, status: 'ok', message });
const warning = (id: string, message: string): RuntimeCheck => ({ id, status: 'warning', message });
const error = (id: string, message: string): RuntimeCheck => ({ id, status: 'error', message });

const repositoryConnectivityCheck = async (repository?: Pick<SmartEsgpRepository, 'checkHealth'>): Promise<RuntimeCheck> => {
 if (!repository) {
 return warning('repository-connectivity', 'Repository connectivity was not checked.');
 }

 try {
 const health = await repository.checkHealth();
 return health.ok
 ? ok('repository-connectivity', health.message)
 : error('repository-connectivity', health.message);
 } catch (healthError) {
 return error(
 'repository-connectivity',
 healthError instanceof Error ? healthError.message : 'Repository connectivity check failed.'
 );
 }
};

const commonChecks = (env: NodeJS.ProcessEnv, production: boolean): RuntimeCheck[] => {
 const checks: RuntimeCheck[] = [];
 const repositoryMode = resolveRepositoryModeForReadiness(env);
 const fileRepositoryRetention = resolveFileRepositoryRetention(env);
 const mediaStorage = (env.SMART_ESGP_MEDIA_STORAGE || 'local-filesystem').trim().toLowerCase();
 const allowedOrigins = (env.SMART_ESGP_ALLOWED_ORIGINS || '')
 .split(',')
 .map((origin) => origin.trim())
 .filter(Boolean);

 if (repositoryMode !== 'file' && repositoryMode !== 'postgres') {
 checks.push(error('repository-mode', 'SMART_ESGP_REPOSITORY must be either file or postgres.'));
 } else if (repositoryMode === 'postgres') {
 if (!hasValue(env.DATABASE_URL)) {
 checks.push(error('repository-mode', 'SMART_ESGP_REPOSITORY=postgres requires DATABASE_URL.'));
 } else if (production && isPlaceholderSecret(env.DATABASE_URL)) {
 checks.push(error('repository-mode', 'Production DATABASE_URL must not contain placeholder credentials.'));
 } else {
 checks.push(ok('repository-mode', 'SMART_ESGP_REPOSITORY=postgres is configured.'));
 }
 } else if (production) {
 checks.push(warning('repository-mode', 'SMART_ESGP_REPOSITORY=file is acceptable for demos but production should use postgres.'));
 } else {
 checks.push(ok('repository-mode', 'SMART_ESGP_REPOSITORY=file is active for local development.'));
 }

 if (repositoryMode === 'postgres') {
 checks.push(ok('data-store', 'Local SMART_ESGP_DATA_FILE is not required in postgres mode.'));
 } else if (production && !hasValue(env.SMART_ESGP_DATA_FILE)) {
 checks.push(error('data-store', 'SMART_ESGP_DATA_FILE must be explicit in production.'));
 } else if (hasValue(env.SMART_ESGP_DATA_FILE)) {
 checks.push(ok('data-store', 'SMART_ESGP_DATA_FILE is configured.'));
 } else {
 checks.push(warning('data-store', 'Using the default local development data store.'));
 }

 if (!fileRepositoryRetention.ok) {
 checks.push(error('file-repository-retention', fileRepositoryRetention.message));
 } else if (repositoryMode === 'postgres') {
 checks.push(ok('file-repository-retention', 'PostgreSQL mode is active; long-term retention should be managed by database policy.'));
 } else {
 checks.push(ok('file-repository-retention', fileRepositoryRetention.message));
 }

 if (allowedOrigins.includes('*')) {
 checks.push(error('cors-origin-policy', 'SMART_ESGP_ALLOWED_ORIGINS must list exact origins; wildcard CORS is not allowed.'));
 } else if (allowedOrigins.length > 0) {
 checks.push(ok('cors-origin-policy', 'CORS is restricted to configured exact origins.'));
 } else if (production) {
 checks.push(ok('cors-origin-policy', 'No CORS origins configured; browser access is same-origin/private-network only.'));
 } else {
 checks.push(warning('cors-origin-policy', 'No CORS origins configured for local development.'));
 }

 if (production && env.SMART_ESGP_FORCE_HTTPS !== 'true') {
 checks.push(warning('https-enforcement', 'Set SMART_ESGP_FORCE_HTTPS=true in production unless HTTPS is guaranteed by the hosting edge.'));
 } else if (env.SMART_ESGP_FORCE_HTTPS === 'true') {
 checks.push(ok('https-enforcement', 'HTTP requests are redirected to HTTPS outside localhost.'));
 } else {
 checks.push(ok('https-enforcement', 'HTTPS enforcement is optional for local development.'));
 }

 if (hasValue(env.SMART_ESGP_HSTS_MAX_AGE_SECONDS) && !hasPositiveIntegerValue(env.SMART_ESGP_HSTS_MAX_AGE_SECONDS)) {
 checks.push(error('hsts-policy', 'SMART_ESGP_HSTS_MAX_AGE_SECONDS must be a positive integer when configured.'));
 } else if (production && env.SMART_ESGP_FORCE_HTTPS === 'true') {
 checks.push(ok('hsts-policy', 'Strict-Transport-Security is enabled for HTTPS responses.'));
 } else if (production) {
 checks.push(warning('hsts-policy', 'HSTS is not guaranteed until SMART_ESGP_FORCE_HTTPS=true is enabled.'));
 } else {
 checks.push(ok('hsts-policy', 'HSTS readiness is not required for local development.'));
 }

 if (!['local', 'local-filesystem', 's3', 'object-storage'].includes(mediaStorage)) {
 checks.push(error('media-store', 'SMART_ESGP_MEDIA_STORAGE must be local-filesystem or s3.'));
 } else if (mediaStorage === 's3' || mediaStorage === 'object-storage') {
 if (!hasValue(env.SMART_ESGP_S3_BUCKET)) {
 checks.push(error('media-store', 'SMART_ESGP_MEDIA_STORAGE=s3 requires SMART_ESGP_S3_BUCKET.'));
 } else if (production && isPlaceholderSecret(env.SMART_ESGP_S3_BUCKET)) {
 checks.push(error('media-store', 'Production SMART_ESGP_S3_BUCKET must not be a placeholder value.'));
 } else if (
 production
 && hasValue(env.SMART_ESGP_S3_ENDPOINT)
 && (!hasProductionSecret(env.AWS_ACCESS_KEY_ID) || !hasProductionSecret(env.AWS_SECRET_ACCESS_KEY))
 ) {
 checks.push(error('media-store', 'S3-compatible production endpoints require non-placeholder AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.'));
 } else {
 checks.push(ok('media-store', 'S3-compatible private media storage is configured.'));
 }
 } else if (production && !hasValue(env.SMART_ESGP_MEDIA_DIR)) {
 checks.push(error('media-store', 'SMART_ESGP_MEDIA_DIR must be explicit when production media storage is local-filesystem.'));
 } else if (hasValue(env.SMART_ESGP_MEDIA_DIR)) {
 checks.push(ok('media-store', 'Local media directory is configured.'));
 } else {
 checks.push(warning('media-store', 'Using the default local media directory.'));
 }

 return checks;
};

const dashboardChecks = (env: NodeJS.ProcessEnv, production: boolean): RuntimeCheck[] => {
 const checks: RuntimeCheck[] = [];
 const oidcConfigured = hasOidcConfig(env);
 const authEnabled = env.SMART_ESGP_REQUIRE_AUTH === 'true' || hasAnyAuthToken(env, production) || oidcConfigured;

 if (production && (!authEnabled || (!oidcConfigured && !hasAnyAuthToken(env, production)))) {
 checks.push(error('dashboard-auth', 'Dashboard production deployments must enable FELDA/API authentication with non-placeholder credentials.'));
 } else if (oidcConfigured) {
 checks.push(ok('dashboard-auth', 'Dashboard API authentication is enabled with OIDC/JWKS.'));
 } else if (authEnabled) {
 checks.push(ok('dashboard-auth', 'Dashboard API authentication is enabled with role tokens.'));
 } else {
 checks.push(warning('dashboard-auth', 'Dashboard API authentication is disabled for local development.'));
 }

 if (production && !oidcConfigured && !hasAuditorToken(env, production)) {
 checks.push(error('auditor-token', 'Production evidence review requires a non-placeholder auditor token or FELDA identity integration.'));
 } else if (oidcConfigured) {
 checks.push(ok('auditor-token', 'FELDA/OIDC role claims are configured for auditor-level access.'));
 } else if (hasAuditorToken(env, production)) {
 checks.push(ok('auditor-token', 'Auditor-level API credential is configured.'));
 } else {
 checks.push(warning('auditor-token', 'Auditor writes will be open in local no-auth mode.'));
 }

 if (production && hasValue(env.VITE_SMART_ESGP_API_TOKEN)) {
 checks.push(error('frontend-token', 'Remove VITE_SMART_ESGP_API_TOKEN; browser-bundled API tokens are not permitted in production.'));
 } else if (hasValue(env.VITE_SMART_ESGP_API_TOKEN)) {
 checks.push(warning('frontend-token', 'VITE_SMART_ESGP_API_TOKEN is ignored; use localStorage only for short-lived local demo tokens.'));
 } else {
 checks.push(ok('frontend-token', 'No browser-bundled API token required by readiness.'));
 }

 if (!production) {
 checks.push(ok('dashboard-route-boundary', 'Dashboard local development may mount WhatsApp demo routes; production disables them by default.'));
 } else if (env.SMART_ESGP_DASHBOARD_ENABLE_WHATSAPP_WEBHOOK === 'true') {
 checks.push(warning('dashboard-route-boundary', 'Dashboard WhatsApp webhook routes are enabled; production should route Meta callbacks to the standalone WhatsApp service.'));
 } else if (env.SMART_ESGP_DASHBOARD_ENABLE_WHATSAPP_MANUAL_SEND === 'true') {
 checks.push(warning('dashboard-route-boundary', 'Dashboard manual WhatsApp send route is enabled; production should keep outbound chatbot operations on the standalone WhatsApp service.'));
 } else {
 checks.push(ok('dashboard-route-boundary', 'Dashboard WhatsApp ingress and manual send routes are not enabled for production.'));
 }

 return checks;
};

const whatsappChecks = (env: NodeJS.ProcessEnv, production: boolean): RuntimeCheck[] => {
 const checks: RuntimeCheck[] = [];
 const verifyToken = env.WHATSAPP_VERIFY_TOKEN;
 const cloudApiSummary = summarizeWhatsAppCloudApiConfig(createWhatsAppCloudApiConfig(env));
 const requestTimeout = resolveWhatsAppRequestTimeoutMs(env.WHATSAPP_REQUEST_TIMEOUT_MS);
 const rawPayloadRetention = resolveWhatsAppRawPayloadRetention(env);
 const hasLiveSender = production
 ? hasProductionSecret(env.WHATSAPP_ACCESS_TOKEN) && hasProductionSecret(env.WHATSAPP_PHONE_NUMBER_ID)
 : hasValue(env.WHATSAPP_ACCESS_TOKEN) && hasValue(env.WHATSAPP_PHONE_NUMBER_ID);
 const claimTtl = resolveWhatsAppClaimTtlSeconds(env.SMART_ESGP_WHATSAPP_CLAIM_TTL_SECONDS);

 if (production && (!hasProductionSecret(verifyToken) || verifyToken === 'change-me-in-production')) {
 checks.push(error('whatsapp-verify-token', 'Production WhatsApp webhook verification requires a non-default WHATSAPP_VERIFY_TOKEN.'));
 } else if (hasValue(verifyToken)) {
 checks.push(ok('whatsapp-verify-token', 'WHATSAPP_VERIFY_TOKEN is configured.'));
 } else {
 checks.push(warning('whatsapp-verify-token', 'WHATSAPP_VERIFY_TOKEN is not configured; webhook verification handshake will fail.'));
 }

 if (production && !hasProductionSecret(env.WHATSAPP_APP_SECRET)) {
 checks.push(error('whatsapp-signature', 'Production WhatsApp webhooks must validate X-Hub-Signature-256 with a non-placeholder WHATSAPP_APP_SECRET.'));
 } else if (hasValue(env.WHATSAPP_APP_SECRET)) {
 checks.push(ok('whatsapp-signature', 'WhatsApp webhook signature validation is configured.'));
 } else {
 checks.push(warning('whatsapp-signature', 'WhatsApp webhook signature validation is disabled for local development.'));
 }

 if (!cloudApiSummary.graphApiVersionValid) {
 checks.push(error('whatsapp-graph-api-version', 'WHATSAPP_GRAPH_API_VERSION must look like v23.0.'));
 } else {
 checks.push(ok('whatsapp-graph-api-version', `WhatsApp Graph API version ${cloudApiSummary.graphApiVersion} is configured.`));
 }

 if (!cloudApiSummary.phoneNumberIdValid) {
 checks.push(error('whatsapp-phone-number-id', 'WHATSAPP_PHONE_NUMBER_ID must be the numeric Meta phone number ID, not a display phone number.'));
 } else if (cloudApiSummary.phoneNumberIdConfigured) {
 checks.push(ok('whatsapp-phone-number-id', 'WhatsApp phone number ID format is valid.'));
 } else if (production) {
 checks.push(error('whatsapp-phone-number-id', 'Production WhatsApp Cloud API requires WHATSAPP_PHONE_NUMBER_ID.'));
 } else {
 checks.push(warning('whatsapp-phone-number-id', 'WHATSAPP_PHONE_NUMBER_ID is not configured for local dry-run mode.'));
 }

 if (!requestTimeout.ok) {
 checks.push(error('whatsapp-request-timeout', requestTimeout.message || 'WhatsApp Cloud API request timeout is invalid.'));
 } else {
 checks.push(ok('whatsapp-request-timeout', `WhatsApp Cloud API request timeout is ${cloudApiSummary.requestTimeoutMs} ms.`));
 }

 if (!rawPayloadRetention.ok) {
 checks.push(error('whatsapp-raw-payload-retention', rawPayloadRetention.message));
 } else if (production && rawPayloadRetention.retain) {
 checks.push(warning('whatsapp-raw-payload-retention', 'Raw WhatsApp provider payload retention is enabled in production; use only for controlled incident debugging.'));
 } else {
 checks.push(ok('whatsapp-raw-payload-retention', rawPayloadRetention.message));
 }

 if (production && !hasLiveSender) {
 checks.push(error('whatsapp-cloud-api', 'Production chatbot feedback requires non-placeholder WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID.'));
 } else if (hasLiveSender) {
 checks.push(ok('whatsapp-cloud-api', 'WhatsApp Cloud API outbound sender is configured.'));
 } else {
 checks.push(warning('whatsapp-cloud-api', 'WhatsApp outbound sender is in dry-run mode.'));
 }

 if (!claimTtl.ok) {
 checks.push(error('whatsapp-claim-ttl', claimTtl.message || 'WhatsApp webhook claim TTL is invalid.'));
 } else {
 checks.push(ok('whatsapp-claim-ttl', `WhatsApp webhook claim TTL is ${claimTtl.seconds} seconds.`));
 }

 if (production && !hasAuditorToken(env, production)) {
 checks.push(error('manual-send-auth', 'Standalone manual WhatsApp send API requires a non-placeholder auditor token or FELDA identity integration.'));
 } else if (hasAuditorToken(env, production)) {
 checks.push(ok('manual-send-auth', 'Manual WhatsApp send route has auditor-level authentication available.'));
 } else {
 checks.push(warning('manual-send-auth', 'Manual WhatsApp send route is open in local no-auth mode.'));
 }

 return checks;
};

export const createRuntimeReadiness = (
 service: SmartEsgpServiceName,
 env: NodeJS.ProcessEnv
): RuntimeReadiness => {
 const production = isProductionDeployment(env);
 const checks = [
 ...commonChecks(env, production),
 ...(service === 'dashboard' ? dashboardChecks(env, production) : whatsappChecks(env, production)),
 ];

 return {
 ok: checks.every((check) => check.status !== 'error'),
 service,
 environment: production ? 'production' : 'development',
 generatedAt: new Date().toISOString(),
 checks,
 };
};

export const createRuntimeReadinessWithRepository = async (
 service: SmartEsgpServiceName,
 env: NodeJS.ProcessEnv,
 repository: Pick<SmartEsgpRepository, 'checkHealth'>
): Promise<RuntimeReadiness> => {
 const readiness = createRuntimeReadiness(service, env);
 const checks = [
 ...readiness.checks,
 await repositoryConnectivityCheck(repository),
 ];

 return {
 ...readiness,
 ok: checks.every((check) => check.status !== 'error'),
 checks,
 };
};
