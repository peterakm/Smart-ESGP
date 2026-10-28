import assert from 'node:assert/strict';
import type { WhatsAppInboundMessage } from '../src/contracts/whatsapp';
import { initialFarmers } from '../src/data/mockFarmers';
import { evaluateEvidenceLocation } from '../src/services/geofence';
import { handleWhatsAppInboundMessages } from '../src/services/whatsappWebhook';

const farmer = initialFarmers[0];
const insideLocation = { lat: 2.035, lng: 103.325 };
const outsideLocation = { lat: 2.500, lng: 103.900 };
const checkedAt = '2026-07-24T00:00:00.000Z';

const inside = evaluateEvidenceLocation(insideLocation, farmer.polygonWaypoints, checkedAt);
assert.equal(inside.status, 'inside_plot');
assert.equal(inside.checkedAt, checkedAt);

const outside = evaluateEvidenceLocation(outsideLocation, farmer.polygonWaypoints, checkedAt);
assert.equal(outside.status, 'outside_plot');
assert.equal(typeof outside.distanceMeters, 'number');
assert.ok((outside.distanceMeters || 0) > 1000);

const missing = evaluateEvidenceLocation(undefined, farmer.polygonWaypoints, checkedAt);
assert.equal(missing.status, 'missing_location');

const unknown = evaluateEvidenceLocation(insideLocation, farmer.polygonWaypoints.slice(0, 2), checkedAt);
assert.equal(unknown.status, 'unknown_plot');

const phoneNumber = '60121112222';
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
  receivedAt: checkedAt,
  kind,
  raw: {},
  ...overrides,
});

const processOne = (message: WhatsAppInboundMessage) =>
  handleWhatsAppInboundMessages([message], farmersById, sessionsByPhone);

processOne(inbound('geofence-smoke-1', 'text', { text: 'BM' }));
processOne(inbound('geofence-smoke-2', 'text', { text: 'SAYA SETUJU' }));
processOne(inbound('geofence-smoke-3', 'text', { text: farmer.mpobLicence }));
// A licence alone only raises a FELDA review request; simulate the officer's approval.
sessionsByPhone.set(phoneNumber, {
  ...sessionsByPhone.get(phoneNumber),
  farmerId: farmer.id,
  identityStatus: 'linked',
  identityConflict: undefined,
  step: 'awaiting_location',
});
processOne(inbound('geofence-smoke-4', 'location', { location: insideLocation }));
const insideEvidence = processOne(inbound('geofence-smoke-5', 'image', {
  text: 'TUAI',
  mediaId: 'media-inside',
  mimeType: 'image/jpeg',
}));

assert.equal(insideEvidence.evidenceRecords[0]?.verificationStatus, 'received');
assert.equal(insideEvidence.evidenceRecords[0]?.locationValidation?.status, 'inside_plot');
assert.equal(insideEvidence.evidenceRecords[0]?.intake?.channel, 'whatsapp');
assert.equal(insideEvidence.evidenceRecords[0]?.intake?.receivedMessageKind, 'image');
assert.equal(insideEvidence.evidenceRecords[0]?.intake?.activitySource, 'caption');
assert.equal(insideEvidence.evidenceRecords[0]?.intake?.completeness.hasLocation, true);
assert.equal(insideEvidence.evidenceRecords[0]?.intake?.completeness.hasMedia, true);
assert.equal(insideEvidence.replies[0]?.requiresHumanReview, undefined);

processOne(inbound('geofence-smoke-6', 'location', { location: outsideLocation }));
const outsideEvidence = processOne(inbound('geofence-smoke-7', 'image', {
  text: 'SEMAK',
  mediaId: 'media-outside',
  mimeType: 'image/jpeg',
}));

assert.equal(outsideEvidence.evidenceRecords[0]?.verificationStatus, 'needs_review');
assert.equal(outsideEvidence.evidenceRecords[0]?.locationValidation?.status, 'outside_plot');
assert.equal(outsideEvidence.evidenceRecords[0]?.review?.status, 'pending');
assert.ok(outsideEvidence.evidenceRecords[0]?.review?.notes?.includes('outside the registered plot'));
assert.equal(outsideEvidence.replies[0]?.requiresHumanReview, true);

console.log(JSON.stringify({
  ok: true,
  insideStatus: insideEvidence.evidenceRecords[0]?.verificationStatus,
  outsideStatus: outsideEvidence.evidenceRecords[0]?.verificationStatus,
  outsideLocationValidation: outsideEvidence.evidenceRecords[0]?.locationValidation,
}, null, 2));
