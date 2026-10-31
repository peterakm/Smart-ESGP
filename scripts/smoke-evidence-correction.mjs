import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const port = 3089;
const auditorToken = 'auditor-secret';
const phone = '60126660123';
const base = `http://localhost:${port}`;

const dataFile = `.smart-esgp-data/evidence-correction-smoke-${Date.now()}.json`;

const startServer = () => spawn(process.execPath, ['dist/server.mjs'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(port),
    SMART_ESGP_REQUIRE_AUTH: 'true',
    SMART_ESGP_DASHBOARD_ENABLE_WHATSAPP_WEBHOOK: 'true',
    SMART_ESGP_AUDITOR_TOKEN: auditorToken,
    WHATSAPP_ACCESS_TOKEN: '',
    WHATSAPP_PHONE_NUMBER_ID: '',
    SMART_ESGP_DATA_FILE: dataFile,
  },
  stdio: 'ignore',
});

let child = startServer();

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

const authHeaders = {
  authorization: `Bearer ${auditorToken}`,
};

const jsonAuthHeaders = {
  ...authHeaders,
  'content-type': 'application/json',
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

const reviewEvidence = async (evidenceId, decision, notes) => {
  const response = await fetch(`${base}/api/evidence/${encodeURIComponent(evidenceId)}/review`, {
    method: 'PATCH',
    headers: jsonAuthHeaders,
    body: JSON.stringify({
      decision,
      notes,
      reviewedBy: 'Evidence Correction Smoke Auditor',
    }),
  });

  if (response.status !== 200) {
    throw new Error(`Evidence ${decision} review failed with ${response.status}`);
  }

  return response.json();
};

try {
  await waitForServer();

  const farmerResponse = await fetch(`${base}/api/farmers/f-3`, {
    headers: authHeaders,
  });
  const farmer = (await farmerResponse.json()).farmer;
  const thresholdFarmer = {
    ...farmer,
    score: 89,
    daysCollected: 89,
    status: 'In progress',
    mspoCertId: 'PENDING-678',
    evidenceSummary: {
      ...farmer.evidenceSummary,
      checkIns: 89,
    },
  };

  // Compliance fields cannot be set through the API, so seed the 89-day
  // threshold state straight into the data file and restart on it.
  const farmers = (await (await fetch(`${base}/api/farmers`, { headers: authHeaders })).json()).farmers;
  child.kill();
  await new Promise((resolve) => child.once('exit', resolve));
  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  fs.writeFileSync(dataFile, JSON.stringify({
    version: 1,
    savedAt: new Date().toISOString(),
    farmers: farmers.map((candidate) => (candidate.id === thresholdFarmer.id ? thresholdFarmer : candidate)),
    whatsappWebhookEvents: [],
  }));
  child = startServer();
  await waitForServer();

  await postWebhook({
    from: phone,
    id: 'correction-wa-1',
    timestamp: '1784789000',
    type: 'text',
    text: { body: 'EN' },
  });
  await postWebhook({
    from: phone,
    id: 'correction-wa-2',
    timestamp: '1784789001',
    type: 'text',
    text: { body: 'I AGREE' },
  });
  await postWebhook({
    from: phone,
    id: 'correction-wa-3',
    timestamp: '1784789002',
    type: 'text',
    text: { body: '500678' },
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
    id: 'correction-wa-4',
    timestamp: '1784789003',
    type: 'location',
    location: {
      latitude: 2.0152,
      longitude: 103.3102,
      name: 'Threshold correction plot boundary',
    },
  });
  await postWebhook({
    from: phone,
    id: 'correction-wa-5',
    timestamp: '1784789004',
    type: 'image',
    image: {
      id: 'media-correction-smoke',
      mime_type: 'image/jpeg',
      caption: 'SEMAK',
    },
  });

  const evidenceResponse = await fetch(`${base}/api/evidence?limit=20`, {
    headers: authHeaders,
  });
  const evidence = (await evidenceResponse.json()).evidence?.find(
    (record) => record.providerMessageId === 'correction-wa-5'
  );
  if (!evidence) {
    throw new Error('Expected correction evidence record.');
  }

  const approved = await reviewEvidence(evidence.id, 'approved', 'Approve to reach certification threshold.');
  if (approved.farmer?.status !== 'Certified' || approved.farmer?.score !== 90 || approved.farmer?.daysCollected !== 90) {
    throw new Error(`Expected farmer certified at 90/90 after approval, got ${JSON.stringify(approved.farmer)}`);
  }

  const issueResponse = await fetch(`${base}/api/certificates/issue`, {
    method: 'POST',
    headers: jsonAuthHeaders,
    body: JSON.stringify({
      farmerId: 'f-3',
      issuedBy: 'Evidence Correction Smoke Auditor',
    }),
  });
  if (issueResponse.status !== 201) {
    throw new Error(`Expected certificate issue 201, got ${issueResponse.status}`);
  }
  const issued = await issueResponse.json();
  const verificationHash = issued.certificate?.verificationHash;

  const corrected = await reviewEvidence(evidence.id, 'rejected', 'Correction: evidence was approved by mistake.');
  if (corrected.evidence?.verificationStatus !== 'needs_review' || corrected.evidence?.review?.status !== 'rejected') {
    throw new Error(`Expected rejected needs_review evidence after correction, got ${JSON.stringify(corrected.evidence)}`);
  }
  const reviewHistoryStatuses = corrected.evidence.reviewHistory?.map((review) => review.status).join(',');
  if (reviewHistoryStatuses !== 'pending,approved,rejected') {
    throw new Error(`Expected pending,approved,rejected review history, got ${reviewHistoryStatuses}`);
  }
  if (corrected.farmer?.status === 'Certified' || corrected.farmer?.score !== 89 || corrected.farmer?.daysCollected !== 89) {
    throw new Error(`Expected farmer to leave certified state at 89/89, got ${JSON.stringify(corrected.farmer)}`);
  }
  if (corrected.suspendedCertificate?.status !== 'suspended') {
    throw new Error(`Expected suspended certificate, got ${JSON.stringify(corrected.suspendedCertificate)}`);
  }

  const verifySuspended = await fetch(`${base}/api/certificates/verify/${verificationHash}`);
  if (verifySuspended.status !== 404) {
    throw new Error(`Expected suspended certificate verification 404, got ${verifySuspended.status}`);
  }
  const verification = await verifySuspended.json();
  if (verification.valid !== false || verification.certificate?.status !== 'suspended') {
    throw new Error(`Expected public verification to show suspended certificate, got ${JSON.stringify(verification)}`);
  }

  const auditResponse = await fetch(`${base}/api/audit/events?limit=50`, {
    headers: authHeaders,
  });
  const auditEvents = (await auditResponse.json()).events || [];
  const actions = new Set(auditEvents.map((event) => event.action));
  for (const action of ['evidence.review.rejected', 'farmer.compliance.corrected', 'certificate.suspended']) {
    if (!actions.has(action)) {
      throw new Error(`Expected audit action ${action}.`);
    }
  }

  console.log(JSON.stringify({
    ok: true,
    approved: {
      status: approved.farmer.status,
      score: approved.farmer.score,
      daysCollected: approved.farmer.daysCollected,
    },
    corrected: {
      status: corrected.farmer.status,
      score: corrected.farmer.score,
      daysCollected: corrected.farmer.daysCollected,
      certificateStatus: corrected.suspendedCertificate.status,
      reviewHistory: reviewHistoryStatuses,
    },
    verificationStatus: verification.certificate.status,
  }, null, 2));
} finally {
  child.kill();
}
