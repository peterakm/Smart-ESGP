import assert from 'node:assert/strict';
import type { WhatsAppInboundMessage } from '../src/contracts/whatsapp';
import { initialFarmers } from '../src/data/mockFarmers';
import { handleWhatsAppInboundMessages, parseWhatsAppCloudWebhookPayload } from '../src/services/whatsappWebhook';

const phoneNumber = '60129998877';
const farmer = initialFarmers[0];
const farmersById = new Map(initialFarmers.map((item) => [item.id, item]));
const sessionsByPhone = new Map();

const inbound = (
  providerMessageId: string,
  kind: WhatsAppInboundMessage['kind'],
  overrides: Partial<WhatsAppInboundMessage> = {}
): WhatsAppInboundMessage => ({
  provider: 'whatsapp-cloud-api',
  providerMessageId,
  fromPhone: phoneNumber,
  receivedAt: new Date('2026-07-24T00:00:00.000Z').toISOString(),
  kind,
  raw: {},
  ...overrides,
});

const processOne = (message: WhatsAppInboundMessage) => {
  return handleWhatsAppInboundMessages([message], farmersById, sessionsByPhone);
};

processOne(inbound('activity-smoke-1', 'text', { text: 'BM' }));
processOne(inbound('activity-smoke-2', 'text', { text: 'SAYA SETUJU' }));
processOne(inbound('activity-smoke-3', 'text', { text: farmer.mpobLicence }));
// A licence alone only raises a FELDA review request; simulate the officer's approval.
sessionsByPhone.set(phoneNumber, {
  ...sessionsByPhone.get(phoneNumber),
  farmerId: farmer.id,
  identityStatus: 'linked',
  identityConflict: undefined,
  step: 'awaiting_location',
});

const activityResult = processOne(inbound('activity-smoke-4', 'text', { text: 'Hari ini saya tuai buah.' }));
const pendingActivitySession = sessionsByPhone.get(phoneNumber);
assert.equal(pendingActivitySession?.pendingActivity, 'harvest');
assert.equal(activityResult.evidenceRecords.length, 0);

processOne(inbound('activity-smoke-5', 'location', { location: { lat: 2.035, lng: 103.325 } }));
const harvestResult = processOne(inbound('activity-smoke-6', 'image', {
  mediaId: 'media-harvest',
  mimeType: 'image/jpeg',
}));

assert.equal(harvestResult.evidenceRecords.length, 1);
assert.equal(harvestResult.evidenceRecords[0]?.activityType, 'harvest');
assert.equal(sessionsByPhone.get(phoneNumber)?.pendingActivity, undefined);

processOne(inbound('activity-smoke-7', 'location', { location: { lat: 2.035, lng: 103.325 } }));
const captionPayload = parseWhatsAppCloudWebhookPayload({
  entry: [
    {
      changes: [
        {
          value: {
            messages: [
              {
                from: phoneNumber,
                id: 'activity-smoke-8',
                timestamp: '1784789000',
                type: 'image',
                image: {
                  id: 'media-spray',
                  mime_type: 'image/jpeg',
                  caption: 'Sembur racun rumpai.',
                },
              },
            ],
          },
        },
      ],
    },
  ],
});

assert.equal(captionPayload.ignoredCount, 0);
assert.equal(captionPayload.inboundMessages[0]?.text, 'Sembur racun rumpai.');

const sprayResult = processOne(captionPayload.inboundMessages[0]);
assert.equal(sprayResult.evidenceRecords.length, 1);
assert.equal(sprayResult.evidenceRecords[0]?.activityType, 'spray');

// An uncaptioned photo with no stated activity is held, not filed as a default "inspect".
const askActivityResult = processOne(inbound('activity-smoke-9', 'location', { location: { lat: 2.035, lng: 103.325 } }));
assert.match(askActivityResult.replies[0]?.text ?? '', /tuai, cantas, sembur, merumput/);

const heldPhotoResult = processOne(inbound('activity-smoke-10', 'image', {
  mediaId: 'media-held',
  mimeType: 'image/jpeg',
}));
assert.equal(heldPhotoResult.evidenceRecords.length, 0);
assert.equal(sessionsByPhone.get(phoneNumber)?.pendingPhoto?.mediaId, 'media-held');
assert.equal(sessionsByPhone.get(phoneNumber)?.step, 'awaiting_photo');

const unclearReplyResult = processOne(inbound('activity-smoke-11', 'text', { text: 'ok' }));
assert.equal(unclearReplyResult.evidenceRecords.length, 0);
assert.equal(sessionsByPhone.get(phoneNumber)?.pendingPhoto?.mediaId, 'media-held');

const namedActivityResult = processOne(inbound('activity-smoke-12', 'text', { text: 'cantas' }));
assert.equal(namedActivityResult.evidenceRecords.length, 1);
assert.equal(namedActivityResult.evidenceRecords[0]?.activityType, 'prune');
assert.equal(namedActivityResult.evidenceRecords[0]?.mediaId, 'media-held');
assert.equal(namedActivityResult.evidenceRecords[0]?.providerMessageId, 'activity-smoke-10');
assert.equal(namedActivityResult.evidenceRecords[0]?.intake?.activitySource, 'pending_session');
assert.equal(sessionsByPhone.get(phoneNumber)?.pendingPhoto, undefined);
assert.equal(sessionsByPhone.get(phoneNumber)?.step, 'active');

// After a check-in, non-rating small talk re-asks the survey instead of jumping to the location prompt.
assert.equal(sessionsByPhone.get(phoneNumber)?.pendingSurvey, true);
for (const [index, reply] of ['ok', '6'].entries()) {
  const reaskResult = processOne(inbound(`activity-smoke-survey-${index}`, 'text', { text: reply }));
  assert.equal(reaskResult.surveyResponses.length, 0);
  assert.match(reaskResult.replies[0]?.text ?? '', /1 hingga 5, atau balas LANGKAU/);
  assert.equal(sessionsByPhone.get(phoneNumber)?.pendingSurvey, true);
}

const ratingResult = processOne(inbound('activity-smoke-survey-2', 'text', { text: '4.' }));
assert.equal(ratingResult.surveyResponses[0]?.rating, 4);
assert.equal(sessionsByPhone.get(phoneNumber)?.pendingSurvey, false);

const completeAnotherCheckIn = (prefix: string) => {
  processOne(inbound(`${prefix}-location`, 'location', { location: { lat: 2.035, lng: 103.325 } }));
  processOne(inbound(`${prefix}-photo`, 'image', { text: 'tuai', mediaId: `${prefix}-media`, mimeType: 'image/jpeg' }));
  assert.equal(sessionsByPhone.get(phoneNumber)?.pendingSurvey, true);
};

completeAnotherCheckIn('activity-smoke-skip');
const skipResult = processOne(inbound('activity-smoke-skip-reply', 'text', { text: 'langkau' }));
assert.equal(skipResult.surveyResponses.length, 0);
assert.equal(sessionsByPhone.get(phoneNumber)?.pendingSurvey, false);

// An activity word still starts the next check-in rather than being trapped by the survey.
completeAnotherCheckIn('activity-smoke-next');
const nextActivityResult = processOne(inbound('activity-smoke-next-activity', 'text', { text: 'sembur' }));
assert.equal(sessionsByPhone.get(phoneNumber)?.pendingSurvey, false);
assert.equal(sessionsByPhone.get(phoneNumber)?.pendingActivity, 'spray');
assert.equal(nextActivityResult.surveyResponses.length, 0);

console.log(JSON.stringify({
  ok: true,
  pendingActivity: 'harvest',
  firstEvidenceActivity: harvestResult.evidenceRecords[0]?.activityType,
  captionActivity: sprayResult.evidenceRecords[0]?.activityType,
  heldPhotoActivity: namedActivityResult.evidenceRecords[0]?.activityType,
}, null, 2));
