import pg from 'pg';
import { readFileSync } from 'node:fs';
for (const l of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const size = await c.query(`select pg_size_pretty(pg_database_size(current_database())) as db`);
const inc = await c.query(`select count(*)::bigint as n from public.income_entries`);
const houses = await c.query(`select count(*)::bigint as n from public.houses`);
const big = await c.query(`
  select relname, pg_size_pretty(pg_total_relation_size(c.oid)) as total
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r'
  order by pg_total_relation_size(c.oid) desc limit 6`);
console.log('DB size:', size.rows[0].db);
console.log('income_entries rows:', inc.rows[0].n, '| houses:', houses.rows[0].n);
console.table(big.rows);
await c.end();
