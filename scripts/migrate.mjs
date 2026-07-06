// Applies supabase/migrations/*.sql in filename order, tracking applied files
// in public._migrations. Reads SUPABASE_DB_URL from .env.local or environment.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv() {
  const envPath = join(root, '.env.local');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnv();

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error('SUPABASE_DB_URL not set');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

await client.query(`create table if not exists public._migrations (
  name text primary key, applied_at timestamptz not null default now()
)`);

const dir = join(root, 'supabase', 'migrations');
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const { rows } = await client.query('select name from public._migrations');
const applied = new Set(rows.map((r) => r.name));

for (const file of files) {
  if (applied.has(file)) continue;
  const sql = readFileSync(join(dir, file), 'utf8');
  console.log(`Applying ${file}...`);
  try {
    await client.query('begin');
    await client.query(sql);
    await client.query('insert into public._migrations (name) values ($1)', [file]);
    await client.query('commit');
    console.log(`  OK`);
  } catch (e) {
    await client.query('rollback');
    console.error(`  FAILED: ${e.message}`);
    await client.end();
    process.exit(1);
  }
}
console.log('All migrations applied.');
await client.end();
