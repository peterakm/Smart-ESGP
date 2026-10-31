import { createRuntimeReadiness, isProductionDeployment, type SmartEsgpServiceName } from './runtimeReadiness';

// Readiness checks that, when failing in production, leave the service open to
// unauthenticated writes or forged webhooks. These block startup instead of only
// reporting 503 on /ready, because an unhealthy container still serves traffic.
const SECURITY_CRITICAL_CHECK_IDS = new Set([
 'dashboard-auth',
 'auditor-token',
 'frontend-token',
 'whatsapp-verify-token',
 'whatsapp-signature',
 'manual-send-auth',
]);

export const findBlockingSecurityChecks = (service: SmartEsgpServiceName, env: NodeJS.ProcessEnv) => {
 if (!isProductionDeployment(env)) return [];

 return createRuntimeReadiness(service, env).checks.filter(
 (check) => check.status === 'error' && SECURITY_CRITICAL_CHECK_IDS.has(check.id)
 );
};

// Outside production, listen on loopback only so the service is not reachable
// from the local network. Containers need 0.0.0.0, and SMART_ESGP_HOST overrides.
export const resolveListenHost = (env: NodeJS.ProcessEnv, isProductionBuild: boolean) => {
 return env.SMART_ESGP_HOST?.trim() || (isProductionBuild || isProductionDeployment(env) ? '0.0.0.0' : '127.0.0.1');
};

// The bundled dist/*.mjs entry is the production build, but the checks above
// only run when the env says production, so make that gap loud.
export const warnIfProductionBuildWithoutProductionEnv = (
 service: SmartEsgpServiceName,
 env: NodeJS.ProcessEnv,
 isProductionBuild: boolean
) => {
 if (!isProductionBuild || isProductionDeployment(env)) return;

 console.warn(
 `[${service}] Running the production build without NODE_ENV=production or SMART_ESGP_DEPLOYMENT_ENV=production; production security checks are NOT enforced.`
 );
};

export const assertSecureProductionStartup = (service: SmartEsgpServiceName, env: NodeJS.ProcessEnv) => {
 const blocking = findBlockingSecurityChecks(service, env);
 if (blocking.length === 0) return;

 const details = blocking.map((check) => `- ${check.id}: ${check.message}`).join('\n');

 if (env.SMART_ESGP_ALLOW_INSECURE_STARTUP === 'true') {
 console.warn(`[${service}] SMART_ESGP_ALLOW_INSECURE_STARTUP=true; starting despite security readiness errors:\n${details}`);
 return;
 }

 throw new Error(`[${service}] Refusing to start in production with insecure configuration:\n${details}`);
};
