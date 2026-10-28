import type { WhatsAppMonitoringEvent, WhatsAppMonitoringSendResult, WhatsAppSendResult, WhatsAppWebhookEvent } from '../contracts/whatsapp';

export const toWhatsAppMonitoringSendResult = (sendResult: WhatsAppSendResult): WhatsAppMonitoringSendResult => ({
 mode: sendResult.mode,
 providerMessageId: sendResult.providerMessageId,
 statusCode: sendResult.statusCode,
 error: sendResult.error,
 sentAt: sendResult.sentAt,
});

export const toWhatsAppMonitoringEvent = (event: WhatsAppWebhookEvent): WhatsAppMonitoringEvent => {
 const { raw: _raw, ...inbound } = event.inbound;
 const { toPhone: _toPhone, ...reply } = event.reply;

 return {
 inbound,
 reply,
 outbound: event.outbound ? toWhatsAppMonitoringSendResult(event.outbound) : undefined,
 session: event.session
 ? {
 step: event.session.step,
 language: event.session.language,
 farmerId: event.session.farmerId,
 identityStatus: event.session.identityStatus,
 identityConflict: event.session.identityConflict,
 updatedAt: event.session.updatedAt,
 }
 : undefined,
 storedAt: event.storedAt,
 };
};
