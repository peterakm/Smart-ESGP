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
