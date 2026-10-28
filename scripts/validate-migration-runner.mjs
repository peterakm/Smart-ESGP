import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const source = readFileSync('scripts/run-postgres-migrations.mjs', 'utf8');
const migrationFiles = readdirSync('db/migrations')
  .filter((file) => /^\d+_.+\.sql$/.test(file))
  .sort();

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

for (const expected of [
  'DATABASE_URL is required',
  'SMART_ESGP_POSTGRES_SCHEMA',
  'pg_advisory_xact_lock',
  'smart_esgp_schema_migrations',
  'Migration checksum changed after apply',
  'BEGIN',
  'COMMIT',
  'ROLLBACK',
]) {
  assert(source.includes(expected), `Migration runner should include ${expected}`);
}

for (const migrationFile of migrationFiles) {
  const migration = readFileSync(path.join('db/migrations', migrationFile), 'utf8');
  assert(
    !/\b(begin|commit|rollback)\s*;/i.test(migration),
    `Migration SQL files should not include transaction control; the migration runner owns transactions: ${migrationFile}.`
  );
}

console.log(JSON.stringify({
  ok: true,
  runner: 'scripts/run-postgres-migrations.mjs',
  migrations: migrationFiles,
}, null, 2));
