import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { DealerDashboard } from '../src/components/DealerDashboard';
import { VerificationPortal } from '../src/components/VerificationPortal';
import { initialFarmers, SAMPLE_DATA_AS_OF } from '../src/data/mockFarmers';
import { FarmerStatus, type CertificateRecord, type EvidenceRecord } from '../src/types';

// Rendering tests exercise real data-dependent branches without touching live data.
// These do not replace browser layout or interaction checks.
const noop = () => {};
const baseProps = {
  whatsappSessions: [], whatsappEvents: [], whatsappMessageClaims: [],
  evidenceRecords: [], systemAuditEvents: [], certificates: [], consentRecords: [],
  complianceEvaluation: null,
  onSelectFarmer: noop, onViewCertificate: noop, onClearFlag: noop,
  onApplyOverride: noop, onReviewEvidence: noop, onOpenEvidenceMedia: noop,
  onIssueCertificate: noop,
};

function assertValidMarkup(markup: string) {
  // MYDS decorative SVGs repeat their internal design-layer IDs (e.g. "Vector").
  // Check application IDs used by labels, controls, and section navigation.
  const applicationMarkup = markup.replace(/<svg\b[\s\S]*?<\/svg>/g, '');
  const ids = [...applicationMarkup.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(ids.length, new Set(ids).size, `Rendered IDs must be unique: ${[...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))].join(', ')}`);
  assert.doesNotMatch(markup, />NaN<|Invalid Date|\[object Object\]/);
}

let cases = 0;
for (const language of ['EN', 'BM'] as const) {
  for (const status of Object.values(FarmerStatus)) {
    const farmer = { ...initialFarmers[0], status };
    for (const isSampleData of [true, false]) {
      const dashboard = renderToStaticMarkup(
        <DealerDashboard {...baseProps} farmers={[farmer]} selectedFarmerId={farmer.id}
          language={language} isSampleData={isSampleData} sampleDataAsOf={SAMPLE_DATA_AS_OF} />,
      );
      assertValidMarkup(dashboard);
      for (const section of ['auditor-triage-band', 'kpi-cards', 'dashboard-workbench',
        'farmers-data-table', 'farmer-detail-drilldown', 'whatsapp-operations-monitor',
        'guidelines-library', 'compliance-charts-grid']) {
        assert.ok(dashboard.includes(`id="${section}"`), `Missing section ${section}`);
      }
      assert.match(dashboard, /aria-label="[^"]+"[^>]*id="dashboard-search-input"|id="dashboard-search-input"[^>]*aria-label="[^"]+"/);
      assert.ok(dashboard.includes(`id="btn-row-detail-${farmer.id}"`));
      assert.ok(dashboard.includes(`id="btn-row-review-${farmer.id}"`));
      assert.equal(dashboard.includes('id="btn-triage-flagged"'), status === FarmerStatus.FLAGGED);
      assert.equal(dashboard.includes('id="btn-pending-activities"'), status !== FarmerStatus.FLAGGED);
      assert.equal(dashboard.includes('Sample data - not live data'), isSampleData && language === 'EN');

      const portal = renderToStaticMarkup(
        <VerificationPortal farmer={farmer} language={language} certificates={[]}
          onBack={noop} isSampleData={isSampleData} sampleDataAsOf={SAMPLE_DATA_AS_OF} />,
      );
      assertValidMarkup(portal);
      assert.ok(portal.includes('id="btn-back-to-dashboard"'));
      assert.ok(portal.includes(farmer.mpobLicence));
      assert.equal(portal.includes('id="portal-sample-data-notice"'), isSampleData);
      assert.equal(portal.includes('id="flagged-banner"'), status === FarmerStatus.FLAGGED);
      assert.equal(portal.includes('id="btn-portal-download-cert"'), status === FarmerStatus.CERTIFIED);
      assert.ok(!portal.includes('id="lang-en-btn"'), 'Embedded review uses the workspace language switch');
      cases += 2;
    }
  }

  const farmer = initialFarmers[0];
  const evidence: EvidenceRecord = {
    id: 'ui-review-evidence', farmerId: farmer.id, source: 'whatsapp',
    evidenceType: 'daily_checkin', activityType: 'harvest', verificationStatus: 'needs_review',
    phoneNumber: '60123456789', providerMessageId: 'ui-review-message',
    receivedAt: '2026-09-09T08:00:00Z', createdAt: '2026-09-09T08:00:00Z',
    summary: 'Harvest evidence pending review', review: { status: 'pending' },
  };
  const pendingDashboard = renderToStaticMarkup(
    <DealerDashboard {...baseProps} farmers={[farmer]} selectedFarmerId={farmer.id}
      language={language} evidenceRecords={[evidence]} evidenceReviewQueueRecords={[evidence]} />,
  );
  assertValidMarkup(pendingDashboard);
  for (const action of ['approve', 'flag', 'reject']) {
    assert.ok(pendingDashboard.includes(`id="btn-${action}-evidence-${evidence.id}"`));
  }
  assert.ok(pendingDashboard.includes('id="btn-triage-evidence"'));
  cases++;

  for (const status of ['issued', 'suspended', 'revoked', 'expired'] as const) {
    const certificate: CertificateRecord = {
      id: `ui-${status}`, farmerId: farmer.id, certificateNumber: `UI-${status}`,
      status, issuedAt: '2026-09-01T00:00:00Z', expiresAt: '2027-09-01T00:00:00Z',
      issuedBy: 'UI fixture auditor', verificationHash: 'a'.repeat(64),
      scoreAtIssue: 90, evidenceDaysAtIssue: 90, standard: 'MSPO-MS2530-2022',
    };
    const portal = renderToStaticMarkup(
      <VerificationPortal farmer={{ ...farmer, status: FarmerStatus.CERTIFIED }} language={language}
        certificates={[certificate]} onLanguageChange={noop} />,
    );
    assertValidMarkup(portal);
    assert.ok(portal.includes(`id="lang-${language.toLowerCase()}-btn"`));
    assert.match(portal, /aria-pressed="true"/);
    if (status === 'issued') assert.ok(portal.includes(certificate.certificateNumber));
    cases++;
  }
}

console.log(`UI rendering smoke passed: ${cases} dashboard/review cases across both languages, all farmer statuses, provenance, evidence actions, and certificate states.`);
