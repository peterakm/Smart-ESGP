import assert from 'node:assert/strict';
import type { SystemAuditEvent } from '../src/types';
import { getOperationalAuditAlerts } from '../src/utils/systemAudit';

const event = (
  id: string,
  severity: SystemAuditEvent['severity'],
  createdAt: string
): SystemAuditEvent => ({
  id,
  service: 'dashboard',
  action: `audit.${id}`,
  actorType: 'system',
  entityType: 'service',
  severity,
  message: `Audit ${id}`,
  createdAt,
});

const alerts = getOperationalAuditAlerts([
  event('info-newest', 'info', '2026-07-24T04:10:00.000Z'),
  event('warning-old', 'warning', '2026-07-24T04:00:00.000Z'),
  event('error-new', 'error', '2026-07-24T04:09:00.000Z'),
  event('warning-newer', 'warning', '2026-07-24T04:08:00.000Z'),
], 2);

assert.deepEqual(
  alerts.map((item) => item.id),
  ['error-new', 'warning-newer'],
  'Expected warning/error alerts sorted newest first and limited.'
);

console.log(JSON.stringify({
  ok: true,
  alerts: alerts.map((item) => `${item.id}:${item.severity}`),
}, null, 2));
