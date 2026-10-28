import type { Server } from 'node:http';
import type express from 'express';
import type { SmartEsgpRepository } from './smartEsgpRepository';

interface HttpServiceOptions {
 app: express.Express;
 port: number;
 host: string;
 serviceLabel: string;
 repository?: Pick<SmartEsgpRepository, 'close'>;
 onListening: () => void;
}

const closeServer = (server: Server) => {
 return new Promise<void>((resolve, reject) => {
 server.close((error) => {
 if (error) {
 reject(error);
 return;
 }

 resolve();
 });
 });
};

export const startHttpService = ({
 app,
 port,
 host,
 serviceLabel,
 repository,
 onListening,
}: HttpServiceOptions) => {
 const server = app.listen(port, host, onListening);
 let shuttingDown = false;

 const shutdown = async (signal: NodeJS.Signals) => {
 if (shuttingDown) return;
 shuttingDown = true;

 console.log(`${serviceLabel} received ${signal}; closing HTTP server.`);

 try {
 await closeServer(server);
 await repository?.close?.();
 console.log(`${serviceLabel} shutdown complete.`);
 process.exit(0);
 } catch (error) {
 console.error(`${serviceLabel} shutdown failed:`, error instanceof Error ? error.message : error);
 process.exit(1);
 }
 };

 process.once('SIGTERM', () => {
 void shutdown('SIGTERM');
 });
 process.once('SIGINT', () => {
 void shutdown('SIGINT');
 });

 if (process.env.SMART_ESGP_ENABLE_TEST_SHUTDOWN_MESSAGE === 'true') {
 process.on('message', (message) => {
 const type = typeof message === 'object' && message !== null
 ? (message as { type?: unknown }).type
 : message;

 if (type === 'smart-esgp.shutdown') {
 void shutdown('SIGTERM');
 }
 });
 }

 return server;
};
