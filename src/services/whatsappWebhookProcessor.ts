import type { WhatsAppDeliveryStatus, WhatsAppFarmerSession, WhatsAppInboundMessage } from '../contracts/whatsapp';
import type { SmartEsgpRepository } from '../server/smartEsgpRepository';
import { createSystemAuditEvent, maskPhoneNumber } from '../server/systemAudit';
import { resolveWhatsAppClaimTtlMs } from '../server/whatsappClaimLease';
import { sendChatbotReply, type WhatsAppCloudApiConfig } from './whatsappCloudApi';
import { handleWhatsAppInboundMessages, parseWhatsAppCloudWebhookPayload } from './whatsappWebhook';
import { ingestWhatsAppMedia, type WhatsAppMediaStorageConfig } from './whatsappMediaStorage';

export interface WhatsAppWebhookProcessorOptions {
 repository: SmartEsgpRepository;
 cloudApiConfig: WhatsAppCloudApiConfig;
 mediaStorageConfig: WhatsAppMediaStorageConfig;
 serviceName: 'dashboard' | 'whatsapp';
 retainRawPayloads: boolean;
 claimTtlMs?: number;
}

export interface WhatsAppWebhookProcessorResult {
 accepted: boolean;
 inboundCount: number;
 ignoredCount: number;
 deliveryStatusCount: number;
 claimedCount: number;
 processedCount: number;
 duplicateCount: number;
 replyCount: number;
 evidenceCount: number;
 consentCount: number;
 outbound: {
 sent: number;
 dryRun: number;
 failed: number;
 };
}

type ChatbotSendResult = Awaited<ReturnType<typeof sendChatbotReply>>;

const summarizeOutboundSends = (sendResults: ChatbotSendResult[]) => ({
 sent: sendResults.filter((sendResult) => sendResult.mode === 'sent').length,
 dryRun: sendResults.filter((sendResult) => sendResult.mode === 'dry_run').length,
 failed: sendResults.filter((sendResult) => sendResult.mode === 'failed').length,
});

const deliveryStatusSeverity = (status: WhatsAppDeliveryStatus) => {
 return status.status === 'failed' ? 'error' : 'info';
};

const deliveryStatusMessage = (status: WhatsAppDeliveryStatus) => {
 const suffix = status.errors?.[0]?.message || status.errors?.[0]?.title;
 return suffix
 ? `WhatsApp delivery status ${status.status}: ${suffix}`
 : `WhatsApp delivery status ${status.status} received.`;
};

const deliveryStatusErrorSummary = (status: WhatsAppDeliveryStatus) => {
 if (!status.errors?.length) return undefined;

 return status.errors
 .map((error) => [error.code, error.title, error.message].filter(Boolean).join(': '))
 .filter(Boolean)
 .join(' | ')
 .slice(0, 500);
};

const stripRawPayloads = <TEvent extends { inbound: WhatsAppInboundMessage }>(events: TEvent[]): TEvent[] => {
 return events.map((event) => ({
 ...event,
 inbound: {
 ...event.inbound,
 raw: undefined,
 },
 }));
};

const classifyInboundMessages = (
 inboundMessages: WhatsAppInboundMessage[],
 claimedProviderMessageIds: Set<string>
) => {
 const seenProviderMessageIds = new Set<string>();
 const duplicateMessages: WhatsAppInboundMessage[] = [];
 const freshMessages: WhatsAppInboundMessage[] = [];

 for (const message of inboundMessages) {
 const duplicate = !claimedProviderMessageIds.has(message.providerMessageId)
 || seenProviderMessageIds.has(message.providerMessageId);
 seenProviderMessageIds.add(message.providerMessageId);

 if (duplicate) {
 duplicateMessages.push(message);
 } else {
 freshMessages.push(message);
 }
 }

 return {
 duplicateMessages,
 freshMessages,
 };
};

export const processWhatsAppWebhook = async (
 body: unknown,
 options: WhatsAppWebhookProcessorOptions
): Promise<WhatsAppWebhookProcessorResult> => {
 const parsedWebhook = parseWhatsAppCloudWebhookPayload(body);
 const inboundMessages = parsedWebhook.inboundMessages;
 const deliveryStatuses = parsedWebhook.deliveryStatuses;
 const claimedProviderMessageIds = await options.repository.claimWhatsAppProviderMessageIds(
 inboundMessages.map((message) => message.providerMessageId),
 { claimTtlMs: options.claimTtlMs ?? resolveWhatsAppClaimTtlMs() }
 );
 const { duplicateMessages, freshMessages } = classifyInboundMessages(inboundMessages, claimedProviderMessageIds);

 await options.repository.recordWhatsAppProviderMessageDuplicates(
 duplicateMessages.map((message) => message.providerMessageId)
 );

 const result = handleWhatsAppInboundMessages(
 freshMessages,
 await options.repository.getFarmerIndex(),
 await options.repository.getWhatsAppSessionIndex()
 );

 // Persist everything the reply is about to confirm as saved *before*
 // sending that reply. Sending first meant a crash or restart between the
 // two could leave a farmer holding a "recorded" confirmation for a session
 // update or evidence photo that was never actually written -- and since
 // the provider message ID is already claimed by this point, no future
 // webhook retry could ever recover it. Persisting first means a failure in
 // this window instead just leaves the farmer without a reply, which is
 // recoverable (they can resend) rather than silent, permanent data loss.
 const evidenceRecords = await Promise.all(
 result.evidenceRecords.map(async (record) => {
 if (!record.mediaId) {
 return record;
 }

 const mediaStorage = await ingestWhatsAppMedia(options.mediaStorageConfig, {
 mediaId: record.mediaId,
 farmerId: record.farmerId,
 providerMessageId: record.providerMessageId,
 fallbackMimeType: record.mimeType,
 });

 return {
 ...record,
 mediaStorage,
 };
 })
 );

 await Promise.all(result.sessions.map((session) => options.repository.upsertWhatsAppSession(session)));
 await Promise.all(result.farmerUpdates.map((farmer) => options.repository.upsertFarmer(farmer)));
 await options.repository.recordConsentRecords(result.consentRecords);
 const linkedConsentRecords = (
 await Promise.all(result.sessions.map((session) =>
 session.farmerId
 ? options.repository.linkConsentRecordsToFarmer(session.phoneNumber, session.farmerId)
 : []
 ))
 ).flat();
 await options.repository.recordEvidence(evidenceRecords);

 const sendResults = await Promise.all(
 result.replies.map((reply) => sendChatbotReply(options.cloudApiConfig, reply))
 );

 const webhookEventsWithOutbound = result.events.map((event, index) => ({
 ...event,
 outbound: sendResults[index],
 }));
 const webhookEvents = options.retainRawPayloads
 ? webhookEventsWithOutbound
 : stripRawPayloads(webhookEventsWithOutbound);

 await options.repository.recordWhatsAppEvents(webhookEvents);
 await options.repository.recordSystemAuditEvents([
 createSystemAuditEvent({
 service: options.serviceName,
 action: 'whatsapp.webhook.processed',
 actorType: 'system',
 entityType: 'service',
 severity: sendResults.some((sendResult) => sendResult.mode === 'failed') ? 'warning' : 'info',
 message: `Processed ${result.inboundCount} valid WhatsApp inbound message(s).`,
 metadata: {
 inboundCount: inboundMessages.length,
 ignoredCount: parsedWebhook.ignoredCount,
 claimedCount: claimedProviderMessageIds.size,
 processedCount: result.inboundCount,
 duplicateCount: duplicateMessages.length,
 replyCount: result.replies.length,
 evidenceCount: evidenceRecords.length,
 consentCount: result.consentRecords.length,
 surveyCount: result.surveyResponses.length,
 deliveryStatusCount: deliveryStatuses.length,
 rawPayloadsRetained: options.retainRawPayloads,
 failedSends: sendResults.filter((sendResult) => sendResult.mode === 'failed').length,
 dryRunSends: sendResults.filter((sendResult) => sendResult.mode === 'dry_run').length,
 },
 }),
 ...duplicateMessages.map((message) => createSystemAuditEvent({
 service: options.serviceName,
 action: 'whatsapp.webhook.duplicate_ignored',
 actorType: 'system',
 actorId: 'smart-esgp-whatsapp-bot',
 entityType: 'whatsapp_message',
 entityId: message.providerMessageId,
 severity: 'info',
 message: 'Duplicate WhatsApp webhook message ignored using provider message ID idempotency.',
 metadata: {
 fromPhone: maskPhoneNumber(message.fromPhone),
 kind: message.kind,
 },
 })),
 ...result.events
 .filter((event): event is typeof event & { session: WhatsAppFarmerSession } =>
 event.session?.identityStatus === 'conflict' && !!event.session.identityConflict
 )
 .map((event) => createSystemAuditEvent({
 service: options.serviceName,
 action: 'whatsapp.identity.conflict',
 actorType: 'farmer',
 actorId: maskPhoneNumber(event.session.phoneNumber),
 entityType: 'whatsapp_session',
 entityId: event.session.phoneNumber,
 // A first link is routine onboarding; contested links are worth a warning.
 severity: event.session.identityConflict?.type === 'first_link_review' ? 'info' : 'warning',
 message: 'WhatsApp farmer identity link requires FELDA review before onboarding can continue.',
 metadata: {
 conflictType: event.session.identityConflict?.type,
 requestedFarmerId: event.session.identityConflict?.requestedFarmerId,
 existingFarmerId: event.session.identityConflict?.existingFarmerId,
 existingPhone: maskPhoneNumber(event.session.identityConflict?.existingPhoneNumber),
 providerMessageId: event.session.identityConflict?.providerMessageId,
 detectedAt: event.session.identityConflict?.detectedAt,
 },
 })),
 ...result.consentRecords.map((record) => createSystemAuditEvent({
 service: options.serviceName,
 action: 'consent.recorded',
 actorType: 'farmer',
 actorId: maskPhoneNumber(record.phoneNumber),
 entityType: 'farmer',
 entityId: record.farmerId,
 severity: 'info',
 message: `PDPA consent ${record.consentVersion} recorded from WhatsApp.`,
 metadata: {
 language: record.language,
 consentVersion: record.consentVersion,
 providerMessageId: record.providerMessageId,
 },
 })),
 ...result.surveyResponses.map((response) => createSystemAuditEvent({
 service: options.serviceName,
 action: 'whatsapp.survey.response',
 actorType: 'farmer',
 actorId: maskPhoneNumber(response.phoneNumber),
 entityType: 'farmer',
 entityId: response.farmerId,
 severity: 'info',
 message: `Farmer rated their WhatsApp experience ${response.rating}/5.`,
 metadata: {
 rating: response.rating,
 providerMessageId: response.providerMessageId,
 },
 })),
 ...linkedConsentRecords.map((record) => createSystemAuditEvent({
 service: options.serviceName,
 action: 'consent.linked',
 actorType: 'system',
 actorId: 'smart-esgp-whatsapp-bot',
 entityType: 'farmer',
 entityId: record.farmerId,
 severity: 'info',
 message: `PDPA consent ${record.consentVersion} linked to farmer ${record.farmerId}.`,
 metadata: {
 consentId: record.id,
 language: record.language,
 },
 })),
 ...result.events.map((event, index) => createSystemAuditEvent({
 service: options.serviceName,
 action: 'whatsapp.message.received',
 actorType: 'farmer',
 actorId: maskPhoneNumber(event.inbound.fromPhone),
 entityType: 'whatsapp_message',
 entityId: event.inbound.providerMessageId,
 severity: event.reply.requiresHumanReview ? 'warning' : 'info',
 message: `Received WhatsApp ${event.inbound.kind} message and generated ${event.reply.intent} reply.`,
 metadata: {
 kind: event.inbound.kind,
 intent: event.reply.intent,
 farmerId: event.reply.farmerId,
 outboundMode: sendResults[index]?.mode,
 sessionStep: event.session?.step,
 },
 })),
 ...evidenceRecords.map((record) => createSystemAuditEvent({
 service: options.serviceName,
 action: 'evidence.collected',
 actorType: 'farmer',
 actorId: maskPhoneNumber(record.phoneNumber),
 entityType: 'evidence',
 entityId: record.id,
 severity: record.mediaStorage?.mode === 'failed' || record.verificationStatus === 'needs_review' ? 'warning' : 'info',
 message: `WhatsApp ${record.activityType} evidence collected for FELDA review.`,
 metadata: {
 farmerId: record.farmerId,
 mediaMode: record.mediaStorage?.mode,
 verificationStatus: record.verificationStatus,
 reviewStatus: record.review?.status,
 hasLocation: !!record.location,
 intakeChannel: record.intake?.channel,
 intakeActivitySource: record.intake?.activitySource,
 intakeHasMedia: record.intake?.completeness.hasMedia,
 intakeHasConsent: record.intake?.completeness.hasConsent,
 },
 })),
 ...deliveryStatuses.map((status) => createSystemAuditEvent({
 service: options.serviceName,
 action: 'whatsapp.delivery.status',
 actorType: 'system',
 actorId: 'meta-whatsapp-cloud-api',
 entityType: 'whatsapp_message',
 entityId: status.providerMessageId,
 severity: deliveryStatusSeverity(status),
 message: deliveryStatusMessage(status),
 metadata: {
 status: status.status,
 recipientPhone: status.recipientPhone ? maskPhoneNumber(status.recipientPhone) : undefined,
 conversationId: status.conversationId,
 pricingCategory: status.pricingCategory,
 updatedAt: status.updatedAt,
 errorSummary: deliveryStatusErrorSummary(status),
 },
 })),
 ]);

 return {
 accepted: result.accepted,
 inboundCount: inboundMessages.length,
 ignoredCount: parsedWebhook.ignoredCount,
 deliveryStatusCount: deliveryStatuses.length,
 claimedCount: claimedProviderMessageIds.size,
 processedCount: result.inboundCount,
 duplicateCount: duplicateMessages.length,
 replyCount: result.replies.length,
 evidenceCount: evidenceRecords.length,
 consentCount: result.consentRecords.length,
 outbound: summarizeOutboundSends(sendResults),
 };
};
