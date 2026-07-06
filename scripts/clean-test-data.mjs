// Removes e2e test data (orgs starting with E2E/DBG and e2e-* users).
import pg from 'pg';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, '.env.local');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const TRIGGERED = ['income_entries', 'expenses', 'fund_transfers', 'coupon_books',
  'cash_handovers', 'committee_tasks', 'program_members', 'programs'];
const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
for (const t of TRIGGERED) await db.query(`alter table public.${t} disable trigger user`);
await db.query(`delete from public.organizations where name like 'E2E%' or name like 'DBG%'`);
await db.query(`delete from auth.users where email like 'e2e-%@poorampay.test'`);
for (const t of TRIGGERED) await db.query(`alter table public.${t} enable trigger user`);
await db.end();
console.log('test data cleaned');
