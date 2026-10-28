import type { SystemAuditEvent } from '../types';

export const getOperationalAuditAlerts = (
 events: SystemAuditEvent[],
 limit = 4
) => {
 return events
 .filter((event) => event.severity === 'warning' || event.severity === 'error')
 .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
 .slice(0, Math.max(0, Math.trunc(limit)));
};
