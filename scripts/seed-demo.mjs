// Seeds a demo temple/committee/program with realistic data and invites the
// platform admin's gmail as committee_admin, so the first login shows a
// working, populated program. Safe to re-run (wipes previous demo first).
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, '.env.local');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const URL = process.env.VITE_SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY;
const svc = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const OWNER_EMAIL = 'sajeevsahadev@gmail.com';

const TRIGGERED = ['income_entries', 'expenses', 'fund_transfers', 'coupon_books',
  'cash_handovers', 'committee_tasks', 'program_members', 'programs'];
const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
for (const t of TRIGGERED) await db.query(`alter table public.${t} disable trigger user`);
await db.query(`delete from public.organizations where name like '%(Demo)%'`);
await db.query(`delete from auth.users where email like 'demo-%@poorampay.test'`);
for (const t of TRIGGERED) await db.query(`alter table public.${t} enable trigger user`);
await db.end();

async function makeUser(email, name) {
  const password = 'Demo#' + Math.random().toString(36).slice(2, 10);
  const { data, error } = await svc.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: name },
  });
  if (error) throw error;
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: e2 } = await client.auth.signInWithPassword({ email, password });
  if (e2) throw e2;
  return { client, id: data.user.id };
}

const sec = await makeUser('demo-secretary@poorampay.test', 'Vijayan (Secretary)');
const col = await makeUser('demo-collector@poorampay.test', 'Ramesh (Collector)');
await sec.client.from('profiles').update({ phone: '9447000001' }).eq('id', sec.id);
await col.client.from('profiles').update({ phone: '9447000002' }).eq('id', col.id);

const { data: org } = await sec.client.from('organizations').insert({
  name: 'Sree Mahadeva Temple (Demo)', org_type: 'temple', place: 'Thrissur', created_by: sec.id,
}).select().single();
const { data: com } = await sec.client.from('committees').insert({
  organization_id: org.id, name: 'Pooram Celebration Committee', created_by: sec.id,
}).select().single();
const { data: prog } = await sec.client.from('programs').insert({
  committee_id: com.id, name: 'Pooram', year: 2026, opening_balance: 42000,
  weekly_amount: 200, total_weeks: 52, created_by: sec.id,
}).select().single();
const pid = prog.id;
console.log('demo program:', pid);

await sec.client.from('program_members').insert([
  { program_id: pid, email: OWNER_EMAIL, display_name: 'Sajeev (President)', role: 'committee_admin' },
  { program_id: pid, email: 'demo-collector@poorampay.test', display_name: 'Ramesh (Collector)', role: 'collector' },
]);

const { data: a1 } = await sec.client.from('areas').insert({ program_id: pid, name: 'Kizhakke Nada' }).select().single();
const { data: a2 } = await sec.client.from('areas').insert({ program_id: pid, name: 'Padinjare Nada' }).select().single();

const houseRows = [
  ['Puthenveedu', 'Raman Nair', a1.id, true], ['Kaithavalappil', 'Suresh Kumar', a1.id, true],
  ['Thekkeveedu', 'Lakshmi Amma', a1.id, false], ['Kannath House', 'Mohanan', a1.id, false],
  ['Vadakkeveedu', 'Divya Menon', a2.id, true], ['Puliyampilly', 'Krishnankutty', a2.id, true],
  ['Cherusseri', 'Baby John', a2.id, false], ['Mundakkal', 'Abdul Rasheed', a2.id, false],
].map(([name, owner, area_id, sub], i) => ({
  program_id: pid, area_id, name, owner_name: owner, in_subscription: sub, sort_order: i,
}));
const { data: houses } = await sec.client.from('houses').insert(houseRows).select();

// house collections by the collector
const hc = (house, amount, mode = 'cash') => ({
  program_id: pid, entry_type: 'house', amount, mode, house_id: house.id, area_id: house.area_id,
  payer_name: house.owner_name, collected_by: col.id, created_by: col.id,
});
await col.client.from('income_entries').insert([
  hc(houses[0], 1000), hc(houses[2], 500), hc(houses[3], 750, 'upi'), hc(houses[6], 300),
]).throwOnError();

// weekly subscription: weeks 1-3 for the subscription houses
const subHouses = houses.filter((h) => h.in_subscription);
const subs = [];
for (const h of subHouses) {
  for (let w = 1; w <= 3; w++) {
    subs.push({
      program_id: pid, entry_type: 'subscription', amount: 200, mode: 'cash', house_id: h.id,
      area_id: h.area_id, subscription_week: w, payer_name: h.owner_name,
      collected_by: col.id, created_by: col.id,
    });
  }
}
await col.client.from('income_entries').insert(subs).throwOnError();

// other income by the secretary
await sec.client.from('income_entries').insert([
  { program_id: pid, entry_type: 'donation', amount: 5000, mode: 'upi', payer_name: 'NRI Well-wisher', collected_by: sec.id, created_by: sec.id },
  { program_id: pid, entry_type: 'ad_brochure', amount: 3000, mode: 'bank', payer_name: 'Kumar Jewellers', collected_by: sec.id, created_by: sec.id },
  { program_id: pid, entry_type: 'ad_stage', amount: 7500, mode: 'bank', payer_name: 'City Motors', collected_by: sec.id, created_by: sec.id },
  { program_id: pid, entry_type: 'interest', amount: 1250, mode: 'bank', payer_name: 'SBI FD', collected_by: sec.id, created_by: sec.id },
]).throwOnError();

// coupons
const { data: scheme } = await sec.client.from('coupon_schemes').insert({
  program_id: pid, name: 'Pooram Prize Coupon', price: 500, total_coupons: 5000,
  coupons_per_book: 25, created_by: sec.id,
}).select().single();
const mkBook = (no, holder, phone) => ({
  scheme_id: scheme.id, program_id: pid, book_no: no, coupons_count: 25,
  holder_name: holder, holder_phone: phone, created_by: sec.id,
});
const { data: books } = await sec.client.from('coupon_books').insert([
  mkBook('B-001', 'Devi Stores', '9847012345'),
  mkBook('B-002', 'Sunil Kumar', '9946054321'),
  mkBook('B-003', 'Grameena Vayanasala', null),
]).select();
await col.client.rpc('record_coupon_remit', { p_book: books[0].id, p_amount: 5000, p_sold: 10, p_mode: 'cash' }).throwOnError();
await col.client.rpc('record_coupon_remit', { p_book: books[1].id, p_amount: 2500, p_sold: 8, p_mode: 'upi' }).throwOnError();

// expenses
const { data: heads } = await sec.client.from('expense_heads').select('*').eq('program_id', pid).order('sort_order');
const head = (name) => heads.find((h) => h.name === name).id;
await sec.client.from('expenses').insert([
  { program_id: pid, head_id: head('Programme cost'), kind: 'advance', amount: 25000, vendor_name: 'Ganamela Troupe (Kochi)', description: 'Advance for ganamela', mode: 'bank', status: 'paid', paid_at: new Date().toISOString(), paid_by: sec.id, created_by: sec.id },
  { program_id: pid, head_id: head('Police & licence'), kind: 'wallet', amount: 1500, description: 'Police clearance fee', mode: 'cash', status: 'paid', paid_at: new Date().toISOString(), paid_by: sec.id, created_by: sec.id },
]).throwOnError();
// pending claim from collector (owner can approve it in the app)
await col.client.from('expenses').insert({
  program_id: pid, head_id: head('Snacks & food'), kind: 'claim', amount: 850,
  description: 'Snacks for coupon distribution team', mode: 'cash', claimant: col.id,
  status: 'pending', created_by: col.id,
}).throwOnError();
// approved claim waiting to be paid
const { data: claim2 } = await col.client.from('expenses').insert({
  program_id: pid, head_id: head('Transportation'), kind: 'claim', amount: 1200,
  description: 'Auto for banner distribution', mode: 'cash', claimant: col.id,
  status: 'pending', created_by: col.id,
}).select().single();
await sec.client.rpc('approve_expense', { p_id: claim2.id, p_approve: true }).throwOnError();

// budget
await sec.client.from('budget_items').insert([
  { program_id: pid, side: 'income', income_type: 'house', planned: 150000 },
  { program_id: pid, side: 'income', income_type: 'coupon', planned: 250000 },
  { program_id: pid, side: 'income', income_type: 'subscription', planned: 80000 },
  { program_id: pid, side: 'income', income_type: 'ad_brochure', planned: 20000 },
  { program_id: pid, side: 'income', income_type: 'ad_stage', planned: 30000 },
  { program_id: pid, side: 'expense', head_id: head('Programme cost'), planned: 200000 },
  { program_id: pid, side: 'expense', head_id: head('Coupon prizes'), planned: 100000 },
  { program_id: pid, side: 'expense', head_id: head('Light & sound'), planned: 50000 },
  { program_id: pid, side: 'expense', head_id: head('Snacks & food'), planned: 15000 },
  { program_id: pid, side: 'expense', head_id: head('Transportation'), planned: 10000 },
  { program_id: pid, side: 'expense', head_id: head('Police & licence'), planned: 5000 },
]).throwOnError();

// tasks
const { data: mems } = await sec.client.from('program_members').select('*').eq('program_id', pid);
const secMem = mems.find((m) => m.email === 'demo-secretary@poorampay.test');
const colMem = mems.find((m) => m.email === 'demo-collector@poorampay.test');
await sec.client.from('committee_tasks').insert([
  { program_id: pid, title: 'Get police clearance', status: 'done', assignee_member_id: secMem.id, created_by: sec.id },
  { program_id: pid, title: 'Book light & sound', status: 'in_progress', assignee_member_id: secMem.id, due_date: '2026-08-15', created_by: sec.id },
  { program_id: pid, title: 'Distribute coupon books in Padinjare Nada', status: 'pending', assignee_member_id: colMem.id, due_date: '2026-08-01', created_by: sec.id },
]).throwOnError();

// a fund transfer and a pending cash handover for the owner to confirm
await sec.client.from('fund_transfers').insert({
  program_id: pid, direction: 'cash_to_bank', amount: 5000, notes: 'Deposited at SBI', created_by: sec.id,
}).throwOnError();
await col.client.rpc('create_handover', { p_program: pid }).throwOnError();

console.log('Demo seeded. Owner invite:', OWNER_EMAIL);
