import assert from 'node:assert/strict';
import {
  createWhatsAppCloudApiConfig,
  DEFAULT_GRAPH_API_VERSION,
  DEFAULT_WHATSAPP_REQUEST_TIMEOUT_MS,
  resolveWhatsAppRequestTimeoutMs,
  summarizeWhatsAppCloudApiConfig,
} from '../src/services/whatsappCloudApi';

const dryRun = summarizeWhatsAppCloudApiConfig(createWhatsAppCloudApiConfig({}));
assert.equal(dryRun.mode, 'dry_run');
assert.equal(dryRun.graphApiVersion, DEFAULT_GRAPH_API_VERSION);
assert.equal(dryRun.requestTimeoutMs, DEFAULT_WHATSAPP_REQUEST_TIMEOUT_MS);
assert.equal(dryRun.requestTimeoutValid, true);
assert.equal(dryRun.graphApiVersionValid, true);
assert.equal(dryRun.accessTokenConfigured, false);
assert.equal(dryRun.phoneNumberIdConfigured, false);
assert.equal(dryRun.phoneNumberIdValid, true);

const live = summarizeWhatsAppCloudApiConfig(createWhatsAppCloudApiConfig({
  WHATSAPP_GRAPH_API_VERSION: 'v23.0',
  WHATSAPP_ACCESS_TOKEN: 'test-access-token',
  WHATSAPP_PHONE_NUMBER_ID: '123456789012345',
}));
assert.equal(live.mode, 'live');
assert.equal(live.graphApiVersionValid, true);
assert.equal(live.accessTokenConfigured, true);
assert.equal(live.phoneNumberIdConfigured, true);
assert.equal(live.phoneNumberIdValid, true);

const displayNumber = summarizeWhatsAppCloudApiConfig(createWhatsAppCloudApiConfig({
  WHATSAPP_ACCESS_TOKEN: 'test-access-token',
  WHATSAPP_PHONE_NUMBER_ID: '+60123456789',
}));
assert.equal(displayNumber.mode, 'live');
assert.equal(displayNumber.phoneNumberIdValid, false);

const badVersion = summarizeWhatsAppCloudApiConfig(createWhatsAppCloudApiConfig({
  WHATSAPP_GRAPH_API_VERSION: '23.0',
  WHATSAPP_ACCESS_TOKEN: 'test-access-token',
  WHATSAPP_PHONE_NUMBER_ID: '123456789012345',
}));
assert.equal(badVersion.graphApiVersionValid, false);

const customTimeout = resolveWhatsAppRequestTimeoutMs('15000');
assert.equal(customTimeout.ok, true);
assert.equal(customTimeout.ms, 15000);

const invalidTimeout = resolveWhatsAppRequestTimeoutMs('999');
assert.equal(invalidTimeout.ok, false);
assert.equal(invalidTimeout.ms, DEFAULT_WHATSAPP_REQUEST_TIMEOUT_MS);

console.log(JSON.stringify({
  ok: true,
  dryRunMode: dryRun.mode,
  liveMode: live.mode,
  rejectedPhoneNumberId: '+60123456789',
  rejectedGraphApiVersion: '23.0',
  rejectedTimeoutMs: '999',
}, null, 2));
