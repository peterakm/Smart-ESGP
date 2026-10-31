import express from 'express';
import type { WhatsAppSendResult } from '../contracts/whatsapp';
import { processWhatsAppWebhook } from '../services/whatsappWebhookProcessor';
import { sendWhatsAppTextMessage, type WhatsAppCloudApiConfig } from '../services/whatsappCloudApi';
import type { WhatsAppMediaStorageConfig } from '../services/whatsappMediaStorage';
import { normalizeWhatsAppPhoneNumber } from '../services/whatsappPhone';
import { requireRole, timingSafeEqual, verifyWhatsAppSignature, type SmartEsgpAuthConfig, type SmartEsgpRequest } from './auth';
import { asyncRoute } from './httpErrorHandling';
import { parseListLimit } from './queryLimits';
import type { SmartEsgpRepository } from './smartEsgpRepository';
import { createSystemAuditEvent, maskPhoneNumber } from './systemAudit';
import { resolveWhatsAppClaimTtlMs } from './whatsappClaimLease';
import { toWhatsAppMonitoringEvent, toWhatsAppMonitoringSendResult } from './whatsappMonitoring';

interface WhatsAppRoutesOptions {
 repository: SmartEsgpRepository;
 authConfig: SmartEsgpAuthConfig;
 cloudApiConfig: WhatsAppCloudApiConfig;
 mediaStorageConfig: WhatsAppMediaStorageConfig;
 webhookRateLimit?: express.RequestHandler;
 manualSendRateLimit?: express.RequestHandler;
 verifyToken?: string;
 maxMessageLength?: number;
 includeWebhookRoutes?: boolean;
 includeMonitoringRoutes?: boolean;
 includeManualSendRoute?: boolean;
 serviceName?: 'dashboard' | 'whatsapp';
 maxListLimit?: number;
 retainRawPayloads?: boolean;
}

const sanitizeText = (value: unknown, maxLength: number) => {
 if (typeof value !== 'string') return '';
 return value.trim().slice(0, maxLength);
};

const parseBooleanQuery = (value: unknown) => {
 if (value === true) return true;
 if (typeof value !== 'string') return false;
 return value.trim().toLowerCase() === 'true' || value.trim() === '1';
};

const parseOutboundModeQuery = (value: unknown): WhatsAppSendResult['mode'] | undefined => {
 if (typeof value !== 'string') return undefined;
 const normalized = value.trim();
 return normalized === 'sent' || normalized === 'dry_run' || normalized === 'failed'
 ? normalized
 : undefined;
};

export const createWhatsAppRouter = (options: WhatsAppRoutesOptions) => {
 const router = express.Router();
 const maxMessageLength = options.maxMessageLength ?? 1000;
 const includeWebhookRoutes = options.includeWebhookRoutes ?? true;
 const webhookRateLimit = options.webhookRateLimit ?? ((_req, _res, next) => next());
 const manualSendRateLimit = options.manualSendRateLimit ?? ((_req, _res, next) => next());
 const serviceName = options.serviceName ?? 'whatsapp';
 const maxListLimit = options.maxListLimit ?? 100;
 const retainRawPayloads = options.retainRawPayloads ?? true;
 const claimTtlMs = resolveWhatsAppClaimTtlMs();

 if (includeWebhookRoutes) {
 router.get('/api/whatsapp/webhook', webhookRateLimit, (req, res) => {
 const mode = req.query['hub.mode'];
 const token = req.query['hub.verify_token'];
 const challenge = req.query['hub.challenge'];

 if (!options.verifyToken) {
 return res.status(500).send('WHATSAPP_VERIFY_TOKEN is not configured.');
 }

 if (mode === 'subscribe' && typeof token === 'string' && timingSafeEqual(token, options.verifyToken) && typeof challenge === 'string') {
 return res.status(200).send(challenge);
 }

 return res.sendStatus(403);
 });

 router.post('/api/whatsapp/webhook', webhookRateLimit, verifyWhatsAppSignature(options.authConfig), asyncRoute(async (req, res) => {
 const result = await processWhatsAppWebhook(req.body, {
 repository: options.repository,
 cloudApiConfig: options.cloudApiConfig,
 mediaStorageConfig: options.mediaStorageConfig,
 serviceName,
 retainRawPayloads,
 claimTtlMs,
 });

 return res.status(200).json(result);
 }));
 }

 if (options.includeManualSendRoute) {
 router.post('/api/whatsapp/messages', manualSendRateLimit, requireRole(options.authConfig, 'auditor'), asyncRoute(async (req: SmartEsgpRequest, res) => {
 if (!req.body || typeof req.body !== 'object') {
 return res.status(400).json({ error: 'Request body must be an object.' });
 }

 const body = req.body as Record<string, unknown>;
 const toPhone = normalizeWhatsAppPhoneNumber(body.toPhone);
 const text = sanitizeText(body.text, maxMessageLength);

 if (!toPhone || !text) {
 return res.status(400).json({ error: 'Valid international toPhone and text are required.' });
 }

 const sendResult = await sendWhatsAppTextMessage(options.cloudApiConfig, {
 toPhone,
 text,
 });
 await options.repository.recordSystemAuditEvents([
 createSystemAuditEvent({
 service: serviceName,
 action: 'whatsapp.manual_send',
 actorType: 'auditor',
 actorId: req.smartEsgpActorId || req.smartEsgpRole || 'auditor-api',
 entityType: 'whatsapp_message',
 entityId: sendResult.providerMessageId,
 severity: sendResult.mode === 'failed' ? 'error' : 'info',
 message: `Manual WhatsApp outbound message completed in ${sendResult.mode} mode.`,
 metadata: {
 outboundMode: sendResult.mode,
 statusCode: sendResult.statusCode,
 toPhone: maskPhoneNumber(toPhone),
 },
 }),
 ]);

 return res.status(sendResult.mode === 'failed' ? 502 : 200).json({
 sendResult: toWhatsAppMonitoringSendResult(sendResult),
 });
 }));
 }

 if (options.includeMonitoringRoutes) {
 router.get('/api/whatsapp/events', requireRole(options.authConfig, 'viewer'), asyncRoute(async (req, res) => {
 const limit = parseListLimit(req.query.limit, 25, maxListLimit);
 const filters = {
 gpsReview: parseBooleanQuery(req.query.gpsReview),
 outboundMode: parseOutboundModeQuery(req.query.outboundMode),
 };
 const events = await options.repository.listWhatsAppEvents(limit, filters);
 res.json({
 limit,
 filters,
 events: events.map(toWhatsAppMonitoringEvent),
 });
 }));

 router.get('/api/whatsapp/farmers/:farmerId/events', requireRole(options.authConfig, 'viewer'), asyncRoute(async (req, res) => {
 const farmerId = sanitizeText(req.params.farmerId, 80);
 if (!farmerId) {
 return res.status(400).json({ error: 'farmerId is required.' });
 }

 const limit = parseListLimit(req.query.limit, 25, maxListLimit);
 const filters = {
 gpsReview: parseBooleanQuery(req.query.gpsReview),
 outboundMode: parseOutboundModeQuery(req.query.outboundMode),
 };
 const events = await options.repository.listWhatsAppEventsForFarmer(farmerId, limit, filters);
 res.json({
 farmerId,
 limit,
 filters,
 events: events.map(toWhatsAppMonitoringEvent),
 });
 }));

 router.get('/api/whatsapp/sessions', requireRole(options.authConfig, 'viewer'), asyncRoute(async (_req, res) => {
 res.json({
 sessions: await options.repository.listWhatsAppSessions(),
 });
 }));

 router.get('/api/whatsapp/message-claims', requireRole(options.authConfig, 'viewer'), asyncRoute(async (req, res) => {
 const limit = parseListLimit(req.query.limit, 25, maxListLimit);
 res.json({
 limit,
 claims: await options.repository.listWhatsAppProviderMessageClaims(limit),
 });
 }));
 }

 return router;
};
