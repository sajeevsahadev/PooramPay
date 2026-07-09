// Seeds 1M income rows, then compares OLD global-aggregate views vs NEW
// program-scoped functions on the hot queries, checks the finance numbers
// match, and cleans up (VACUUM FULL) afterward.
import pg from 'pg';
import { readFileSync } from 'node:fs';
for (const l of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
await c.query(`set statement_timeout = '20min'`);
const N = 1_000_000, HOUSES = 20_000;
const TRIG = ['income_entries', 'programs', 'areas'];

async function wipe() {
  for (const t of TRIG) await c.query(`alter table public.${t} disable trigger user`);
  await c.query(`delete from public.organizations where name = 'LOADTEST2'`);
  for (const t of TRIG) await c.query(`alter table public.${t} enable trigger user`);
}
await wipe();
const uid = (await c.query(`select id from public.profiles order by created_at limit 1`)).rows[0].id;
const org = (await c.query(`insert into public.organizations (name,org_type,created_by) values ('LOADTEST2','other',$1) returning id`, [uid])).rows[0].id;
const com = (await c.query(`insert into public.committees (organization_id,name,created_by) values ($1,'LT',$2) returning id`, [org, uid])).rows[0].id;
await c.query(`alter table public.programs disable trigger user`);
const pid = (await c.query(`insert into public.programs (committee_id,name,year,created_by) values ($1,'LT',2026,$2) returning id`, [com, uid])).rows[0].id;
await c.query(`alter table public.programs enable trigger user`);
const area = (await c.query(`insert into public.areas (program_id,name) values ($1,'a') returning id`, [pid])).rows[0].id;
await c.query(`insert into public.houses (program_id,area_id,name,owner_name,in_subscription)
  select $1,$2,'H'||g,'O'||g,(g%3=0) from generate_series(1,$3) g`, [pid, area, HOUSES]);
await c.query(`create temp table lt as select (row_number() over())::int idx, id, owner_name from public.houses where program_id=$1`, [pid]);
await c.query(`alter table lt add primary key(idx)`);

console.log(`seeding ${N.toLocaleString()} income rows...`);
await c.query(`alter table public.income_entries disable trigger user`);
await c.query(`
  insert into public.income_entries
    (program_id,entry_type,amount,mode,entry_date,receipt_no,area_id,house_id,payer_name,collected_by,created_by,handed_over,created_at)
  select $1,
    (array['house','house','house','subscription','coupon','donation','ad_brochure','interest'])[1+floor(random()*8)::int],
    (50+floor(random()*950))::numeric,
    (array['cash','cash','upi','bank'])[1+floor(random()*4)::int],
    current_date-(floor(random()*365))::int, g, $2, h.id, h.owner_name, $3, $3,
    (random()<0.5), now()-(random()*365||' days')::interval
  from generate_series(1,$4) g join lt h on h.idx = 1+(g % $5)`, [pid, area, uid, N, HOUSES]);
await c.query(`alter table public.income_entries enable trigger user`);
await c.query(`analyze public.income_entries`);
console.log('seeded. db:', (await c.query(`select pg_size_pretty(pg_database_size(current_database())) s`)).rows[0].s, '\n');

async function ms(sql, params) {
  const r = await c.query(`explain (analyze, format json) ${sql}`, params);
  return r.rows[0]['QUERY PLAN'][0]['Execution Time'];
}
async function cmp(label, oldSql, newSql, p) {
  const o = await ms(oldSql, p), n = await ms(newSql, p);
  console.log(`${label}\n   OLD view: ${o.toFixed(0)} ms   →   NEW fn: ${n.toFixed(1)} ms   (${(o/n).toFixed(0)}x faster)`);
}

console.log('==== OLD view vs NEW function (1M rows in one program) ====');
await cmp('Dashboard finance',
  `select * from public.v_program_finance where program_id=$1`,
  `select * from public.program_finance($1)`, [pid]);
await cmp('Income by type',
  `select * from public.v_income_by_type where program_id=$1`,
  `select * from public.income_by_type($1)`, [pid]);
await cmp('14-day sparkline',
  `select * from public.v_income_by_day where program_id=$1 and entry_date>=current_date-13`,
  `select * from public.income_by_day($1, current_date-13)`, [pid]);
await cmp('Cash-in-hand',
  `select * from public.v_my_cash where program_id=$1 and collected_by=$2`,
  `select public.program_my_cash($1,$2)`, [pid, uid]);

// correctness: the function totals must equal the view totals
const v = (await c.query(`select income_total, cash_balance, bank_balance from public.v_program_finance where program_id=$1`, [pid])).rows[0];
const f = (await c.query(`select income_total, cash_balance, bank_balance from public.program_finance($1)`, [pid])).rows[0];
const same = Number(v.income_total)===Number(f.income_total) && Number(v.cash_balance)===Number(f.cash_balance) && Number(v.bank_balance)===Number(f.bank_balance);
console.log(`\ncorrectness (function == view): ${same ? '✓ identical' : '✗ MISMATCH ' + JSON.stringify({v,f})}`);

console.log('\ncleaning up + VACUUM FULL...');
for (const t of TRIG) await c.query(`alter table public.${t} disable trigger user`);
await c.query(`alter table public.income_entries disable trigger user`);
await c.query(`delete from public.organizations where id=$1`, [org]);
await c.query(`alter table public.income_entries enable trigger user`);
for (const t of TRIG) await c.query(`alter table public.${t} enable trigger user`);
await c.query(`vacuum full public.income_entries`);
await c.query(`vacuum full public.houses`);
console.log('db back to:', (await c.query(`select pg_size_pretty(pg_database_size(current_database())) s`)).rows[0].s);
await c.end();
