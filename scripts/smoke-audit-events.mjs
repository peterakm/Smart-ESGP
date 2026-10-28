import { spawn } from 'node:child_process';

const port = 3069;
const auditorToken = 'auditor-secret';
const phone = '60127770123';
const base = `http://localhost:${port}`;

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
    SMART_ESGP_DATA_FILE: `.smart-esgp-data/audit-events-smoke-${Date.now()}.json`,
  },
  stdio: 'ignore',
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForServer = async () => {
  for (let i = 0; i < 30; i += 1) {
    try {
      await fetch(`${base}/health`);
      return;
    } catch {
      await sleep(400);
    }
  }

  throw new Error('Server did not start.');
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
};

const fetchAuditEvents = async (query = 'limit=100') => {
  const response = await fetch(`${base}/api/audit/events?${query}`, {
    headers: { authorization: `Bearer ${auditorToken}` },
  });

  if (response.status !== 200) {
    throw new Error(`Audit events API failed with ${response.status}`);
  }

  return response.json();
};

try {
  await waitForServer();

  await postWebhook({
    from: phone,
    id: 'audit-wa-1',
    timestamp: '1784789000',
    type: 'text',
    text: { body: 'BM' },
  });
  await postWebhook({
    from: phone,
    id: 'audit-wa-2',
    timestamp: '1784789001',
    type: 'text',
    text: { body: 'SAYA SETUJU' },
  });
  await postWebhook({
    from: phone,
    id: 'audit-wa-3',
    timestamp: '1784789002',
    type: 'text',
    text: { body: '500247' },
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
    id: 'audit-wa-4',
    timestamp: '1784789003',
    type: 'location',
    location: {
      latitude: 2.0182,
      longitude: 103.331,
    },
  });
  await postWebhook({
    from: phone,
    id: 'audit-wa-5',
    timestamp: '1784789004',
    type: 'image',
    image: {
      id: 'media-audit-smoke',
      mime_type: 'image/jpeg',
      caption: 'SEMAK',
    },
  });

  const evidenceResponse = await fetch(`${base}/api/evidence?limit=20`, {
    headers: { authorization: `Bearer ${auditorToken}` },
  });
  const evidence = (await evidenceResponse.json()).evidence?.find(
    (record) => record.providerMessageId === 'audit-wa-5'
  );

  if (!evidence) {
    throw new Error('Expected evidence for audit smoke.');
  }

  const reviewResponse = await fetch(`${base}/api/evidence/${encodeURIComponent(evidence.id)}/review`, {
    method: 'PATCH',
    headers: {
      authorization: `Bearer ${auditorToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      decision: 'approved',
      reviewedBy: 'Audit Smoke Auditor',
      notes: 'Audit smoke approval.',
    }),
  });

  if (reviewResponse.status !== 200) {
    throw new Error(`Evidence review failed with ${reviewResponse.status}`);
  }

  const auditEventsData = await fetchAuditEvents();
  const auditEvents = auditEventsData.events || [];
  const actions = new Set(auditEvents.map((event) => event.action));

  for (const action of [
    'whatsapp.webhook.processed',
    'whatsapp.message.received',
    'evidence.collected',
    'evidence.review.approved',
    'farmer.compliance.updated',
  ]) {
    if (!actions.has(action)) {
      throw new Error(`Missing audit event action ${action}`);
    }
  }

  const collectionEvent = auditEvents.find((event) => event.action === 'evidence.collected');
  if (collectionEvent?.actorId !== 'wa-****0123') {
    throw new Error(`Expected masked actor phone, got ${collectionEvent?.actorId}`);
  }

  const warningEventsData = await fetchAuditEvents('severity=warning&limit=20');
  if (warningEventsData.filters?.severity !== 'warning') {
    throw new Error(`Expected severity filter to be echoed, got ${JSON.stringify(warningEventsData.filters)}`);
  }
  if ((warningEventsData.events || []).some((event) => event.severity !== 'warning')) {
    throw new Error(`Severity filter returned non-warning events: ${JSON.stringify(warningEventsData.events)}`);
  }

  const evidenceCollectedData = await fetchAuditEvents('action=evidence.collected&entityType=evidence&limit=20');
  if (
    evidenceCollectedData.filters?.action !== 'evidence.collected'
    || evidenceCollectedData.filters?.entityType !== 'evidence'
    || !(evidenceCollectedData.events || []).some((event) => event.action === 'evidence.collected')
  ) {
    throw new Error(`Expected filtered evidence.collected audit events, got ${JSON.stringify(evidenceCollectedData)}`);
  }
  if ((evidenceCollectedData.events || []).some((event) => event.action !== 'evidence.collected' || event.entityType !== 'evidence')) {
    throw new Error(`Action/entity filter returned unrelated audit events: ${JSON.stringify(evidenceCollectedData.events)}`);
  }

  const whatsappServiceEventsData = await fetchAuditEvents('service=dashboard&action=whatsapp.webhook.processed&limit=20');
  if (
    whatsappServiceEventsData.filters?.service !== 'dashboard'
    || whatsappServiceEventsData.filters?.action !== 'whatsapp.webhook.processed'
    || !(whatsappServiceEventsData.events || []).some((event) => event.action === 'whatsapp.webhook.processed')
  ) {
    throw new Error(`Expected dashboard webhook processed audit events, got ${JSON.stringify(whatsappServiceEventsData)}`);
  }

  console.log(JSON.stringify({
    ok: true,
    auditedActions: [...actions]
      .filter((action) => action.includes('whatsapp') || action.includes('evidence') || action.includes('farmer.compliance'))
      .sort(),
    filteredEvidenceEvents: evidenceCollectedData.events.length,
    filteredWarningEvents: warningEventsData.events.length,
    eventCount: auditEvents.length,
  }, null, 2));
} finally {
  child.kill();
}
