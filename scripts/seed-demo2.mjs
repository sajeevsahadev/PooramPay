// Seeds a SECOND demo organization (a church) that the platform admin is NOT
// a member of — demonstrates superadmin oversight across organizations.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import pg from 'pg';

for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const URL = process.env.VITE_SUPABASE_URL;
const svc = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
const TRIGGERED = ['income_entries', 'expenses', 'fund_transfers', 'coupon_books',
  'cash_handovers', 'committee_tasks', 'program_members', 'programs'];
for (const t of TRIGGERED) await db.query(`alter table public.${t} disable trigger user`);
await db.query(`delete from public.organizations where name = 'St. George Church (Demo)'`);
await db.query(`delete from auth.users where email = 'demo2-convener@poorampay.test'`);
for (const t of TRIGGERED) await db.query(`alter table public.${t} enable trigger user`);
await db.end();

const password = 'Demo#' + Math.random().toString(36).slice(2, 10);
const { data: u, error } = await svc.auth.admin.createUser({
  email: 'demo2-convener@poorampay.test', password, email_confirm: true,
  user_metadata: { full_name: 'Thomas (Convener)' },
});
if (error) throw error;
const c = createClient(URL, process.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
await c.auth.signInWithPassword({ email: 'demo2-convener@poorampay.test', password });
await c.from('profiles').update({ phone: '9447000003' }).eq('id', u.user.id);

const { data: org } = await c.from('organizations').insert({
  name: 'St. George Church (Demo)', org_type: 'church', place: 'Angamaly', created_by: u.user.id,
}).select().single();
const { data: com } = await c.from('committees').insert({
  organization_id: org.id, name: 'Perunnal Committee', created_by: u.user.id,
}).select().single();
const { data: prog } = await c.from('programs').insert({
  committee_id: com.id, name: 'Perunnal', year: 2026, opening_balance: 15000, created_by: u.user.id,
}).select().single();

await c.from('income_entries').insert([
  { program_id: prog.id, entry_type: 'house', amount: 2000, mode: 'cash', payer_name: 'Kurian Veedu', collected_by: u.user.id, created_by: u.user.id },
  { program_id: prog.id, entry_type: 'donation', amount: 10000, mode: 'bank', payer_name: 'Parish council', collected_by: u.user.id, created_by: u.user.id },
  { program_id: prog.id, entry_type: 'ad_brochure', amount: 4000, mode: 'upi', payer_name: 'Angamaly Bakers', collected_by: u.user.id, created_by: u.user.id },
]).throwOnError();
const { data: heads } = await c.from('expense_heads').select('*').eq('program_id', prog.id);
await c.from('expenses').insert({
  program_id: prog.id, head_id: heads.find((h) => h.name === 'Light & sound').id,
  kind: 'wallet', amount: 8000, description: 'Stage lighting advance', mode: 'bank',
  status: 'paid', paid_at: new Date().toISOString(), paid_by: u.user.id, created_by: u.user.id,
}).throwOnError();
await c.from('budget_items').insert([
  { program_id: prog.id, side: 'income', income_type: 'house', planned: 100000 },
  { program_id: prog.id, side: 'expense', head_id: heads.find((h) => h.name === 'Programme cost').id, planned: 120000 },
]).throwOnError();

console.log('Second demo org seeded:', org.name, '→', prog.name, prog.year);
