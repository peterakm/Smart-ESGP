import express from 'express';
import type { SmartEsgpRequest } from './auth';

const DEFAULT_JSON_BODY_LIMIT = '256kb';
const VALID_LIMIT = /^\d+(b|kb|mb)?$/i;

export type SmartEsgpJsonService = 'dashboard' | 'whatsapp';

export const resolveJsonBodyLimit = (
 env: NodeJS.ProcessEnv,
 service: SmartEsgpJsonService
) => {
 const serviceKey = service === 'dashboard'
 ? 'SMART_ESGP_DASHBOARD_JSON_BODY_LIMIT'
 : 'SMART_ESGP_WHATSAPP_JSON_BODY_LIMIT';
 const value = (env[serviceKey] || env.SMART_ESGP_JSON_BODY_LIMIT || DEFAULT_JSON_BODY_LIMIT).trim();

 if (!VALID_LIMIT.test(value)) {
 throw new Error(`${serviceKey} / SMART_ESGP_JSON_BODY_LIMIT must be a size such as 256kb, 1mb, or 50000.`);
 }

 return value;
};

export const createSmartEsgpJson = (
 env: NodeJS.ProcessEnv,
 service: SmartEsgpJsonService
) => express.json({
 limit: resolveJsonBodyLimit(env, service),
 verify: (req: SmartEsgpRequest, _res, buf) => {
 req.rawBody = Buffer.from(buf);
 },
});
