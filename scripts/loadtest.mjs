// Load test: seed a dedicated program with a large register + millions of income
// rows (triggers disabled for speed), then EXPLAIN ANALYZE the hot queries to
// confirm they use indexes and stay fast at scale. Cleans up afterward.
import pg from 'pg';
import { readFileSync } from 'node:fs';

for (const l of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
c.on('error', (e) => console.error('pg error', e.message));
await c.connect();
await c.query(`set statement_timeout = '20min'`);

const TARGET = Number(process.argv[2] ?? 10_000_000);
const SIZE_CAP_MB = Number(process.argv[3] ?? 420);   // stay under free-tier storage
const BATCH = 1_000_000;
const HOUSES = 20_000;
const TRIGGERED = ['income_entries', 'programs', 'areas'];

async function dbMB() {
  const r = await c.query(`select pg_database_size(current_database())/1024/1024 as mb`);
  return Math.round(r.rows[0].mb);
}

// clean any prior run
async function wipe() {
  for (const t of TRIGGERED) await c.query(`alter table public.${t} disable trigger user`);
  await c.query(`delete from public.organizations where name = 'LOADTEST'`);
  for (const t of TRIGGERED) await c.query(`alter table public.${t} enable trigger user`);
}
await wipe();

const prof = await c.query(`select id from public.profiles order by created_at limit 1`);
const uid = prof.rows[0].id;

console.log('seeding structure...');
const org = (await c.query(
  `insert into public.organizations (name, org_type, created_by) values ('LOADTEST','other',$1) returning id`, [uid])).rows[0].id;
const com = (await c.query(
  `insert into public.committees (organization_id, name, created_by) values ($1,'LT',$2) returning id`, [org, uid])).rows[0].id;
await c.query(`alter table public.programs disable trigger user`);
const pid = (await c.query(
  `insert into public.programs (committee_id, name, year, created_by) values ($1,'LT',2026,$2) returning id`, [com, uid])).rows[0].id;
await c.query(`alter table public.programs enable trigger user`);
const area = (await c.query(
  `insert into public.areas (program_id, name) values ($1,'LT area') returning id`, [pid])).rows[0].id;

console.log(`seeding ${HOUSES} houses...`);
await c.query(`
  insert into public.houses (program_id, area_id, name, owner_name, phone, in_subscription)
  select $1, $2, 'House '||g, 'Owner '||g, '9'||lpad((g%1000000)::text,9,'0'), (g%3=0)
  from generate_series(1,$3) g`, [pid, area, HOUSES]);

// numbered temp table for a fast indexed house join during bulk insert
await c.query(`create temp table lt_h as
  select (row_number() over ())::int as idx, id, owner_name
  from public.houses where program_id = $1`, [pid]);
await c.query(`alter table lt_h add primary key (idx)`);

// disable triggers on income_entries for fast bulk load
await c.query(`alter table public.income_entries disable trigger user`);
const types = `array['house','house','house','subscription','coupon','donation','ad_brochure','interest']`;

let inserted = 0, receiptBase = 1;
const t0 = Date.now();
while (inserted < TARGET) {
  const n = Math.min(BATCH, TARGET - inserted);
  await c.query(`
    insert into public.income_entries
      (program_id, entry_type, amount, mode, entry_date, receipt_no, area_id, house_id,
       payer_name, collected_by, created_by, handed_over, created_at)
    select
      $1,
      (${types})[1 + floor(random()*8)::int],
      (50 + floor(random()*950))::numeric,
      (array['cash','cash','upi','bank'])[1+floor(random()*4)::int],
      current_date - (floor(random()*365))::int,
      $2 + g,
      $3,
      h.id,
      h.owner_name,
      $4, $4,
      (random() < 0.5),
      now() - (random()*365 || ' days')::interval
    from generate_series(1,$5) g
    join lt_h h on h.idx = 1 + (g % $6)`, [pid, receiptBase, area, uid, n, HOUSES]);
  inserted += n; receiptBase += n;
  const mb = await dbMB();
  console.log(`  inserted ${inserted.toLocaleString()} rows · db ${mb} MB · ${Math.round((Date.now()-t0)/1000)}s`);
  if (mb >= SIZE_CAP_MB) { console.log(`  reached size cap (${mb} MB) — stopping seed`); break; }
}
await c.query(`alter table public.income_entries enable trigger user`);

console.log('ANALYZE...');
await c.query(`analyze public.income_entries`);
await c.query(`analyze public.houses`);

const total = (await c.query(`select count(*)::bigint n from public.income_entries where program_id=$1`, [pid])).rows[0].n;
console.log(`\n==== income_entries in load program: ${Number(total).toLocaleString()} ====`);
console.log(`total income_entries table: ${(await c.query(`select count(*)::bigint n from public.income_entries`)).rows[0].n}`);
console.log(`db size: ${await dbMB()} MB\n`);

async function plan(label, sql, params = []) {
  const r = await c.query(`explain (analyze, buffers, format json) ${sql}`, params);
  const p = r.rows[0]['QUERY PLAN'][0];
  const exec = p['Execution Time'];
  // detect any seq scan in the plan tree
  let seq = false;
  (function walk(node) { if (!node) return; if (String(node['Node Type']).includes('Seq Scan')) seq = true;
    (node.Plans || []).forEach(walk); })(p.Plan);
  console.log(`${label}\n  exec: ${exec.toFixed(1)} ms · ${seq ? '⚠ SEQ SCAN' : '✓ index only/scan'}`);
  return { exec, seq };
}

console.log('==== EXPLAIN ANALYZE hot queries (scoped to the load program) ====');
await plan('Dashboard finance (v_program_finance)',
  `select * from public.v_program_finance where program_id = $1`, [pid]);
await plan('Report income-by-type (v_income_by_type)',
  `select * from public.v_income_by_type where program_id = $1`, [pid]);
await plan('Transactions page (newest 200)',
  `select * from public.income_entries where program_id=$1 and deleted_at is null order by created_at desc limit 200`, [pid]);
await plan('Register paid-set (distinct house_id)',
  `select distinct house_id from public.income_entries where program_id=$1 and house_id is not null and deleted_at is null`, [pid]);
await plan('Dashboard 14-day sparkline (v_income_by_day)',
  `select * from public.v_income_by_day where program_id=$1 and entry_date >= current_date - 13`, [pid]);
await plan('Collector cash-in-hand (v_my_cash)',
  `select * from public.v_my_cash where program_id=$1 and collected_by=$2`, [pid, uid]);

console.log('\ncleaning up load-test data...');
for (const t of TRIGGERED) await c.query(`alter table public.${t} disable trigger user`);
await c.query(`alter table public.income_entries disable trigger user`);
await c.query(`delete from public.organizations where id = $1`, [org]);
await c.query(`alter table public.income_entries enable trigger user`);
for (const t of TRIGGERED) await c.query(`alter table public.${t} enable trigger user`);
await c.query(`analyze public.income_entries`);
console.log(`done. db size back to ${await dbMB()} MB`);
await c.end();
