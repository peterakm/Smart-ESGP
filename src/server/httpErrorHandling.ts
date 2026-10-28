import type express from 'express';
import { getRequestId } from './requestContext';

type AsyncRequestHandler = (
 req: express.Request,
 res: express.Response,
 next: express.NextFunction
) => unknown | Promise<unknown>;

const statusFromError = (error: unknown) => {
 const candidate = error as { status?: unknown; statusCode?: unknown; type?: unknown } | undefined;
 const status = Number(candidate?.status || candidate?.statusCode);

 if (Number.isInteger(status) && status >= 400 && status <= 599) {
 return status;
 }

 if (candidate?.type === 'entity.parse.failed') {
 return 400;
 }

 return 500;
};

const messageForError = (error: unknown, status: number) => {
 const candidate = error as { type?: unknown; message?: unknown } | undefined;

 if (candidate?.type === 'entity.parse.failed') {
 return 'Invalid JSON request body.';
 }

 if (candidate?.type === 'entity.too.large' || status === 413) {
 return 'Request body is too large.';
 }

 if (status >= 500) {
 return 'Internal server error.';
 }

 return typeof candidate?.message === 'string' && candidate.message.trim()
 ? candidate.message
 : 'Request failed.';
};

export const asyncRoute = (handler: AsyncRequestHandler): express.RequestHandler => {
 return (req, res, next) => {
 Promise.resolve(handler(req, res, next)).catch(next);
 };
};

export const createApiErrorHandler = (serviceName: string): express.ErrorRequestHandler => {
 return (error, req, res, next) => {
 if (res.headersSent) {
 next(error);
 return;
 }

 const status = statusFromError(error);
 const message = messageForError(error, status);
 const requestId = getRequestId(req);

 if (status >= 500) {
 console.error(
 `[${serviceName}] ${req.method} ${req.originalUrl} failed requestId=${requestId || 'unknown'}:`,
 error instanceof Error ? error.stack || error.message : error
 );
 }

 res.status(status).json({
 error: message,
 requestId,
 });
 };
};
