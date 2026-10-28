import { config as loadEnv } from 'dotenv';
import express from 'express';
import { createAuthConfig } from './src/server/auth';
import { asyncRoute, createApiErrorHandler } from './src/server/httpErrorHandling';
import { createSmartEsgpJson } from './src/server/jsonMiddleware';
import { resolveMaxListLimit } from './src/server/queryLimits';
import { createFixedWindowRateLimiter, rateLimitFromEnv } from './src/server/rateLimiter';
import { createRepositoryFromEnv } from './src/server/repositoryFactory';
import { applyRequestContext } from './src/server/requestContext';
import { createRuntimeReadinessWithRepository } from './src/server/runtimeReadiness';
import { applySecurityBaseline } from './src/server/securityMiddleware';
import { startHttpService } from './src/server/serviceLifecycle';
import { assertSecureProductionStartup } from './src/server/startupGuard';
import { resolveWhatsAppRawPayloadRetention } from './src/server/whatsappRawPayloadRetention';
import { createSystemAuditEvent, maskPhoneNumber } from './src/server/systemAudit';
import { createWhatsAppRouter } from './src/server/whatsappRoutes';
import { createWhatsAppCloudApiConfig, sendWhatsAppTextMessage } from './src/services/whatsappCloudApi';
import { createWhatsAppMediaStorageConfig } from './src/services/whatsappMediaStorage';

loadEnv({ path: '.env.local' });
loadEnv();
assertSecureProductionStartup('whatsapp', process.env);

const app = express();
const PORT = Number(process.env.WHATSAPP_PORT ?? process.env.PORT ?? 3100);
const HOST = '0.0.0.0';
const MAX_MESSAGE_LENGTH = 1000;

const repository = await createRepositoryFromEnv(process.env);
const authConfig = createAuthConfig(process.env);
const cloudApiConfig = createWhatsAppCloudApiConfig(process.env);
const mediaStorageConfig = createWhatsAppMediaStorageConfig(process.env);
const maxListLimit = resolveMaxListLimit(process.env);
const rawPayloadRetention = resolveWhatsAppRawPayloadRetention(process.env);
const whatsappWebhookRateLimit = createFixedWindowRateLimiter({
  id: 'whatsapp-webhook',
  maxRequests: rateLimitFromEnv(process.env.SMART_ESGP_WHATSAPP_WEBHOOK_RATE_LIMIT_PER_MINUTE, 300),
});
const whatsappManualSendRateLimit = createFixedWindowRateLimiter({
  id: 'whatsapp-manual-send',
  maxRequests: rateLimitFromEnv(process.env.SMART_ESGP_WHATSAPP_MANUAL_SEND_RATE_LIMIT_PER_MINUTE, 60),
});

// A farmer who shares their location but never follows up with a photo would
// otherwise sit silently stuck in the flow forever, since the bot is purely
// event-driven and only reacts to inbound messages. This periodic sweep is
// the one exception: it proactively nudges them once, 2 minutes after their
// last message, if they're still waiting at the photo step.
const PHOTO_REMINDER_DELAY_MS = 2 * 60 * 1000;
const PHOTO_REMINDER_SWEEP_INTERVAL_MS = 30 * 1000;

const sweepPendingPhotoReminders = async () => {
  try {
    const sessions = await repository.listWhatsAppSessions();
    const now = Date.now();

    for (const session of sessions) {
      if (session.step !== 'awaiting_photo' || !session.pendingLocation || session.pendingPhoto || session.photoReminderSentAt) {
        continue;
      }

      const lastInboundAt = session.lastInboundAt ? new Date(session.lastInboundAt).getTime() : 0;
      if (!lastInboundAt || now - lastInboundAt < PHOTO_REMINDER_DELAY_MS) {
        continue;
      }

      const language = session.language || 'BM';
      const text = language === 'EN'
        ? "We haven't received your activity photo yet. Please send today's farm photo to complete your check-in."
        : 'Kami belum menerima gambar aktiviti anda. Sila hantar gambar kebun hari ini untuk lengkapkan daftar masuk anda.';

      const sendResult = await sendWhatsAppTextMessage(cloudApiConfig, { toPhone: session.phoneNumber, text });

      await repository.upsertWhatsAppSession({
        ...session,
        photoReminderSentAt: new Date().toISOString(),
      });

      await repository.recordSystemAuditEvents([
        createSystemAuditEvent({
          service: 'whatsapp',
          action: 'whatsapp.photo_reminder.sent',
          actorType: 'system',
          actorId: 'smart-esgp-whatsapp-bot',
          entityType: 'whatsapp_session',
          entityId: session.phoneNumber,
          severity: sendResult.mode === 'failed' ? 'warning' : 'info',
          message: 'Sent a reminder to a farmer who shared location but has not sent a photo yet.',
          metadata: {
            phone: maskPhoneNumber(session.phoneNumber),
            farmerId: session.farmerId,
            outboundMode: sendResult.mode,
          },
        }),
      ]);
    }
  } catch (error) {
    console.error('Photo reminder sweep failed:', error instanceof Error ? error.message : error);
  }
};

setInterval(() => {
  void sweepPendingPhotoReminders();
}, PHOTO_REMINDER_SWEEP_INTERVAL_MS);

applyRequestContext(app, process.env, 'whatsapp');
applySecurityBaseline(app, process.env);
app.use(createSmartEsgpJson(process.env, 'whatsapp'));

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'smart-esgp-whatsapp-chatbot',
    mode: cloudApiConfig.accessToken && cloudApiConfig.phoneNumberId ? 'live' : 'dry_run',
  });
});

app.get('/ready', asyncRoute(async (_req, res) => {
  const readiness = await createRuntimeReadinessWithRepository('whatsapp', process.env, repository);
  res.status(readiness.ok ? 200 : 503).json(readiness);
}));

if (process.env.SMART_ESGP_ENABLE_TEST_ERROR_ROUTE === 'true') {
  app.get('/api/__test/async-error', asyncRoute(async () => {
    throw new Error('Smart-ESGP WhatsApp test async error.');
  }));
}

app.use(createWhatsAppRouter({
  repository,
  authConfig,
  cloudApiConfig,
  mediaStorageConfig,
  verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
  maxMessageLength: MAX_MESSAGE_LENGTH,
  includeWebhookRoutes: true,
  includeManualSendRoute: true,
  includeMonitoringRoutes: false,
  webhookRateLimit: whatsappWebhookRateLimit,
  manualSendRateLimit: whatsappManualSendRateLimit,
  maxListLimit,
  serviceName: 'whatsapp',
  retainRawPayloads: rawPayloadRetention.retain,
}));

app.use(createApiErrorHandler('whatsapp'));

startHttpService({
  app,
  port: PORT,
  host: HOST,
  serviceLabel: 'Smart-ESGP WhatsApp chatbot service',
  repository,
  onListening: () => {
    console.log(`WhatsApp chatbot service running on port ${PORT}`);
  },
});
