import crypto from 'node:crypto';
import type express from 'express';

export interface SmartEsgpRequestContext {
 smartEsgpRequestId?: string;
}

const normalizeRequestId = (value: string | undefined) => {
 if (!value) return undefined;
 const requestId = value.trim();

 if (/^[a-zA-Z0-9._:-]{8,120}$/.test(requestId)) {
 return requestId;
 }

 return undefined;
};

export const getRequestId = (req: express.Request) => {
 return (req as express.Request & SmartEsgpRequestContext).smartEsgpRequestId;
};

export const applyRequestContext = (
 app: express.Express,
 env: NodeJS.ProcessEnv,
 serviceName: string
) => {
 const accessLogsEnabled = env.SMART_ESGP_ACCESS_LOGS === 'true';

 app.use((req, res, next) => {
 const startedAt = Date.now();
 const incomingRequestId = Array.isArray(req.headers['x-request-id'])
 ? req.headers['x-request-id'][0]
 : req.headers['x-request-id'];
 const requestId = normalizeRequestId(incomingRequestId) || crypto.randomUUID();

 (req as express.Request & SmartEsgpRequestContext).smartEsgpRequestId = requestId;
 res.setHeader('x-request-id', requestId);

 if (accessLogsEnabled) {
 res.on('finish', () => {
 console.log(JSON.stringify({
 service: serviceName,
 requestId,
 method: req.method,
 path: req.originalUrl,
 status: res.statusCode,
 durationMs: Date.now() - startedAt,
 }));
 });
 }

 next();
 });
};
