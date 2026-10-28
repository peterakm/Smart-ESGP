import type { WhatsAppMonitoringEvent } from '../contracts/whatsapp';

export const needsWhatsAppGpsReview = (event: WhatsAppMonitoringEvent) => {
 const status = event.reply.evidence?.locationValidation?.status;
 return status === 'outside_plot' || status === 'unknown_plot' || status === 'missing_location';
};

export const getWhatsAppGpsReviewEvents = (
 events: WhatsAppMonitoringEvent[],
 limit?: number
) => {
 const matches = events.filter(needsWhatsAppGpsReview);
 return typeof limit === 'number' ? matches.slice(0, Math.max(0, Math.trunc(limit))) : matches;
};

export const getWhatsAppFailedSendEvents = (
 events: WhatsAppMonitoringEvent[],
 limit?: number
) => {
 const matches = events.filter((event) => event.outbound?.mode === 'failed');
 return typeof limit === 'number' ? matches.slice(0, Math.max(0, Math.trunc(limit))) : matches;
};
