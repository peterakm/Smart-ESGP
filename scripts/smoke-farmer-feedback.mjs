import { spawn } from 'node:child_process';

const port = 3090;
const base = `http://localhost:${port}`;
const phone = '60127770123';
const auditorToken = 'auditor-secret';

const child = spawn(process.execPath, ['dist/server.mjs'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(port),
    SMART_ESGP_REQUIRE_AUTH: 'true',
    SMART_ESGP_DASHBOARD_ENABLE_WHATSAPP_WEBHOOK: 'true',
    SMART_ESGP_AUDITOR_TOKEN: auditorToken,
    WHATSAPP_ACCESS_TOKEN: '',
    WHATSAPP_PHONE_NUMBER_ID: '',
    SMART_ESGP_DATA_FILE: `.smart-esgp-data/farmer-feedback-smoke-${Date.now()}.json`,
    SMART_ESGP_MEDIA_DIR: `.smart-esgp-media/farmer-feedback-smoke-${Date.now()}`,
  },
  stdio: 'ignore',
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForServer = async () => {
  for (let i = 0; i < 30; i += 1) {
    try {
      await fetch(`${base}/api/auth/status`);
      return;
    } catch {
      await sleep(400);
    }
  }

  throw new Error('WhatsApp feedback smoke service did not start.');
};

const webhookBody = (message) => JSON.stringify({
  entry: [
    {
      changes: [
        {
          value: {
            messages: [message],
          },
        },
      ],
    },
  ],
});

const postWebhook = async (message) => {
  const response = await fetch(`${base}/api/whatsapp/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: webhookBody(message),
  });

  if (response.status !== 200) {
    throw new Error(`Webhook message ${message.id} failed with ${response.status}`);
  }

  return response.json();
};

try {
  await waitForServer();

  await postWebhook({
    from: phone,
    id: 'feedback-wa-1',
    timestamp: '1784789000',
    type: 'text',
    text: { body: 'BM' },
  });
  await postWebhook({
    from: phone,
    id: 'feedback-wa-2',
    timestamp: '1784789001',
    type: 'text',
    text: { body: 'SAYA SETUJU' },
  });
  await postWebhook({
    from: phone,
    id: 'feedback-wa-3',
    timestamp: '1784789002',
    type: 'text',
    text: { body: '500189' },
  });
  // A licence alone no longer links the phone; approve the link as a FELDA officer would.
  const linkApproval = await fetch(`${base}/api/whatsapp/sessions/${phone}/identity-conflict`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${auditorToken}` },
    body: JSON.stringify({ decision: 'approve' }),
  });
  if (linkApproval.status !== 200) {
    throw new Error(`First-link approval failed with ${linkApproval.status}`);
  }
  await postWebhook({
    from: phone,
    id: 'feedback-wa-4',
    timestamp: '1784789003',
    type: 'location',
    location: {
      latitude: 2.0251,
      longitude: 103.3182,
      name: 'Plot boundary',
    },
  });

  const imageResult = await postWebhook({
    from: phone,
    id: 'feedback-wa-5',
    timestamp: '1784789004',
    type: 'image',
    image: {
      id: 'media-feedback-smoke',
      mime_type: 'image/jpeg',
      caption: 'SEMAK',
    },
  });

  if ('replies' in imageResult || 'sendResults' in imageResult) {
    throw new Error(`Webhook response leaked reply/send details: ${JSON.stringify(imageResult)}`);
  }
  if (imageResult.replyCount !== 1 || imageResult.outbound?.dryRun !== 1) {
    throw new Error(`Expected sanitized webhook summary with one dry-run reply, got ${JSON.stringify(imageResult)}`);
  }

  const openEvidenceResponse = await fetch(`${base}/api/evidence?review=open&limit=10`, {
    headers: { authorization: `Bearer ${auditorToken}` },
  });
  if (openEvidenceResponse.status !== 200) {
    throw new Error(`Expected open evidence API to return 200, got ${openEvidenceResponse.status}`);
  }
  const openEvidenceData = await openEvidenceResponse.json();
  if (openEvidenceData.filters?.review !== 'open' || !openEvidenceData.evidence?.some((record) => record.providerMessageId === 'feedback-wa-5')) {
    throw new Error(`Expected backend-filtered open evidence queue to include feedback-wa-5, got ${JSON.stringify(openEvidenceData)}`);
  }

  const outsideEvidenceResponse = await fetch(`${base}/api/evidence?review=open&locationValidationStatus=outside_plot&limit=10`, {
    headers: { authorization: `Bearer ${auditorToken}` },
  });
  if (outsideEvidenceResponse.status !== 200) {
    throw new Error(`Expected outside-plot evidence API to return 200, got ${outsideEvidenceResponse.status}`);
  }
  const outsideEvidenceData = await outsideEvidenceResponse.json();
  if (
    outsideEvidenceData.filters?.review !== 'open'
    || outsideEvidenceData.filters?.locationValidationStatus !== 'outside_plot'
    || !outsideEvidenceData.evidence?.some((record) => record.providerMessageId === 'feedback-wa-5')
  ) {
    throw new Error(`Expected backend-filtered outside-plot evidence to include feedback-wa-5, got ${JSON.stringify(outsideEvidenceData)}`);
  }
  if (outsideEvidenceData.evidence?.some((record) => record.locationValidation?.status !== 'outside_plot')) {
    throw new Error(`Outside-plot evidence filter returned another GPS status: ${JSON.stringify(outsideEvidenceData.evidence)}`);
  }

  const eventsResponse = await fetch(`${base}/api/whatsapp/events`, {
    headers: { authorization: `Bearer ${auditorToken}` },
  });
  if (eventsResponse.status !== 200) {
    throw new Error(`Expected dashboard WhatsApp events API to return 200, got ${eventsResponse.status}`);
  }

  const events = (await eventsResponse.json()).events;
  const storedFeedbackEvent = events?.find((event) => event.inbound?.providerMessageId === 'feedback-wa-5');
  if (storedFeedbackEvent?.reply?.feedback?.evidenceReviewStatus !== 'pending') {
    throw new Error(`Expected dashboard event feedback to be persisted, got ${JSON.stringify(storedFeedbackEvent)}`);
  }
  if (storedFeedbackEvent?.reply?.evidence?.verificationStatus !== 'needs_review') {
    throw new Error(`Expected monitoring event to expose needs_review evidence summary, got ${JSON.stringify(storedFeedbackEvent?.reply?.evidence)}`);
  }
  if (storedFeedbackEvent?.reply?.evidence?.locationValidation?.status !== 'outside_plot') {
    throw new Error(`Expected monitoring event to expose outside_plot location validation, got ${JSON.stringify(storedFeedbackEvent?.reply?.evidence?.locationValidation)}`);
  }
  if (events.some((event) => event.inbound?.providerMessageId === 'feedback-wa-5' && 'raw' in (event.inbound || {}))) {
    throw new Error('Monitoring list leaked raw payload on GPS-review event.');
  }

  const gpsReviewEventsResponse = await fetch(`${base}/api/whatsapp/events?gpsReview=true&limit=10`, {
    headers: { authorization: `Bearer ${auditorToken}` },
  });
  if (gpsReviewEventsResponse.status !== 200) {
    throw new Error(`Expected GPS-review WhatsApp events API to return 200, got ${gpsReviewEventsResponse.status}`);
  }
  const gpsReviewEventsData = await gpsReviewEventsResponse.json();
  const gpsReviewIds = gpsReviewEventsData.events?.map((event) => event.inbound?.providerMessageId).join(',') || '';
  if (gpsReviewEventsData.filters?.gpsReview !== true || !gpsReviewIds.includes('feedback-wa-5')) {
    throw new Error(`Expected server-filtered GPS-review events to include feedback-wa-5, got ${JSON.stringify(gpsReviewEventsData)}`);
  }
  if (gpsReviewEventsData.events?.some((event) => event.reply?.evidence?.locationValidation?.status === 'inside_plot')) {
    throw new Error(`GPS-review filter returned inside-plot event: ${JSON.stringify(gpsReviewEventsData.events)}`);
  }

  const reply = storedFeedbackEvent.reply;
  if (reply.intent !== 'daily_checkin') {
    throw new Error(`Expected daily_checkin intent, got ${reply.intent}`);
  }
  if (reply.feedback?.language !== 'BM') {
    throw new Error(`Expected BM structured feedback, got ${JSON.stringify(reply.feedback)}`);
  }
  if (reply.feedback.remainingEvidenceDays !== 0) {
    throw new Error(`Expected no remaining evidence days for f-1, got ${reply.feedback.remainingEvidenceDays}`);
  }
  if (reply.feedback.evidenceReviewStatus !== 'pending') {
    throw new Error(`Expected pending evidence review status, got ${reply.feedback.evidenceReviewStatus}`);
  }
  if (!reply.text.includes('Bukti hari ini sedang menunggu semakan FELDA')) {
    throw new Error(`Expected FELDA review guidance in reply text, got ${reply.text}`);
  }
  if ('toPhone' in (storedFeedbackEvent.reply || {})) {
    throw new Error(`Monitoring event leaked reply recipient phone number: ${JSON.stringify(storedFeedbackEvent.reply)}`);
  }
  if ('raw' in (storedFeedbackEvent.inbound || {})) {
    throw new Error(`Monitoring event leaked raw inbound payload: ${JSON.stringify(storedFeedbackEvent)}`);
  }
  if ('text' in (storedFeedbackEvent.outbound || {}) || 'toPhone' in (storedFeedbackEvent.outbound || {})) {
    throw new Error(`Monitoring event leaked outbound message body or recipient: ${JSON.stringify(storedFeedbackEvent.outbound)}`);
  }

  const farmerEventsResponse = await fetch(`${base}/api/whatsapp/farmers/f-1/events?limit=10`, {
    headers: { authorization: `Bearer ${auditorToken}` },
  });
  if (farmerEventsResponse.status !== 200) {
    throw new Error(`Expected farmer-scoped WhatsApp events API to return 200, got ${farmerEventsResponse.status}`);
  }

  const farmerEventsData = await farmerEventsResponse.json();
  const scopedFeedbackEvent = farmerEventsData.events?.find((event) => event.inbound?.providerMessageId === 'feedback-wa-5');
  if (farmerEventsData.farmerId !== 'f-1' || scopedFeedbackEvent?.reply?.feedback?.evidenceReviewStatus !== 'pending') {
    throw new Error(`Expected farmer-scoped feedback event for f-1, got ${JSON.stringify(farmerEventsData)}`);
  }
  if ('toPhone' in (scopedFeedbackEvent.reply || {})) {
    throw new Error(`Farmer-scoped monitoring event leaked reply recipient phone number: ${JSON.stringify(scopedFeedbackEvent.reply)}`);
  }
  if (scopedFeedbackEvent?.reply?.evidence?.locationValidation?.status !== 'outside_plot') {
    throw new Error(`Expected farmer-scoped monitoring event to include outside_plot evidence summary, got ${JSON.stringify(scopedFeedbackEvent?.reply?.evidence)}`);
  }

  const farmerGpsReviewEventsResponse = await fetch(`${base}/api/whatsapp/farmers/f-1/events?gpsReview=true&limit=10`, {
    headers: { authorization: `Bearer ${auditorToken}` },
  });
  if (farmerGpsReviewEventsResponse.status !== 200) {
    throw new Error(`Expected farmer-scoped GPS-review events API to return 200, got ${farmerGpsReviewEventsResponse.status}`);
  }
  const farmerGpsReviewEventsData = await farmerGpsReviewEventsResponse.json();
  if (farmerGpsReviewEventsData.filters?.gpsReview !== true || !farmerGpsReviewEventsData.events?.some((event) => event.inbound?.providerMessageId === 'feedback-wa-5')) {
    throw new Error(`Expected farmer-scoped GPS-review feed to include feedback-wa-5, got ${JSON.stringify(farmerGpsReviewEventsData)}`);
  }

  const unrelatedEventsResponse = await fetch(`${base}/api/whatsapp/farmers/f-2/events?limit=10`, {
    headers: { authorization: `Bearer ${auditorToken}` },
  });
  if (unrelatedEventsResponse.status !== 200) {
    throw new Error(`Expected unrelated farmer-scoped WhatsApp events API to return 200, got ${unrelatedEventsResponse.status}`);
  }
  const unrelatedEventsData = await unrelatedEventsResponse.json();
  if (unrelatedEventsData.events?.some((event) => event.inbound?.providerMessageId === 'feedback-wa-5')) {
    throw new Error(`Farmer-scoped API leaked f-1 feedback into f-2 events: ${JSON.stringify(unrelatedEventsData)}`);
  }

  console.log(JSON.stringify({
    ok: true,
    intent: reply.intent,
    language: reply.feedback.language,
    remainingEvidenceDays: reply.feedback.remainingEvidenceDays,
    evidenceReviewStatus: reply.feedback.evidenceReviewStatus,
    locationValidationStatus: reply.evidence.locationValidation.status,
    gpsReviewFilterVisible: gpsReviewIds.includes('feedback-wa-5'),
    evidenceQueueFilterVisible: outsideEvidenceData.evidence.some((record) => record.providerMessageId === 'feedback-wa-5'),
    riskLevel: reply.feedback.riskLevel,
    dashboardFeedbackVisible: true,
    farmerScopedFeedbackVisible: true,
    monitoringRawPayloadExposed: false,
  }, null, 2));
} finally {
  child.kill();
}
