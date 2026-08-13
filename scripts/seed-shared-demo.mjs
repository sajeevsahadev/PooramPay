// Seeds ONE shared demo club (is_demo) with rich sample data so new users can
// explore a fully-populated app. Idempotent: does nothing if a demo already
// exists. Run against the target DB:  node scripts/seed-shared-demo.mjs
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

const root = 'D:/AI/Pal';
if (existsSync(join(root, '.env.local')))
  for (const line of readFileSync(join(root, '.env.local'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
const one = async (s, a = []) => (await db.query(s, a)).rows[0];
const run = (s, a = []) => db.query(s, a);

const existing = await one("select id from public.programs where is_demo limit 1");
if (existing) { console.log('Demo already exists:', existing.id, '— nothing to do.'); await db.end(); process.exit(0); }

const owner = await one("select id from public.profiles where is_platform_admin order by created_at limit 1");
if (!owner) { console.error('No platform-admin profile found; sign in once, then re-run.'); await db.end(); process.exit(1); }
const OWNER = owner.id;

const org = await one(
  `insert into public.organizations (name, org_type, country, state, district, place, is_demo, created_by)
   values ('Sree Maheswara Pooram Committee (Demo)','temple','India','Kerala','Thrissur','Vadakkunnathan', true, $1)
   returning id`, [OWNER]);
const com = await one(
  `insert into public.committees (organization_id, name, description, created_by)
   values ($1,'Pooram Committee 2026 (Demo)','Sample committee to explore PooramPay', $2) returning id`, [org.id, OWNER]);
const prog = await one(
  `insert into public.programs (committee_id, name, year, opening_balance, weekly_amount, total_weeks, unit_label, is_demo, created_by)
   values ($1,'Thrissur Pooram 2026 (Demo)',2026,25000,100,20,'house', true, $2) returning id`, [com.id, OWNER]);
const P = prog.id;

// committee members (pending invites — show the team roster)
for (const [email, name, tier] of [
  ['ravi.president@demo.poorampay.com', 'Ravi Menon', 'admin'],
  ['priya.secretary@demo.poorampay.com', 'Priya Nair', 'admin'],
  ['kumar.treasurer@demo.poorampay.com', 'Kumar Pillai', 'admin'],
  ['aneesh.member@demo.poorampay.com', 'Aneesh Kumar', 'own'],
  ['deepa.volunteer@demo.poorampay.com', 'Deepa Raj', 'released'],
]) await run(`insert into public.committee_members (committee_id, email, display_name, tier) values ($1,$2,$3,$4)
             on conflict (committee_id, email) do nothing`, [com.id, email, name, tier]);

const heads = Object.fromEntries((await db.query(
  "select id, name from public.expense_heads where program_id=$1", [P])).rows.map((r) => [r.name, r.id]));

// areas + houses
const areas = {};
for (const a of ['Ward 1 – Temple Road', 'Ward 2 – Market Side', 'Ward 3 – Riverside']) {
  areas[a] = (await one("insert into public.areas (program_id, name) values ($1,$2) returning id", [P, a])).id;
}
const areaIds = Object.values(areas);
const HOUSES = [
  ['Puthenveedu', 'Raman Nair', '9847012301', 0, true], ['Kaithavalappil', 'Suresh Kumar', '9946054302', 0, true],
  ['Cherukara', 'Latha Devi', '9847012303', 0, false], ['Mangalath', 'Vijayan P', '9847012304', 1, true],
  ['Thekkedath', 'Anil Menon', '9946054305', 1, false], ['Vadakkedath', 'Geetha R', '9847012306', 1, true],
  ['Pallichira', 'Mohanan K', '9847012307', 2, true], ['Kunnath', 'Sindhu S', '9946054308', 2, false],
  ['Ambady', 'Rajesh V', '9847012309', 2, true], ['Illikkal', 'Nisha Thomas', '9847012310', 0, false],
  ['Cheruvath', 'Biju Paul', '9946054311', 1, true], ['Nedumpally', 'Asha Kurian', '9847012312', 2, true],
];
const houseIds = [];
for (const [name, owner_name, phone, ai, sub] of HOUSES) {
  const h = await one(`insert into public.houses (program_id, area_id, name, owner_name, phone, in_subscription)
    values ($1,$2,$3,$4,$5,$6) returning id`, [P, areaIds[ai], name, owner_name, phone, sub]);
  houseIds.push(h.id);
}

// income — house collections, coupons, subscriptions, donation, interest, ads
const inc = async (type, amount, mode, date, opts = {}) => run(
  `insert into public.income_entries (program_id, entry_type, amount, mode, entry_date, house_id, area_id, payer_name, subscription_week, collected_by, created_by)
   values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)`,
  [P, type, amount, mode, date, opts.house ?? null, opts.area ?? null, opts.payer ?? null, opts.week ?? null, OWNER]);
let d = 5;
for (let i = 0; i < 8; i++) await inc('house', 200 + i * 50, i % 3 ? 'cash' : 'upi', `2026-07-0${(d++ % 9) + 1}`,
  { house: houseIds[i], area: areaIds[HOUSES[i][3]] });
for (let i = 0; i < 4; i++) await inc('subscription', 100, 'cash', `2026-07-1${i}`, { house: houseIds[i], area: areaIds[HOUSES[i][3]], week: i + 1 });
await inc('donation', 5000, 'bank', '2026-07-08', { payer: 'Sri. Gopalakrishnan (Well-wisher)' });
await inc('donation', 2500, 'upi', '2026-07-12', { payer: 'Thrissur Merchants Assoc.' });
await inc('interest', 1200, 'bank', '2026-07-15');
await inc('ad_brochure', 3000, 'upi', '2026-07-18', { payer: 'Kalyan Silks' });
await inc('ad_stage', 4000, 'bank', '2026-07-20', { payer: 'Lulu Mall' });

// expenses — various heads & statuses
const exp = async (head, kind, amount, status, date, desc, vendor) => run(
  `insert into public.expenses (program_id, head_id, kind, amount, expense_date, description, vendor_name, mode, claimant, status, approved_by, approved_at, paid_by, paid_at, created_by)
   values ($1,$2,$3,$4,$5,$6,$7,'cash',$8,$9,$10,$11,$10,$11,$8)`,
  [P, heads[head], kind, amount, date, desc, vendor,
   OWNER, status, ['approved', 'paid'].includes(status) ? OWNER : null, ['approved', 'paid'].includes(status) ? new Date(date).toISOString() : null]);
await exp('Programme cost', 'wallet', 12000, 'paid', '2026-07-10', 'Melam advance', 'Peruvanam Kuttan Marar');
await exp('Light & sound', 'wallet', 8000, 'paid', '2026-07-14', 'Stage lighting', 'Bright Sound & Light');
await exp('Coupon prizes', 'wallet', 6000, 'paid', '2026-07-16', 'First prize – gold coin', 'Alukkas Jewellery');
await exp('Snacks & food', 'claim', 3500, 'approved', '2026-07-19', 'Volunteers lunch', 'Hotel Bharath');
await exp('Consumables', 'claim', 1800, 'pending', '2026-07-21', 'Flowers & decoration', 'Krishna Flowers');
await exp('Police & licence', 'wallet', 2500, 'paid', '2026-07-11', 'Event permit fee', 'Municipality');

// coupons
const scheme = await one(
  `insert into public.coupon_schemes (program_id, name, price, total_coupons, coupons_per_book, created_by)
   values ($1,'Pooram Grand Draw 2026',50,500,25,$2) returning id`, [P, OWNER]);
for (const [no, holder, sold] of [['B-001', 'Ravi Menon', 25], ['B-002', 'Priya Nair', 18], ['B-003', 'Aneesh Kumar', 10]])
  await run(`insert into public.coupon_books (scheme_id, program_id, book_no, coupons_count, holder_name, sold_count, created_by)
    values ($1,$2,$3,25,$4,$5,$6)`, [scheme.id, P, no, holder, sold, OWNER]);

// budget
for (const [side, type, head, planned] of [
  ['income', 'house', null, 40000], ['income', 'coupon', null, 25000], ['income', 'donation', null, 15000],
  ['expense', null, 'Programme cost', 30000], ['expense', null, 'Light & sound', 12000], ['expense', null, 'Coupon prizes', 10000]])
  await run(`insert into public.budget_items (program_id, side, income_type, head_id, planned) values ($1,$2,$3,$4,$5)`,
    [P, side, type, head ? heads[head] : null, planned]);

// tasks
for (const [title, status] of [['Book the elephants & melam', 'done'], ['Print coupon books', 'in_progress'], ['Arrange stage & lighting', 'pending']])
  await run(`insert into public.committee_tasks (program_id, title, status, created_by) values ($1,$2,$3,$4)`, [P, title, status, OWNER]);

console.log('Seeded shared demo program', P, 'under org', org.id);
await db.end();
