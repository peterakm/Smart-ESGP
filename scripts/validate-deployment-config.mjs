import { readFileSync } from 'node:fs';

const requiredFiles = [
  'Dockerfile.dashboard',
  'Dockerfile.whatsapp',
  '.dockerignore',
  'docker-compose.production.example.yml',
  '.env.production.example',
  'docs/deployment.md',
  'docs/whatsapp-deployment-runbook.md',
  'docs/demo-handoff-checklist.md',
];

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const read = (path) => readFileSync(path, 'utf8');

for (const file of requiredFiles) {
  assert(read(file).length > 0, `${file} should exist and not be empty.`);
}

const dashboardDockerfile = read('Dockerfile.dashboard');
const whatsappDockerfile = read('Dockerfile.whatsapp');
const compose = read('docker-compose.production.example.yml');
const envTemplate = read('.env.production.example');
const dockerignore = read('.dockerignore');
const dashboardServer = read('server.ts');
const whatsappServer = read('whatsapp-server.ts');
const serviceLifecycle = read('src/server/serviceLifecycle.ts');
const httpErrorHandling = read('src/server/httpErrorHandling.ts');
const requestContext = read('src/server/requestContext.ts');
const rateLimiter = read('src/server/rateLimiter.ts');
const claimLease = read('src/server/whatsappClaimLease.ts');
const fileRepositoryRetention = read('src/server/fileRepositoryRetention.ts');
const runtimeReadiness = read('src/server/runtimeReadiness.ts');
const packageJson = read('package.json');
const whatsappRunbook = read('docs/whatsapp-deployment-runbook.md');
const demoHandoffChecklist = read('docs/demo-handoff-checklist.md');

assert(dashboardDockerfile.includes('CMD ["node", "dist/server.mjs"]'), 'Dashboard Dockerfile should start dist/server.mjs.');
assert(dashboardDockerfile.includes('scripts/run-postgres-migrations.mjs'), 'Dashboard Dockerfile should include the migration runner.');
assert(whatsappDockerfile.includes('CMD ["node", "dist/whatsapp-server.mjs"]'), 'WhatsApp Dockerfile should start dist/whatsapp-server.mjs.');
assert(whatsappDockerfile.includes('EXPOSE 3100'), 'WhatsApp Dockerfile should expose 3100.');
assert(whatsappDockerfile.includes('scripts/run-postgres-migrations.mjs'), 'WhatsApp Dockerfile should include the migration runner.');
assert(dashboardServer.includes('startHttpService'), 'Dashboard server should use the shared lifecycle helper.');
assert(whatsappServer.includes('startHttpService'), 'WhatsApp server should use the shared lifecycle helper.');
assert(serviceLifecycle.includes("'SIGTERM'"), 'Lifecycle helper should handle SIGTERM.');
assert(serviceLifecycle.includes('repository?.close?.()'), 'Lifecycle helper should close repository connections.');
assert(dashboardServer.includes('createApiErrorHandler'), 'Dashboard server should use the shared API error handler.');
assert(whatsappServer.includes('createApiErrorHandler'), 'WhatsApp server should use the shared API error handler.');
assert(httpErrorHandling.includes('asyncRoute'), 'Shared API error handling should include asyncRoute.');
assert(dashboardServer.includes('applyRequestContext'), 'Dashboard server should apply request context middleware.');
assert(whatsappServer.includes('applyRequestContext'), 'WhatsApp server should apply request context middleware.');
assert(requestContext.includes('x-request-id'), 'Request context should propagate x-request-id.');
assert(dashboardServer.includes('SMART_ESGP_CERTIFICATE_VERIFY_RATE_LIMIT_PER_MINUTE'), 'Dashboard server should rate limit public certificate verification.');
assert(whatsappServer.includes('SMART_ESGP_WHATSAPP_WEBHOOK_RATE_LIMIT_PER_MINUTE'), 'WhatsApp server should rate limit webhook ingress.');
assert(rateLimiter.includes('ratelimit-limit'), 'Rate limiter should emit standard rate limit headers.');
assert(claimLease.includes('SMART_ESGP_WHATSAPP_CLAIM_TTL_SECONDS'), 'Claim lease helper should validate the WhatsApp claim TTL setting.');
assert(runtimeReadiness.includes('whatsapp-claim-ttl'), 'Readiness should report WhatsApp claim TTL validity.');
assert(runtimeReadiness.includes('whatsapp-graph-api-version'), 'Readiness should report WhatsApp Graph API version validity.');
assert(runtimeReadiness.includes('whatsapp-phone-number-id'), 'Readiness should report WhatsApp phone-number ID validity.');
assert(runtimeReadiness.includes('whatsapp-request-timeout'), 'Readiness should report WhatsApp Cloud API timeout validity.');
assert(runtimeReadiness.includes('whatsapp-raw-payload-retention'), 'Readiness should report WhatsApp raw payload retention policy.');
assert(runtimeReadiness.includes('file-repository-retention'), 'Readiness should report file repository retention policy.');
assert(fileRepositoryRetention.includes('SMART_ESGP_FILE_WHATSAPP_EVENT_LIMIT'), 'File repository retention helper should validate WhatsApp event caps.');
assert(read('src/server/whatsappRoutes.ts').includes('resolveWhatsAppClaimTtlMs'), 'WhatsApp routes should use the shared claim TTL helper.');
assert(read('src/server/whatsappRoutes.ts').includes('retainRawPayloads'), 'WhatsApp routes should support raw payload retention controls.');
assert(runtimeReadiness.includes('AWS_ACCESS_KEY_ID') && runtimeReadiness.includes('AWS_SECRET_ACCESS_KEY'), 'Readiness should validate S3-compatible endpoint credentials.');
assert(packageJson.includes('smoke:whatsapp-provider-config'), 'package.json should expose the WhatsApp provider config smoke test.');
assert(packageJson.includes('smoke:whatsapp-cloud-api-send'), 'package.json should expose the WhatsApp Cloud API send smoke test.');
assert(packageJson.includes('smoke:whatsapp-delivery-status'), 'package.json should expose the WhatsApp delivery status smoke test.');
assert(packageJson.includes('smoke:whatsapp-monitoring-filters'), 'package.json should expose the WhatsApp monitoring filters smoke test.');
assert(packageJson.includes('smoke:whatsapp-raw-payload-retention'), 'package.json should expose the WhatsApp raw payload retention smoke test.');
assert(packageJson.includes('smoke:whatsapp-identity-conflicts'), 'package.json should expose the WhatsApp identity conflict smoke test.');
assert(packageJson.includes('smoke:file-retention'), 'package.json should expose the file repository retention smoke test.');
assert(read('README.md').includes('docs/whatsapp-deployment-runbook.md'), 'README should link to the WhatsApp deployment runbook.');
assert(read('README.md').includes('docs/demo-handoff-checklist.md'), 'README should link to the demo handoff checklist.');
assert(read('docs/deployment.md').includes('docs/whatsapp-deployment-runbook.md'), 'Deployment docs should link to the WhatsApp deployment runbook.');
assert(read('docs/deployment.md').includes('docs/demo-handoff-checklist.md'), 'Deployment docs should link to the demo handoff checklist.');

for (const service of ['postgres:', 'minio:', 'migrate:', 'dashboard:', 'whatsapp:']) {
  assert(compose.includes(service), `Compose file should include ${service}`);
}

for (const expected of [
  'SMART_ESGP_REPOSITORY: postgres',
  'SMART_ESGP_ALLOWED_ORIGINS',
  'SMART_ESGP_TRUST_PROXY',
  'SMART_ESGP_FORCE_HTTPS',
  'SMART_ESGP_HSTS_MAX_AGE_SECONDS',
  'SMART_ESGP_ACCESS_LOGS',
  'SMART_ESGP_CERTIFICATE_VERIFY_RATE_LIMIT_PER_MINUTE',
  'SMART_ESGP_WHATSAPP_WEBHOOK_RATE_LIMIT_PER_MINUTE',
  'SMART_ESGP_WHATSAPP_CLAIM_TTL_SECONDS',
  'SMART_ESGP_RETAIN_WHATSAPP_RAW_PAYLOADS',
  'SMART_ESGP_MEDIA_STORAGE: s3',
  'SMART_ESGP_S3_BUCKET',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'WHATSAPP_VERIFY_TOKEN',
  'WHATSAPP_APP_SECRET',
  'WHATSAPP_GRAPH_API_VERSION',
  'WHATSAPP_REQUEST_TIMEOUT_MS',
  'scripts/run-postgres-migrations.mjs',
  'service_completed_successfully',
]) {
  assert(compose.includes(expected), `Compose file should include ${expected}`);
}

for (const expected of [
  'SMART_ESGP_DEPLOYMENT_ENV=production',
  'SMART_ESGP_ALLOWED_ORIGINS=',
  'SMART_ESGP_TRUST_PROXY=true',
  'SMART_ESGP_FORCE_HTTPS=true',
  'SMART_ESGP_HSTS_MAX_AGE_SECONDS=',
  'SMART_ESGP_ACCESS_LOGS=true',
  'SMART_ESGP_CERTIFICATE_VERIFY_RATE_LIMIT_PER_MINUTE=',
  'SMART_ESGP_WHATSAPP_WEBHOOK_RATE_LIMIT_PER_MINUTE=',
  'SMART_ESGP_WHATSAPP_CLAIM_TTL_SECONDS=',
  'SMART_ESGP_RETAIN_WHATSAPP_RAW_PAYLOADS=',
  'SMART_ESGP_REPOSITORY=postgres',
  'SMART_ESGP_FILE_WHATSAPP_EVENT_LIMIT=',
  'SMART_ESGP_MEDIA_STORAGE=s3',
  'MINIO_ROOT_USER=',
  'MINIO_ROOT_PASSWORD=',
  'SMART_ESGP_VIEWER_TOKEN=',
  'SMART_ESGP_OIDC_ISSUER=',
  'SMART_ESGP_OIDC_AUDITOR_ROLES=',
  'WHATSAPP_ACCESS_TOKEN=',
  'WHATSAPP_GRAPH_API_VERSION=',
  'WHATSAPP_REQUEST_TIMEOUT_MS=',
]) {
  assert(envTemplate.includes(expected), `.env.production.example should include ${expected}`);
}

for (const ignored of ['node_modules/', 'dist/', '.env*', '.smart-esgp-data/', '.smart-esgp-media/']) {
  assert(dockerignore.includes(ignored), `.dockerignore should include ${ignored}`);
}

for (const expected of [
  'https://<whatsapp-service-host>/api/whatsapp/webhook',
  'WHATSAPP_VERIFY_TOKEN',
  'WHATSAPP_APP_SECRET',
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_REQUEST_TIMEOUT_MS',
  'SMART_ESGP_RETAIN_WHATSAPP_RAW_PAYLOADS=false',
  'npm.cmd run smoke:whatsapp-provider-config',
  'npm.cmd run smoke:whatsapp-cloud-api-send',
  'npm.cmd run smoke:whatsapp-delivery-status',
  'npm.cmd run smoke:whatsapp-monitoring-filters',
  'npm.cmd run smoke:whatsapp-raw-payload-retention',
  'npm.cmd run smoke:whatsapp-identity-conflicts',
  'npm.cmd run smoke:service-boundaries',
  'whatsapp.webhook.processed',
  'whatsapp.delivery.status',
  'GPS validation status',
]) {
  assert(whatsappRunbook.includes(expected), `WhatsApp deployment runbook should include ${expected}`);
}

assert(read('docs/service-boundaries.md').includes('outboundMode=failed'), 'Service boundaries should document failed-send monitoring filters.');
assert(read('docs/service-boundaries.md').includes('whatsapp.delivery.status'), 'Service boundaries should document WhatsApp delivery status audit events.');
assert(read('docs/service-boundaries.md').includes('SMART_ESGP_RETAIN_WHATSAPP_RAW_PAYLOADS'), 'Service boundaries should document raw payload retention controls.');
assert(read('docs/data-architecture.md').includes('SMART_ESGP_FILE_WHATSAPP_EVENT_LIMIT'), 'Data architecture docs should document file repository retention caps.');
assert(read('docs/data-architecture.md').includes('whatsapp.identity.conflict'), 'Data architecture docs should document WhatsApp identity conflict audit events.');
assert(read('docs/production-readiness.md').includes('smoke:file-retention'), 'Production readiness docs should mention file repository retention verification.');
assert(read('docs/production-readiness.md').includes('smoke:whatsapp-identity-conflicts'), 'Production readiness docs should mention WhatsApp identity conflict verification.');
assert(read('docs/whatsapp-cloud-api.md').includes('smoke:whatsapp-monitoring-filters'), 'WhatsApp Cloud API docs should mention monitoring filter verification.');
assert(read('docs/whatsapp-cloud-api.md').includes('deliveryStatusCount'), 'WhatsApp Cloud API docs should document delivery status webhook summaries.');
assert(read('docs/whatsapp-cloud-api.md').includes('smoke:whatsapp-raw-payload-retention'), 'WhatsApp Cloud API docs should mention raw payload retention verification.');

for (const expected of [
  'npm.cmd run smoke:whatsapp-identity-conflicts',
  'SMART_ESGP_REPOSITORY=postgres',
  'SMART_ESGP_RETAIN_WHATSAPP_RAW_PAYLOADS=false',
  'FELDA review',
  'Live Pilot Gates',
]) {
  assert(demoHandoffChecklist.includes(expected), `Demo handoff checklist should include ${expected}`);
}

console.log(JSON.stringify({
  ok: true,
  files: requiredFiles.length,
}, null, 2));
