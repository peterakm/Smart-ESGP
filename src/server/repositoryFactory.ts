import path from 'path';
import { initialFarmers } from '../data/mockFarmers';
import { resolveFileRepositoryRetention } from './fileRepositoryRetention';
import { createPostgresSmartEsgpRepository } from './postgresSmartEsgpRepository';
import { createSmartEsgpRepository } from './smartEsgpRepository';

export type SmartEsgpRepositoryMode = 'file' | 'postgres';

export const resolveSmartEsgpDataFile = (env: NodeJS.ProcessEnv) => {
 return env.SMART_ESGP_DATA_FILE || path.join(process.cwd(), '.smart-esgp-data', 'dev-store.json');
};

export const resolveRepositoryMode = (env: NodeJS.ProcessEnv): SmartEsgpRepositoryMode => {
 const mode = (env.SMART_ESGP_REPOSITORY || 'file').trim().toLowerCase();

 if (mode === 'file' || mode === 'postgres') {
 return mode;
 }

 throw new Error(`Unsupported SMART_ESGP_REPOSITORY mode "${env.SMART_ESGP_REPOSITORY}". Use "file" or "postgres".`);
};

const shouldUsePostgresSsl = (env: NodeJS.ProcessEnv) => {
 return env.SMART_ESGP_POSTGRES_SSL === 'true' || env.PGSSLMODE === 'require';
};

export const createRepositoryFromEnv = async (env: NodeJS.ProcessEnv) => {
 const mode = resolveRepositoryMode(env);

 if (mode === 'postgres') {
 if (!env.DATABASE_URL?.trim()) {
 throw new Error('SMART_ESGP_REPOSITORY=postgres requires DATABASE_URL.');
 }

 return createPostgresSmartEsgpRepository(initialFarmers, {
 connectionString: env.DATABASE_URL,
 ssl: shouldUsePostgresSsl(env),
 schema: env.SMART_ESGP_POSTGRES_SCHEMA,
 });
 }

 return createSmartEsgpRepository(initialFarmers, {
 dataFilePath: resolveSmartEsgpDataFile(env),
 retention: resolveFileRepositoryRetention(env).limits,
 });
};
