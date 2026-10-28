import { spawn } from 'node:child_process';

const port = 3064;
const auditorToken = 'auditor-secret';
const phone = '60125550123';
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
    SMART_ESGP_DATA_FILE: `.smart-esgp-data/evidence-review-smoke-${Date.now()}.json`,
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

  return response.json();
};

try {
  await waitForServer();

  await postWebhook({
    from: phone,
    id: 'review-wa-1',
    timestamp: '1784789000',
    type: 'text',
    text: { body: 'BM' },
  });
  await postWebhook({
    from: phone,
    id: 'review-wa-2',
    timestamp: '1784789001',
    type: 'text',
    text: { body: 'SAYA SETUJU' },
  });
  await postWebhook({
    from: phone,
    id: 'review-wa-3',
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
    id: 'review-wa-4',
    timestamp: '1784789003',
    type: 'location',
    location: {
      latitude: 2.035,
      longitude: 103.325,
      name: 'Plot boundary',
    },
  });
  await postWebhook({
    from: phone,
    id: 'review-wa-5',
    timestamp: '1784789004',
    type: 'image',
    image: {
      id: 'media-review-smoke',
      mime_type: 'image/jpeg',
      caption: 'SEMAK',
    },
  });

  const evidenceResponse = await fetch(`${base}/api/evidence?limit=20`, {
    headers: { authorization: `Bearer ${auditorToken}` },
  });
  if (evidenceResponse.status !== 200) {
    throw new Error(`Evidence list failed with ${evidenceResponse.status}`);
  }

  const evidence = (await evidenceResponse.json()).evidence?.find(
    (record) => record.providerMessageId === 'review-wa-5'
  );

  if (!evidence) {
    throw new Error('Expected review evidence record to be created.');
  }
  if (evidence.verificationStatus !== 'received') {
    throw new Error(`Expected received evidence before review, got ${evidence.verificationStatus}`);
  }
  if (evidence.review?.status !== 'pending') {
    throw new Error(`Expected pending review status, got ${evidence.review?.status}`);
  }
  if (evidence.reviewHistory?.length !== 1 || evidence.reviewHistory[0].status !== 'pending') {
    throw new Error(`Expected one pending review history entry, got ${JSON.stringify(evidence.reviewHistory)}`);
  }
  if (evidence.mediaStorage?.mode !== 'dry_run') {
    throw new Error(`Expected dry_run media storage, got ${evidence.mediaStorage?.mode}`);
  }

  const reviewResponse = await fetch(`${base}/api/evidence/${encodeURIComponent(evidence.id)}/review`, {
    method: 'PATCH',
    headers: {
      authorization: `Bearer ${auditorToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      decision: 'approved',
      notes: 'Smoke test approval.',
      reviewedBy: 'Smoke Auditor',
    }),
  });

  if (reviewResponse.status !== 200) {
    throw new Error(`Evidence approval failed with ${reviewResponse.status}`);
  }

  const reviewData = await reviewResponse.json();
  if (reviewData.evidence?.verificationStatus !== 'verified') {
    throw new Error(`Expected verified evidence after approval, got ${reviewData.evidence?.verificationStatus}`);
  }
  if (reviewData.evidence?.review?.status !== 'approved') {
    throw new Error(`Expected approved review status, got ${reviewData.evidence?.review?.status}`);
  }
  if (reviewData.evidence?.reviewHistory?.length !== 2) {
    throw new Error(`Expected two review history entries, got ${JSON.stringify(reviewData.evidence?.reviewHistory)}`);
  }
  const historyStatuses = reviewData.evidence.reviewHistory.map((review) => review.status).join(',');
  if (historyStatuses !== 'pending,approved') {
    throw new Error(`Expected pending,approved history, got ${historyStatuses}`);
  }
  if (!reviewData.farmer || reviewData.farmer.id !== 'f-1') {
    throw new Error('Expected farmer f-1 to be returned after approval.');
  }

  console.log(JSON.stringify({
    ok: true,
    before: evidence.verificationStatus,
    after: reviewData.evidence.verificationStatus,
    reviewHistory: historyStatuses,
    farmer: reviewData.farmer.id,
  }, null, 2));
} finally {
  child.kill();
}
