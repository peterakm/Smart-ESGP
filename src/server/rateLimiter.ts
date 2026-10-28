import type express from 'express';
import { getRequestId } from './requestContext';

interface FixedWindowRateLimiterOptions {
 id: string;
 maxRequests: number;
 windowMs?: number;
 message?: string;
}

const clampPositiveInteger = (value: number, fallback: number) => {
 if (!Number.isFinite(value)) return fallback;
 return Math.max(1, Math.trunc(value));
};

export const rateLimitFromEnv = (
 value: string | undefined,
 fallback: number
) => {
 return clampPositiveInteger(Number(value), fallback);
};

// req.ip honours X-Forwarded-For only when SMART_ESGP_TRUST_PROXY enables Express
// "trust proxy"; reading the header directly would let clients pick their own key.
const clientKey = (req: express.Request) => {
 return req.ip || req.socket.remoteAddress || 'unknown';
};

export const createFixedWindowRateLimiter = ({
 id,
 maxRequests,
 windowMs = 60_000,
 message = 'Too many requests. Please wait before trying again.',
}: FixedWindowRateLimiterOptions): express.RequestHandler => {
 const buckets = new Map<string, { count: number; resetAt: number }>();
 const limit = clampPositiveInteger(maxRequests, 1);
 const windowLength = clampPositiveInteger(windowMs, 60_000);

 return (req, res, next) => {
 const now = Date.now();
 const key = `${id}:${clientKey(req)}`;
 const existing = buckets.get(key);
 const bucket = !existing || existing.resetAt <= now
 ? { count: 0, resetAt: now + windowLength }
 : existing;

 bucket.count += 1;
 buckets.set(key, bucket);

 const remaining = Math.max(0, limit - bucket.count);
 const resetSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));

 res.setHeader('ratelimit-limit', String(limit));
 res.setHeader('ratelimit-remaining', String(remaining));
 res.setHeader('ratelimit-reset', String(resetSeconds));

 if (bucket.count > limit) {
 res.setHeader('retry-after', String(resetSeconds));
 res.status(429).json({
 error: message,
 requestId: getRequestId(req),
 });
 return;
 }

 if (buckets.size > 10_000) {
 for (const [bucketKey, value] of buckets.entries()) {
 if (value.resetAt <= now) {
 buckets.delete(bucketKey);
 }
 }
 }

 next();
 };
};
