import type { WhatsAppMonitoringEvent } from '../src/contracts/whatsapp';
import { getFarmerFeedbackEvents } from '../src/utils/whatsappFeedback';
import { getWhatsAppFailedSendEvents, getWhatsAppGpsReviewEvents, needsWhatsAppGpsReview } from '../src/utils/whatsappMonitoring';

const makeEvent = (
  providerMessageId: string,
  farmerId: string | undefined,
  hasFeedback: boolean,
  sessionFarmerId?: string
): WhatsAppMonitoringEvent => ({
  inbound: {
    provider: 'whatsapp-cloud-api',
    providerMessageId,
    fromPhone: '60125550123',
    receivedAt: '2026-07-23T08:00:00.000Z',
    kind: 'image',
  },
  reply: {
    text: 'Feedback text',
    intent: 'daily_checkin',
    farmerId,
    feedback: hasFeedback
      ? {
        language: 'BM',
        status: 'Certified',
        score: 94,
        daysCollected: 92,
        targetEvidenceDays: 90,
        remainingEvidenceDays: 0,
        evidenceReviewStatus: 'pending',
        riskLevel: 'normal',
        nextAction: 'Tunggu semakan FELDA.',
      }
      : undefined,
  },
  outbound: {
    mode: 'dry_run',
    sentAt: '2026-07-23T08:00:01.000Z',
  },
  session: sessionFarmerId
    ? {
      step: 'active',
      farmerId: sessionFarmerId,
      updatedAt: '2026-07-23T08:00:00.000Z',
    }
    : undefined,
  storedAt: '2026-07-23T08:00:01.000Z',
});

const msg4 = makeEvent('msg-4', undefined, true, 'f-1');
const events: WhatsAppMonitoringEvent[] = [
  makeEvent('msg-1', 'f-1', true),
  makeEvent('msg-2', 'f-2', true),
  makeEvent('msg-3', 'f-1', false),
  {
    ...msg4,
    reply: {
      ...msg4.reply,
      evidence: {
        evidenceId: 'ev-msg-4',
        activityType: 'harvest',
        verificationStatus: 'needs_review',
        reviewStatus: 'pending',
        locationValidation: {
          status: 'outside_plot',
          checkedAt: '2026-07-23T08:00:01.000Z',
          distanceMeters: 120,
          reason: 'Outside plot.',
        },
      },
    },
  },
  makeEvent('msg-5', 'f-1', true),
  {
    ...makeEvent('msg-6', 'f-1', true),
    outbound: {
      mode: 'failed',
      statusCode: 503,
      error: 'WhatsApp Cloud API request failed.',
      sentAt: '2026-07-23T08:00:02.000Z',
    },
  },
];

const selected = getFarmerFeedbackEvents(events, 'f-1', 2);
const ids = selected.map((event) => event.inbound.providerMessageId).join(',');

if (ids !== 'msg-1,msg-4') {
  throw new Error(`Expected first two matching feedback events for f-1, got ${ids}`);
}

if (selected.some((event) => !event.reply.feedback)) {
  throw new Error('Expected all selected events to include structured feedback.');
}

if (selected.some((event) => 'toPhone' in event.reply)) {
  throw new Error('Dashboard feedback events should use sanitized replies without toPhone.');
}

const gpsReviewEvents = getWhatsAppGpsReviewEvents(events);
if (gpsReviewEvents.map((event) => event.inbound.providerMessageId).join(',') !== 'msg-4') {
  throw new Error(`Expected msg-4 as the only GPS review event, got ${gpsReviewEvents.map((event) => event.inbound.providerMessageId).join(',')}`);
}

if (!needsWhatsAppGpsReview(gpsReviewEvents[0])) {
  throw new Error('Expected outside-plot monitoring event to require GPS review.');
}

const failedSendEvents = getWhatsAppFailedSendEvents(events);
if (failedSendEvents.map((event) => event.inbound.providerMessageId).join(',') !== 'msg-6') {
  throw new Error(`Expected msg-6 as the only failed-send event, got ${failedSendEvents.map((event) => event.inbound.providerMessageId).join(',')}`);
}

console.log(JSON.stringify({
  ok: true,
  selected: ids,
  count: selected.length,
  gpsReview: gpsReviewEvents.map((event) => event.inbound.providerMessageId).join(','),
  failedSends: failedSendEvents.map((event) => event.inbound.providerMessageId).join(','),
}, null, 2));
