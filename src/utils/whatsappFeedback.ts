import type { WhatsAppMonitoringEvent } from '../contracts/whatsapp';

export const getFarmerFeedbackEvents = (
 events: WhatsAppMonitoringEvent[],
 farmerId: string,
 limit = 5
) => {
 return events
 .filter((event) => (
 !!event.reply.feedback &&
 (event.reply.farmerId === farmerId || event.session?.farmerId === farmerId)
 ))
 .slice(0, limit);
};
