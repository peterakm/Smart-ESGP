import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';

const migrationsDir = process.env.SMART_ESGP_MIGRATIONS_DIR || path.join(process.cwd(), 'db', 'migrations');
const databaseUrl = process.env.DATABASE_URL;
const schema = process.env.SMART_ESGP_POSTGRES_SCHEMA;
const useSsl = process.env.SMART_ESGP_POSTGRES_SSL === 'true' || process.env.PGSSLMODE === 'require';

const quoteIdent = (value) => {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new Error('SMART_ESGP_POSTGRES_SCHEMA must contain only letters, numbers, and underscores, and must not start with a number.');
  }
  return `"${value}"`;
};

if (!databaseUrl?.trim()) {
  throw new Error('DATABASE_URL is required to run PostgreSQL migrations.');
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: useSsl ? { rejectUnauthorized: false } : undefined,
});

const migrationFiles = readdirSync(migrationsDir)
  .filter((file) => /^\d+_.+\.sql$/.test(file))
  .sort();

if (migrationFiles.length === 0) {
  throw new Error(`No migration files found in ${migrationsDir}`);
}

const client = await pool.connect();

try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock($1)', [7042026]);

  if (schema) {
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(schema)}`);
    await client.query(`SET search_path TO ${quoteIdent(schema)}, public`);
  }

  await client.query(`
    CREATE TABLE IF NOT EXISTS smart_esgp_schema_migrations (
      filename TEXT PRIMARY KEY,
      sha256 TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const applied = [];
  const skipped = [];

  for (const filename of migrationFiles) {
    const sql = readFileSync(path.join(migrationsDir, filename), 'utf8');
    const sha256 = createHash('sha256').update(sql).digest('hex');
    const existing = await client.query(
      'SELECT sha256 FROM smart_esgp_schema_migrations WHERE filename = $1',
      [filename]
    );

    if (existing.rows[0]) {
      if (existing.rows[0].sha256 !== sha256) {
        throw new Error(`Migration checksum changed after apply: ${filename}`);
      }
      skipped.push(filename);
      continue;
    }

    await client.query(sql);
    await client.query(
      'INSERT INTO smart_esgp_schema_migrations (filename, sha256) VALUES ($1, $2)',
      [filename, sha256]
    );
    applied.push(filename);
  }

  await client.query('COMMIT');

  console.log(JSON.stringify({
    ok: true,
    schema: schema || 'public',
    migrationsDir,
    applied,
    skipped,
  }, null, 2));
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
