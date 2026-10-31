import { config as loadEnv } from 'dotenv';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { FarmerStatus, type EvidenceRecord, type EvidenceReview, type Farmer, type SystemAuditEvent } from './src/types';
import { evaluateFarmerCompliance } from './src/services/complianceEngine';
import {
  isEvidenceReviewDecision,
  reverseVerifiedEvidenceContribution,
  verificationStatusForReview,
} from './src/services/evidenceCorrection';
import { createAuthConfig, requireRole, type SmartEsgpRequest } from './src/server/auth';
import { buildCertificateVerificationResult, createCertificateRecord } from './src/server/certificateRegistry';
import { createEvidenceMediaAccess, openLocalEvidenceMedia } from './src/server/evidenceMediaAccess';
import { asyncRoute, createApiErrorHandler } from './src/server/httpErrorHandling';
import { createFixedWindowRateLimiter, rateLimitFromEnv } from './src/server/rateLimiter';
import { createWhatsAppCloudApiConfig, sendWhatsAppTextMessage } from './src/services/whatsappCloudApi';
import { buildCertificateIssuedNotice, buildEvidenceReviewNotice } from './src/services/farmerFeedback';
import type { WhatsAppSendResult } from './src/contracts/whatsapp';
import { createWhatsAppMediaStorageConfig } from './src/services/whatsappMediaStorage';
import { createSmartEsgpJson } from './src/server/jsonMiddleware';
import { createRepositoryFromEnv } from './src/server/repositoryFactory';
import { parseListLimit, resolveMaxListLimit } from './src/server/queryLimits';
import { applyRequestContext } from './src/server/requestContext';
import { createRuntimeReadinessWithRepository } from './src/server/runtimeReadiness';
import { applySecurityBaseline } from './src/server/securityMiddleware';
import { startHttpService } from './src/server/serviceLifecycle';
import { assertSecureProductionStartup } from './src/server/startupGuard';
import { createSystemAuditEvent, maskPhoneNumber } from './src/server/systemAudit';
import { resolveWhatsAppRawPayloadRetention } from './src/server/whatsappRawPayloadRetention';
import { createWhatsAppRouter } from './src/server/whatsappRoutes';

loadEnv({ path: '.env.local' });
loadEnv();
assertSecureProductionStartup('dashboard', process.env);

const app = express();
const PORT = Number(process.env.PORT ?? 3000);
const HOST = '0.0.0.0';
const isProduction = process.env.NODE_ENV === 'production' || path.basename(process.argv[1] || '') === 'server.mjs';
const MAX_MESSAGE_LENGTH = 1000;
const MAX_HISTORY_ITEMS = 10;
const dashboardWebhookRoutesEnabled =
  process.env.SMART_ESGP_DASHBOARD_ENABLE_WHATSAPP_WEBHOOK === 'true' || !isProduction;
const dashboardManualSendEnabled =
  process.env.SMART_ESGP_DASHBOARD_ENABLE_WHATSAPP_MANUAL_SEND === 'true' || !isProduction;
const authConfig = createAuthConfig(process.env);
const whatsappCloudApiConfig = createWhatsAppCloudApiConfig(process.env);
const whatsappMediaStorageConfig = createWhatsAppMediaStorageConfig(process.env);
const serviceName = 'dashboard';
const maxListLimit = resolveMaxListLimit(process.env);
const whatsappRawPayloadRetention = resolveWhatsAppRawPayloadRetention(process.env);
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL;

interface ChatHistoryItem {
  sender: 'farmer' | 'bot';
  text: string;
}

interface ChatRequest {
  message: string;
  farmerId: string;
  history: ChatHistoryItem[];
}

const repository = await createRepositoryFromEnv(process.env);
const chatRateLimit = createFixedWindowRateLimiter({
  id: 'dashboard-chat',
  maxRequests: rateLimitFromEnv(process.env.SMART_ESGP_CHAT_RATE_LIMIT_PER_MINUTE, 30),
  message: 'Too many chat requests. Please wait a minute and try again.',
});
const certificateVerifyRateLimit = createFixedWindowRateLimiter({
  id: 'certificate-verify',
  maxRequests: rateLimitFromEnv(process.env.SMART_ESGP_CERTIFICATE_VERIFY_RATE_LIMIT_PER_MINUTE, 60),
});
const whatsappWebhookRateLimit = createFixedWindowRateLimiter({
  id: 'dashboard-whatsapp-webhook',
  maxRequests: rateLimitFromEnv(process.env.SMART_ESGP_WHATSAPP_WEBHOOK_RATE_LIMIT_PER_MINUTE, 300),
});
const whatsappManualSendRateLimit = createFixedWindowRateLimiter({
  id: 'dashboard-whatsapp-manual-send',
  maxRequests: rateLimitFromEnv(process.env.SMART_ESGP_WHATSAPP_MANUAL_SEND_RATE_LIMIT_PER_MINUTE, 60),
});

applyRequestContext(app, process.env, serviceName);
applySecurityBaseline(app, process.env);
app.use(createSmartEsgpJson(process.env, serviceName));

const isValidSender = (sender: unknown): sender is ChatHistoryItem['sender'] => {
  return sender === 'farmer' || sender === 'bot';
};

const sanitizeText = (value: unknown, maxLength = MAX_MESSAGE_LENGTH) => {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
};

const validateChatRequest = (body: unknown): { value?: ChatRequest; error?: string } => {
  if (!body || typeof body !== 'object') {
    return { error: 'Request body must be a JSON object.' };
  }

  const raw = body as Record<string, unknown>;
  const message = sanitizeText(raw.message);
  const farmerId = sanitizeText(raw.farmerId, 80);

  if (!message) {
    return { error: 'Message is required.' };
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    return { error: `Message must be ${MAX_MESSAGE_LENGTH} characters or less.` };
  }

  if (!farmerId) {
    return { error: 'A valid farmerId is required.' };
  }

  const rawHistory = Array.isArray(raw.history) ? raw.history : [];
  const history = rawHistory
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => ({
      sender: isValidSender(item.sender) ? item.sender : undefined,
      text: sanitizeText(item.text),
    }))
    .filter((item): item is ChatHistoryItem => !!item.sender && !!item.text)
    .slice(-MAX_HISTORY_ITEMS);

  return {
    value: {
      message,
      farmerId,
      history,
    },
  };
};

// Audit attribution must come from the authenticated identity; names supplied in
// the request body (reviewedBy, issuedBy) are display labels only.
const auditActorId = (req: SmartEsgpRequest) => req.smartEsgpActorId || req.smartEsgpRole || 'felda-api';

const firstName = (name: string) => name.split(' ')[0] || 'Tani';

const buildSystemPrompt = (farmer: Farmer) => {
  const language = farmer.whatsappLanguage || 'BM';

  return `You are the Smart-ESGP AI Compliance Officer, a warm, supportive, and practical digital auditor assisting independent oil palm smallholders in Malaysia.
The farmer you are chatting with is: ${farmer.name}.
Current MSPO Compliance Score: ${farmer.score}/100.
Status: ${farmer.status}.
MPOB Licence: ${farmer.mpobLicence || 'Not linked'}.
Primary Language: ${language}. Reply primarily in this language.

Guidelines:
1. Speak in a simple, practical, conversational tone suitable for a busy farmer in rural Malaysia.
2. Avoid legalistic jargon. Explain the concrete action: do not clear land near rivers, do not cut primary forest after 31 December 2020, and keep receipts/photos.
3. Keep responses concise and segmented for WhatsApp.
4. Use plain language first; visual indicators are allowed, but do not rely on them for meaning.
5. End with an encouraging note or one simple next action.`;
};

const simulatedReply = (message: string, farmer: Farmer) => {
  const language = farmer.whatsappLanguage || 'BM';
  const isBM = language === 'BM';
  const upperMsg = message.toUpperCase();
  const farmerFirstName = firstName(farmer.name);

  if (isBM) {
    if (upperMsg.includes('DEFORESTATION') || upperMsg.includes('HUTAN') || upperMsg.includes('TEBANG')) {
      return `Makluman penting EUDR:\n\nSijil Smart-ESGP perlu membuktikan tiada pokok hutan ditebang di plot anda selepas 31 Disember 2020.\n\nLangkah seterusnya:\n1. Kongsi lokasi semasa ketika berjalan di sempadan kebun.\n2. Ambil gambar kawasan sempadan berdekatan hutan simpan jika ada.\n\nAda soalan tentang sempadan kebun Pak ${farmerFirstName}?`;
    }

    if (upperMsg.includes('BAJA') || upperMsg.includes('KIMIA') || upperMsg.includes('FERTILIZER') || upperMsg.includes('RACUN')) {
      return `Log pengurusan bahan kimia:\n\nBagus Pak ${farmerFirstName} bertanya. Untuk MSPO 2.0:\n\n1. Ambil foto beg baja atau botol racun yang digunakan.\n2. Ambil gambar bukti bilasan botol kosong sebanyak 3 kali.\n3. Penting: jangan sembur racun dalam jarak 10 meter dari tebing sungai.\n\nHantar foto aktiviti apabila siap.`;
    }

    if (upperMsg.includes('MPOB') || upperMsg.includes('LESEN') || upperMsg.includes('LICENSE')) {
      return `Lesen MPOB:\n\nLesen MPOB aktif ialah bukti utama kebun anda sah di sisi undang-undang.\n\nMaklumat lesen:\n- No Lesen: ${farmer.mpobLicence || 'Belum dipautkan'}\n- Status: Dipautkan\n\nPastikan nama pada lesen sepadan dengan geran tanah atau surat sewa tanah.`;
    }

    return `Sokongan Smart-ESGP (Simulasi):\n\nSalam Pak ${farmerFirstName}. Saya boleh bantu kebun anda bersedia untuk EUDR dan MSPO 2.0.\n\nAnda boleh:\n- Hantar koordinat lokasi kebun.\n- Hantar gambar aktiviti harian seperti membaja, menuai, atau meracun.\n- Tanya cara melindungi sungai atau sempadan hutan.\n\nApakah aktiviti di kebun hari ini?`;
  }

  if (upperMsg.includes('DEFORESTATION') || upperMsg.includes('FOREST') || upperMsg.includes('CUT')) {
    return `EUDR deforestation advisory:\n\nTo clear European customs, we must prove zero forest clearing on your plot since 31 December 2020.\n\nAction items:\n1. Walk your farm boundary and send live location pins.\n2. Take photos of buffer zones next to natural forests.\n\nDo you need help checking the boundary, Pak ${farmerFirstName}?`;
  }

  if (upperMsg.includes('CHEMICAL') || upperMsg.includes('FERTILIZER') || upperMsg.includes('PESTICIDE') || upperMsg.includes('BAJA')) {
    return `Chemical management logs:\n\nTo satisfy MSPO 2.0:\n\n1. Snap a picture of chemical/fertilizer receipts or bags.\n2. Document the triple-rinse cleaning method for empty containers.\n3. Critical: keep a 10-meter chemical-free buffer from river banks.\n\nUpload a picture of your storage or application when ready.`;
  }

  return `Smart-ESGP Assistant (Simulation Mode):\n\nHello Pak ${farmerFirstName}. I can help you log daily activities and build your digital certificate for EUDR and MSPO 2.0 compliance.\n\nYou can:\n- Share live coordinates.\n- Upload photos of harvesting, weeding, or organic mulching.\n- Ask about stream protection or chemical safety.\n\nWhat are you working on today?`;
};

app.get('/api/claude-status', (_req, res) => {
  const hasClaudeKey = !!process.env.ANTHROPIC_API_KEY;
  const hasOllamaModel = !hasClaudeKey && !!OLLAMA_MODEL;
  const provider = hasClaudeKey ? 'claude' : hasOllamaModel ? 'ollama' : 'simulation';
  res.json({
    connected: hasClaudeKey || hasOllamaModel,
    mode: provider === 'simulation' ? 'simulation' : 'live',
    provider,
    message:
      provider === 'claude'
        ? 'Successfully linked with Claude AI. Responses are real-time.'
        : provider === 'ollama'
          ? `Successfully linked with local Ollama (${OLLAMA_MODEL}). Responses are real-time.`
          : 'Running in proof-of-concept simulation mode. Set ANTHROPIC_API_KEY, or OLLAMA_MODEL for a free local model, to activate live responses.',
  });
});

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'smart-esgp-dashboard',
    mode: isProduction ? 'production' : 'development',
  });
});

app.get('/ready', asyncRoute(async (_req, res) => {
  const readiness = await createRuntimeReadinessWithRepository(serviceName, process.env, repository);
  res.status(readiness.ok ? 200 : 503).json(readiness);
}));

if (process.env.SMART_ESGP_ENABLE_TEST_ERROR_ROUTE === 'true') {
  app.get('/api/__test/async-error', asyncRoute(async () => {
    throw new Error('Smart-ESGP dashboard test async error.');
  }));
}

app.get('/api/auth/status', (req: SmartEsgpRequest, res) => {
  res.json({
    requireAuth: authConfig.requireAuth,
    role: req.smartEsgpRole || (authConfig.requireAuth ? undefined : 'auditor'),
  });
});

app.get('/api/farmers', requireRole(authConfig, 'viewer'), asyncRoute(async (_req, res) => {
  res.json({
    farmers: await repository.listFarmers(),
  });
}));

app.get('/api/farmers/:farmerId', requireRole(authConfig, 'viewer'), asyncRoute(async (req, res) => {
  const farmer = await repository.getFarmer(req.params.farmerId);

  if (!farmer) {
    return res.status(404).json({ error: 'Farmer not found.' });
  }

  return res.json({ farmer });
}));

app.put('/api/farmers/:farmerId', requireRole(authConfig, 'auditor'), asyncRoute(async (req: SmartEsgpRequest, res) => {
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Request body must be a farmer object.' });
  }

  const farmer = req.body as Farmer;

  if (farmer.id !== req.params.farmerId) {
    return res.status(400).json({ error: 'Farmer ID in path and body must match.' });
  }

  if (!(await repository.hasFarmer(farmer.id))) {
    return res.status(404).json({ error: 'Farmer not found.' });
  }

  const updatedFarmer = await repository.upsertFarmer(farmer);
  await repository.recordSystemAuditEvents([
    createSystemAuditEvent({
      service: serviceName,
      action: 'farmer.updated',
      actorType: 'auditor',
      actorId: auditActorId(req),
      entityType: 'farmer',
      entityId: updatedFarmer.id,
      severity: 'info',
      message: `Farmer ${updatedFarmer.id} was updated through the FELDA dashboard API.`,
      metadata: {
        status: updatedFarmer.status,
        score: updatedFarmer.score,
      },
    }),
  ]);

  return res.json({
    farmer: updatedFarmer,
  });
}));

app.get('/api/evidence', requireRole(authConfig, 'viewer'), asyncRoute(async (req, res) => {
  const farmerId = typeof req.query.farmerId === 'string' ? req.query.farmerId : undefined;
  const limit = parseListLimit(req.query.limit, 50, maxListLimit);
  const review: 'open' | undefined = req.query.review === 'open' ? 'open' : undefined;
  const locationValidationStatus = typeof req.query.locationValidationStatus === 'string'
    && ['inside_plot', 'outside_plot', 'unknown_plot', 'missing_location'].includes(req.query.locationValidationStatus)
    ? req.query.locationValidationStatus as NonNullable<EvidenceRecord['locationValidation']>['status']
    : undefined;
  const filters = {
    ...(review ? { review } : {}),
    ...(locationValidationStatus ? { locationValidationStatus } : {}),
  };

  res.json({
    limit,
    filters,
    evidence: await repository.listEvidence(farmerId, limit, filters),
  });
}));

app.get('/api/evidence/:evidenceId/media-url', requireRole(authConfig, 'viewer'), asyncRoute(async (req: SmartEsgpRequest, res) => {
  const evidence = await repository.getEvidence(req.params.evidenceId);

  if (!evidence) {
    return res.status(404).json({ error: 'Evidence record not found.' });
  }

  if (evidence.mediaStorage?.mode !== 'stored' || !evidence.mediaStorage.storageKey) {
    return res.status(409).json({ error: 'Evidence media is not stored yet.' });
  }

  try {
    const access = await createEvidenceMediaAccess(whatsappMediaStorageConfig, evidence);
    await repository.recordSystemAuditEvents([
      createSystemAuditEvent({
        service: serviceName,
        action: 'evidence.media_access.requested',
        actorType: req.smartEsgpRole === 'auditor' ? 'auditor' : 'api',
        actorId: req.smartEsgpActorId || req.smartEsgpRole || 'viewer',
        entityType: 'evidence',
        entityId: evidence.id,
        severity: 'info',
        message: `Evidence media access prepared through ${access.provider}.`,
        metadata: {
          farmerId: evidence.farmerId,
          provider: access.provider,
          accessMode: access.accessMode,
          expiresAt: access.expiresAt,
        },
      }),
    ]);

    return res.json({
      evidenceId: evidence.id,
      ...access,
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unable to prepare evidence media access.',
    });
  }
}));

app.get('/api/evidence/:evidenceId/media', requireRole(authConfig, 'viewer'), asyncRoute(async (req, res) => {
  const evidence = await repository.getEvidence(req.params.evidenceId);

  if (!evidence) {
    return res.status(404).json({ error: 'Evidence record not found.' });
  }

  try {
    const media = await openLocalEvidenceMedia(whatsappMediaStorageConfig, evidence);
    res.setHeader('content-type', media.contentType);
    if (media.sizeBytes) {
      res.setHeader('content-length', String(media.sizeBytes));
    }
    if (media.sha256) {
      res.setHeader('x-smart-esgp-sha256', media.sha256);
    }
    media.stream.pipe(res);
  } catch (error) {
    return res.status(404).json({
      error: error instanceof Error ? error.message : 'Evidence media file was not found.',
    });
  }
}));

app.get('/api/consents', requireRole(authConfig, 'viewer'), asyncRoute(async (req, res) => {
  const farmerId = typeof req.query.farmerId === 'string' ? req.query.farmerId : undefined;
  const phoneNumber = typeof req.query.phoneNumber === 'string' ? req.query.phoneNumber : undefined;
  const limit = parseListLimit(req.query.limit, 50, maxListLimit);

  res.json({
    limit,
    consents: await repository.listConsentRecords({ farmerId, phoneNumber }, limit),
  });
}));

app.get('/api/audit/events', requireRole(authConfig, 'viewer'), asyncRoute(async (req, res) => {
  const limit = parseListLimit(req.query.limit, 50, maxListLimit);
  const service = typeof req.query.service === 'string' && ['dashboard', 'whatsapp'].includes(req.query.service)
    ? req.query.service as SystemAuditEvent['service']
    : undefined;
  const severity = typeof req.query.severity === 'string' && ['info', 'warning', 'error'].includes(req.query.severity)
    ? req.query.severity as SystemAuditEvent['severity']
    : undefined;
  const entityType = typeof req.query.entityType === 'string'
    && ['service', 'farmer', 'evidence', 'certificate', 'whatsapp_message', 'whatsapp_session'].includes(req.query.entityType)
    ? req.query.entityType as SystemAuditEvent['entityType']
    : undefined;
  const action = typeof req.query.action === 'string' ? sanitizeText(req.query.action, 120) : undefined;
  const filters = {
    ...(service ? { service } : {}),
    ...(severity ? { severity } : {}),
    ...(entityType ? { entityType } : {}),
    ...(action ? { action } : {}),
  };

  res.json({
    limit,
    filters,
    events: await repository.listSystemAuditEvents(limit, filters),
  });
}));

// Messages the farmer about a dashboard decision on their record. Only sends to
// a WhatsApp session still linked to this farmer, so a notice never reaches a
// phone that has since been unlinked or transferred to someone else.
const notifyLinkedFarmer = async (
  farmer: Farmer,
  preferredPhone: string | undefined,
  buildText: (language: 'BM' | 'EN') => string | undefined
): Promise<{ mode: WhatsAppSendResult['mode'] | 'skipped' }> => {
  const preferredSession = preferredPhone ? await repository.getWhatsAppSession(preferredPhone) : undefined;
  const session = preferredSession?.farmerId === farmer.id
    ? preferredSession
    : (await repository.listWhatsAppSessions()).find((candidate) => candidate.farmerId === farmer.id);

  if (!session) return { mode: 'skipped' };

  const text = buildText(session.language || farmer.whatsappLanguage || 'BM');
  if (!text) return { mode: 'skipped' };

  const result = await sendWhatsAppTextMessage(whatsappCloudApiConfig, {
    toPhone: session.phoneNumber,
    text,
  });
  return { mode: result.mode };
};

app.patch('/api/evidence/:evidenceId/review', requireRole(authConfig, 'auditor'), asyncRoute(async (req: SmartEsgpRequest, res) => {
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Request body must be a review decision object.' });
  }

  const body = req.body as Record<string, unknown>;
  const decision = body.decision;
  const notes = sanitizeText(body.notes, 500);
  const reviewedBy = sanitizeText(body.reviewedBy, 120) || req.smartEsgpActorId || 'FELDA Evidence Reviewer';
  const existingRecord = await repository.getEvidence(req.params.evidenceId);

  if (!isEvidenceReviewDecision(decision)) {
    return res.status(400).json({ error: 'decision must be approved, rejected, flagged, or pending.' });
  }

  if (!existingRecord) {
    return res.status(404).json({ error: 'Evidence record not found.' });
  }

  const review: EvidenceReview = {
    status: decision,
    reviewedBy,
    reviewedAt: new Date().toISOString(),
    notes: notes || undefined,
  };
  const verificationStatus = verificationStatusForReview(decision);
  const wasVerified = existingRecord.verificationStatus === 'verified';
  const willBeVerified = verificationStatus === 'verified';
  const evidence = await repository.updateEvidenceReview(existingRecord.id, review, verificationStatus);

  if (!evidence) {
    return res.status(404).json({ error: 'Evidence record not found.' });
  }

  let farmer = await repository.getFarmer(evidence.farmerId);
  const shouldApplyApprovedEvidence =
    !wasVerified && willBeVerified && !!farmer;
  const shouldReverseApprovedEvidence =
    wasVerified && !willBeVerified && !!farmer;
  let suspendedCertificate = undefined as Awaited<ReturnType<typeof repository.getActiveCertificateForFarmer>>;

  if (shouldApplyApprovedEvidence && farmer) {
    farmer = await repository.upsertFarmer(evaluateFarmerCompliance(farmer, [evidence]).farmer);
  } else if (shouldReverseApprovedEvidence && farmer) {
    const correctedFarmer = reverseVerifiedEvidenceContribution(farmer, evidence);
    farmer = await repository.upsertFarmer(correctedFarmer);
    const activeCertificate = await repository.getActiveCertificateForFarmer(farmer.id);

    if (activeCertificate && correctedFarmer.status !== FarmerStatus.CERTIFIED) {
      suspendedCertificate = await repository.upsertCertificate({
        ...activeCertificate,
        status: 'suspended',
      });
    }
  }

  // Re-saving the same decision (e.g. editing notes) shouldn't re-message the farmer.
  const decisionChanged = existingRecord.review?.status !== decision;
  const reviewedFarmer = farmer;
  const farmerNotified = reviewedFarmer && decisionChanged
    ? await notifyLinkedFarmer(reviewedFarmer, evidence.phoneNumber, (language) => buildEvidenceReviewNotice({
        farmer: reviewedFarmer,
        evidence,
        decision,
        language,
        notes: review.notes,
        certificateSuspended: !!suspendedCertificate,
      }))
    : { mode: 'skipped' as const };

  await repository.recordSystemAuditEvents([
    createSystemAuditEvent({
      service: serviceName,
      action: `evidence.review.${decision}`,
      actorType: 'auditor',
      actorId: auditActorId(req),
      entityType: 'evidence',
      entityId: evidence.id,
      severity: decision === 'approved' ? 'info' : 'warning',
      message: `Evidence ${evidence.id} review decision recorded as ${decision}.`,
      metadata: {
        farmerId: evidence.farmerId,
        verificationStatus: evidence.verificationStatus,
        reviewedBy,
        appliedToCompliance: shouldApplyApprovedEvidence,
        correctedPriorApproval: shouldReverseApprovedEvidence,
        farmerNotifiedMode: farmerNotified.mode,
      },
    }),
    ...(farmer && (shouldApplyApprovedEvidence || shouldReverseApprovedEvidence)
      ? [
          createSystemAuditEvent({
            service: serviceName,
            action: shouldReverseApprovedEvidence ? 'farmer.compliance.corrected' : 'farmer.compliance.updated',
            actorType: 'system',
            entityType: 'farmer',
            entityId: farmer.id,
            severity: shouldReverseApprovedEvidence ? 'warning' : 'info',
            message: shouldReverseApprovedEvidence
              ? `Farmer ${farmer.id} compliance state corrected after approved evidence was reversed.`
              : `Farmer ${farmer.id} compliance state updated after evidence approval.`,
            metadata: {
              status: farmer.status,
              score: farmer.score,
              daysCollected: farmer.daysCollected,
              evidenceId: evidence.id,
            },
          }),
        ]
      : []),
    ...(suspendedCertificate
      ? [
          createSystemAuditEvent({
            service: serviceName,
            action: 'certificate.suspended',
            actorType: 'system',
            entityType: 'certificate',
            entityId: suspendedCertificate.id,
            severity: 'warning',
            message: `Certificate ${suspendedCertificate.certificateNumber} suspended after evidence correction.`,
            metadata: {
              farmerId: suspendedCertificate.farmerId,
              evidenceId: evidence.id,
              certificateNumber: suspendedCertificate.certificateNumber,
            },
          }),
        ]
      : []),
  ]);

  return res.json({
    evidence,
    farmer,
    suspendedCertificate,
    farmerNotified,
  });
}));

app.get('/api/compliance/farmers/:farmerId/evaluation', requireRole(authConfig, 'viewer'), asyncRoute(async (req, res) => {
  const farmer = await repository.getFarmer(req.params.farmerId);

  if (!farmer) {
    return res.status(404).json({ error: 'Farmer not found.' });
  }

  const evidence = await repository.listEvidence(farmer.id, 500);
  const language = req.query.lang === 'BM' ? 'BM' : 'EN';
  const evaluation = evaluateFarmerCompliance(farmer, evidence, { applyEvidence: false, language });

  res.json({
    farmerId: farmer.id,
    evaluation,
  });
}));

app.get('/api/certificates', requireRole(authConfig, 'viewer'), asyncRoute(async (req, res) => {
  const farmerId = typeof req.query.farmerId === 'string' ? req.query.farmerId : undefined;
  const limit = parseListLimit(req.query.limit, 50, maxListLimit);

  res.json({
    limit,
    certificates: await repository.listCertificates(farmerId, limit),
  });
}));

app.get('/api/certificates/verify/:verificationHash', certificateVerifyRateLimit, asyncRoute(async (req, res) => {
  const verificationHash = sanitizeText(req.params.verificationHash, 128).toLowerCase();

  if (!/^[a-f0-9]{64}$/.test(verificationHash)) {
    await repository.recordSystemAuditEvents([
      createSystemAuditEvent({
        service: serviceName,
        action: 'certificate.verify.invalid_request',
        actorType: 'api',
        entityType: 'certificate',
        severity: 'warning',
        message: 'Certificate verification rejected because the hash format was invalid.',
        metadata: {
          hashLength: verificationHash.length,
        },
      }),
    ]);

    return res.status(400).json({
      valid: false,
      checkedAt: new Date().toISOString(),
      reason: 'verificationHash must be a 64-character SHA-256 hex string.',
    });
  }

  const certificate = await repository.getCertificateByVerificationHash(verificationHash);
  const farmer = certificate ? await repository.getFarmer(certificate.farmerId) : undefined;
  const verification = buildCertificateVerificationResult(certificate, farmer);

  await repository.recordSystemAuditEvents([
    createSystemAuditEvent({
      service: serviceName,
      action: verification.valid ? 'certificate.verify.valid' : 'certificate.verify.invalid',
      actorType: 'api',
      entityType: 'certificate',
      entityId: certificate?.id,
      severity: verification.valid ? 'info' : 'warning',
      message: verification.valid
        ? `Certificate ${certificate?.certificateNumber} verified successfully.`
        : 'Certificate verification did not produce a valid result.',
      metadata: {
        certificateNumber: certificate?.certificateNumber,
        reason: verification.reason,
      },
    }),
  ]);

  return res.status(verification.valid ? 200 : 404).json(verification);
}));

app.post('/api/certificates/issue', requireRole(authConfig, 'auditor'), asyncRoute(async (req: SmartEsgpRequest, res) => {
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Request body must include farmerId.' });
  }

  const body = req.body as Record<string, unknown>;
  const farmerId = sanitizeText(body.farmerId, 80);
  const issuedBy = sanitizeText(body.issuedBy, 120) || req.smartEsgpActorId || 'FELDA Certification Officer';
  const farmer = farmerId ? await repository.getFarmer(farmerId) : undefined;

  if (!farmer) {
    return res.status(404).json({ error: 'Farmer not found.' });
  }

  const evidence = await repository.listEvidence(farmer.id, 500);
  const evaluation = evaluateFarmerCompliance(farmer, evidence, { applyEvidence: false });
  const isEligible = evaluation.certificationEligible || farmer.status === FarmerStatus.CERTIFIED;

  if (!isEligible) {
    await repository.recordSystemAuditEvents([
      createSystemAuditEvent({
        service: serviceName,
        action: 'certificate.issue.rejected',
        actorType: 'auditor',
        actorId: auditActorId(req),
        entityType: 'farmer',
        entityId: farmer.id,
        severity: 'warning',
        message: `Certificate issuance rejected for farmer ${farmer.id}; compliance rules are not eligible.`,
        metadata: {
          status: farmer.status,
          score: farmer.score,
          daysCollected: farmer.daysCollected,
          issuedBy,
        },
      }),
    ]);

    return res.status(409).json({
      error: 'Farmer is not eligible for certificate issuance.',
      evaluation,
    });
  }

  const existingCertificate = await repository.getActiveCertificateForFarmer(farmer.id);
  if (existingCertificate) {
    await repository.recordSystemAuditEvents([
      createSystemAuditEvent({
        service: serviceName,
        action: 'certificate.issue.reused',
        actorType: 'auditor',
        actorId: auditActorId(req),
        entityType: 'certificate',
        entityId: existingCertificate.id,
        severity: 'info',
        message: `Existing active certificate ${existingCertificate.certificateNumber} returned for farmer ${farmer.id}.`,
        metadata: {
          farmerId: farmer.id,
          certificateNumber: existingCertificate.certificateNumber,
          issuedBy,
        },
      }),
    ]);

    return res.json({
      certificate: existingCertificate,
      farmer,
      evaluation,
      reused: true,
    });
  }

  const certificate = await repository.upsertCertificate(createCertificateRecord(farmer, issuedBy));
  const updatedFarmer = await repository.upsertFarmer({
    ...farmer,
    status: FarmerStatus.CERTIFIED,
    mspoCertId: certificate.certificateNumber,
    auditLogs: [
      {
        timestamp: certificate.issuedAt.replace('T', ' ').substring(0, 16),
        action: 'Certificate Issued',
        user: issuedBy,
        details: `Certificate ${certificate.certificateNumber} issued with verification hash ${certificate.verificationHash.slice(0, 16)}.`,
      },
      ...farmer.auditLogs,
    ],
  });

  const farmerNotified = await notifyLinkedFarmer(updatedFarmer, undefined, (language) =>
    buildCertificateIssuedNotice(updatedFarmer, certificate, language)
  );

  await repository.recordSystemAuditEvents([
    createSystemAuditEvent({
      service: serviceName,
      action: 'certificate.issued',
      actorType: 'auditor',
      actorId: auditActorId(req),
      entityType: 'farmer',
      entityId: farmer.id,
      severity: 'info',
      message: `Certificate ${certificate.certificateNumber} issued for farmer ${farmer.id}.`,
      metadata: {
        certificateId: certificate.id,
        certificateNumber: certificate.certificateNumber,
        verificationHash: certificate.verificationHash.slice(0, 16),
        issuedBy,
        farmerNotifiedMode: farmerNotified.mode,
      },
    }),
  ]);

  return res.status(201).json({
    certificate,
    farmer: updatedFarmer,
    evaluation,
    reused: false,
    farmerNotified,
  });
}));

app.use(createWhatsAppRouter({
  repository,
  authConfig,
  cloudApiConfig: whatsappCloudApiConfig,
  mediaStorageConfig: whatsappMediaStorageConfig,
  verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
  maxMessageLength: MAX_MESSAGE_LENGTH,
  includeWebhookRoutes: dashboardWebhookRoutesEnabled,
  includeManualSendRoute: dashboardManualSendEnabled,
  includeMonitoringRoutes: true,
  webhookRateLimit: whatsappWebhookRateLimit,
  manualSendRateLimit: whatsappManualSendRateLimit,
  maxListLimit,
  serviceName,
  retainRawPayloads: whatsappRawPayloadRetention.retain,
}));

app.patch('/api/whatsapp/sessions/:phoneNumber/identity-conflict', requireRole(authConfig, 'auditor'), asyncRoute(async (req: SmartEsgpRequest, res) => {
  const phoneNumber = req.params.phoneNumber;
  const body = req.body as Record<string, unknown> | undefined;
  const decision = body?.decision;

  if (decision !== 'approve' && decision !== 'reject') {
    return res.status(400).json({ error: 'decision must be "approve" or "reject".' });
  }

  const reviewedBy = typeof body?.reviewedBy === 'string' && body.reviewedBy.trim()
    ? body.reviewedBy.trim().slice(0, 120)
    : 'FELDA Dashboard Auditor';
  const notes = typeof body?.notes === 'string' ? body.notes.trim().slice(0, 500) : undefined;

  const session = await repository.getWhatsAppSession(phoneNumber);
  if (!session?.identityConflict || session.identityConflict.status !== 'open') {
    return res.status(404).json({ error: 'No open identity conflict for this phone number.' });
  }

  const conflict = session.identityConflict;
  const now = new Date().toISOString();
  const resolvedConflict = {
    ...conflict,
    status: 'resolved' as const,
    resolution: decision === 'approve' ? 'approved' as const : 'rejected' as const,
    resolvedAt: now,
    resolvedBy: reviewedBy,
    resolutionNotes: notes,
  };

  let updatedFarmer: Farmer | undefined;
  let transferredFromSession: typeof session | undefined;
  let updatedSession: typeof session;

  if (decision === 'reject') {
    updatedSession = {
      ...session,
      identityConflict: resolvedConflict,
      identityStatus: session.farmerId ? 'linked' : 'unlinked',
      step: session.farmerId ? session.step : 'mpob',
      updatedAt: now,
    };
  } else {
    const requestedFarmerId = conflict.requestedFarmerId;
    const farmer = requestedFarmerId ? await repository.getFarmer(requestedFarmerId) : undefined;

    if (!requestedFarmerId || !farmer) {
      return res.status(400).json({ error: 'The requested farmer for this conflict no longer exists.' });
    }

    // The farmer may have been linked to another phone after this request was
    // raised; approving now would leave two phones submitting for one farmer.
    const currentHolder = (await repository.listWhatsAppSessions()).find((other) =>
      other.phoneNumber !== phoneNumber && other.farmerId === requestedFarmerId
    );
    if (
      currentHolder
      && !(conflict.type === 'farmer_linked_to_different_phone' && currentHolder.phoneNumber === conflict.existingPhoneNumber)
    ) {
      return res.status(409).json({
        error: 'This farmer is already linked to another WhatsApp number. Reject this request, or resolve that link first.',
      });
    }

    if (conflict.type === 'farmer_linked_to_different_phone' && conflict.existingPhoneNumber) {
      const otherSession = await repository.getWhatsAppSession(conflict.existingPhoneNumber);
      if (otherSession?.farmerId === requestedFarmerId) {
        transferredFromSession = {
          ...otherSession,
          farmerId: undefined,
          identityStatus: 'unlinked',
          step: 'mpob',
          updatedAt: now,
        };
      }
    }

    updatedSession = {
      ...session,
      farmerId: requestedFarmerId,
      identityStatus: 'linked',
      step: session.step === 'mpob' ? 'awaiting_location' : session.step,
      identityConflict: resolvedConflict,
      updatedAt: now,
    };

    updatedFarmer = {
      ...farmer,
      whatsappLanguage: session.language || farmer.whatsappLanguage || 'BM',
      pdpaConsent: farmer.pdpaConsent || !!session.consentedAt,
      onboardingStep: 'completed',
      auditLogs: [
        {
          timestamp: now.replace('T', ' ').substring(0, 16),
          action: conflict.type === 'first_link_review' ? 'WhatsApp Link Approved' : 'WhatsApp Identity Conflict Approved',
          user: reviewedBy,
          details: `Linked phone ${maskPhoneNumber(phoneNumber)} to this farmer after FELDA identity review.${
            transferredFromSession ? ` Previous phone ${maskPhoneNumber(transferredFromSession.phoneNumber)} was unlinked.` : ''
          }${notes ? ` Notes: ${notes}` : ''}`,
        },
        ...farmer.auditLogs,
      ],
    };
  }

  await repository.upsertWhatsAppSession(updatedSession);
  if (transferredFromSession) {
    await repository.upsertWhatsAppSession(transferredFromSession);
  }
  if (updatedFarmer) {
    await repository.upsertFarmer(updatedFarmer);
    // PDPA consent was captured before the link existed; attach it to the farmer now.
    const linkedConsentRecords = await repository.linkConsentRecordsToFarmer(phoneNumber, updatedFarmer.id);
    await repository.recordSystemAuditEvents(linkedConsentRecords.map((record) => createSystemAuditEvent({
      service: serviceName,
      action: 'consent.linked',
      actorType: 'auditor',
      actorId: auditActorId(req),
      entityType: 'farmer',
      entityId: record.farmerId,
      severity: 'info',
      message: `PDPA consent ${record.consentVersion} linked to farmer ${record.farmerId}.`,
      metadata: {
        consentId: record.id,
        language: record.language,
      },
    })));
  }

  // The farmer never sees the dashboard, so approving/rejecting silently on
  // our side leaves their conversation stuck with no indication anything
  // happened. Proactively message them the outcome and next step.
  const notifyLanguage = updatedSession.language || 'BM';
  const notifyText = decision === 'approve' && updatedFarmer
    ? notifyLanguage === 'EN'
      ? `MPOB licence ${updatedFarmer.mpobLicence} verified by FELDA and linked to ${updatedFarmer.name}. Please share your live farm location to continue evidence collection.`
      : `Lesen MPOB ${updatedFarmer.mpobLicence} disahkan oleh FELDA dan dipautkan kepada ${updatedFarmer.name}. Sila kongsi lokasi kebun semasa untuk teruskan pengumpulan bukti.`
    : notifyLanguage === 'EN'
      ? 'We could not verify that MPOB licence number. Please check and send the correct 6-digit number again.'
      : 'Kami tidak dapat mengesahkan nombor lesen MPOB tersebut. Sila semak dan hantar semula nombor 6 digit yang betul.';

  const notifyResult = await sendWhatsAppTextMessage(whatsappCloudApiConfig, {
    toPhone: phoneNumber,
    text: notifyText,
  });

  await repository.recordSystemAuditEvents([
    createSystemAuditEvent({
      service: serviceName,
      action: 'whatsapp.identity.conflict_resolved',
      actorType: 'auditor',
      actorId: auditActorId(req),
      entityType: 'whatsapp_session',
      entityId: phoneNumber,
      severity: notifyResult.mode === 'failed' ? 'warning' : 'info',
      message: `WhatsApp identity conflict ${decision === 'approve' ? 'approved' : 'rejected'} by FELDA auditor.`,
      metadata: {
        decision,
        reviewedBy,
        conflictType: conflict.type,
        requestedFarmerId: conflict.requestedFarmerId,
        phone: maskPhoneNumber(phoneNumber),
        transferredFromPhone: transferredFromSession ? maskPhoneNumber(transferredFromSession.phoneNumber) : undefined,
        farmerNotifiedMode: notifyResult.mode,
      },
    }),
  ]);

  return res.json({
    session: updatedSession,
    farmer: updatedFarmer,
    farmerNotified: {
      mode: notifyResult.mode,
    },
  });
}));

app.post('/api/chat', chatRateLimit, requireRole(authConfig, 'viewer'), asyncRoute(async (req, res) => {
  const parsed = validateChatRequest(req.body);

  if (!parsed.value) {
    return res.status(400).json({ error: parsed.error || 'Invalid request.' });
  }

  const { message, farmerId, history } = parsed.value;
  const farmer = await repository.getFarmer(farmerId);
  if (!farmer) {
    return res.status(400).json({ error: 'A valid farmerId is required.' });
  }

  const isBM = (farmer.whatsappLanguage || 'BM') === 'BM';
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey && !OLLAMA_MODEL) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    return res.json({
      text: simulatedReply(message, farmer),
      mode: 'simulation',
      note: 'This is a simulation because ANTHROPIC_API_KEY or OLLAMA_MODEL is not configured.',
    });
  }

  const conversationMessages = [
    ...history.map((item) => ({
      role: item.sender === 'farmer' ? 'user' : 'assistant',
      content: item.text,
    })),
    {
      role: 'user',
      content: message,
    },
  ];

  if (apiKey) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 400,
          system: buildSystemPrompt(farmer),
          messages: conversationMessages,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error('Claude API error response:', errText.slice(0, 1000));
        throw new Error(`Claude API returned status ${response.status}`);
      }

      const data = await response.json();
      const reply = data.content?.[0]?.text || 'Faham. Sila hantar foto atau lokasi kebun anda.';

      return res.json({
        text: reply,
        mode: 'live',
      });
    } catch (error) {
      const messageText = error instanceof Error ? error.message : 'Unknown Claude API error';
      console.error('Claude API fetch exception:', messageText);
      return res.status(502).json({
        error: 'Failed to fetch response from Claude AI',
        mode: 'error_fallback',
        text: isBM
          ? 'Maaf Pak, sistem terputus seketika dengan Claude AI. Sila cuba lagi atau hubungi pegawai koperasi anda.'
          : 'Sorry Pak, the connection with Claude AI timed out. Please try again or contact your co-op representative.',
      });
    }
  }

  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        messages: [
          { role: 'system', content: buildSystemPrompt(farmer) },
          ...conversationMessages,
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Ollama API error response:', errText.slice(0, 1000));
      throw new Error(`Ollama API returned status ${response.status}`);
    }

    const data = await response.json();
    const reply = data.message?.content || 'Faham. Sila hantar foto atau lokasi kebun anda.';

    return res.json({
      text: reply,
      mode: 'live',
    });
  } catch (error) {
    const messageText = error instanceof Error ? error.message : 'Unknown Ollama API error';
    console.error('Ollama API fetch exception:', messageText);
    return res.status(502).json({
      error: 'Failed to fetch response from Ollama',
      mode: 'error_fallback',
      text: isBM
        ? 'Maaf Pak, sistem terputus seketika dengan pelayan AI. Sila cuba lagi atau hubungi pegawai koperasi anda.'
        : 'Sorry Pak, the connection with the local AI server timed out. Please try again or contact your co-op representative.',
    });
  }
}));

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'API route not found.' });
});

app.use(createApiErrorHandler(serviceName));

if (!isProduction) {
  const startVite = async () => {
    const vite = await createViteServer({
      server: {
        hmr: false,
        middlewareMode: true,
        ws: false as false,
        watch: {
          ignored: ['**/output/**', '**/dist/**', '**/.smart-esgp-data/**'],
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);

    startHttpService({
      app,
      port: PORT,
      host: HOST,
      serviceLabel: 'Smart-ESGP dashboard development server',
      repository,
      onListening: () => {
        console.log(`Development full-stack server running on http://localhost:${PORT}`);
      },
    });
  };
  startVite();
} else {
  const distPath = path.join(process.cwd(), 'dist');
  const clientEntryPath = path.join(distPath, 'index.html');
  const notFoundPath = path.join(distPath, '404.html');
  const knownClientPaths = new Set(['/', '/index.html']);

  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    if (knownClientPaths.has(req.path)) {
      res.sendFile(clientEntryPath);
      return;
    }

    res.status(404).sendFile(notFoundPath);
  });

  startHttpService({
    app,
    port: PORT,
    host: HOST,
    serviceLabel: 'Smart-ESGP dashboard server',
    repository,
    onListening: () => {
      console.log(`Production full-stack server running on port ${PORT}`);
    },
  });
}
