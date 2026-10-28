import type { SystemAuditEvent } from '../types';

type SystemAuditInput = Omit<SystemAuditEvent, 'id' | 'createdAt'>;

const safeIdSegment = (value: string) => {
 return value.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 80) || 'event';
};

export const maskPhoneNumber = (phoneNumber?: string) => {
 if (!phoneNumber) return undefined;
 const visible = phoneNumber.slice(-4);
 return `wa-****${visible}`;
};

export const createSystemAuditEvent = (input: SystemAuditInput): SystemAuditEvent => {
 const createdAt = new Date().toISOString();
 const entitySegment = input.entityId ? safeIdSegment(input.entityId) : safeIdSegment(input.action);

 return {
 ...input,
 id: `audit-${Date.now()}-${entitySegment}-${Math.random().toString(36).slice(2, 8)}`,
 createdAt,
 };
};
