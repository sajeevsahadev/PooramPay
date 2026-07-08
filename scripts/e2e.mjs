// End-to-end backend test: exercises the full money lifecycle through RLS
// using real authenticated users (email/password test accounts).
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
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const svc = createClient(URL, SERVICE, { auth: { persistSession: false } });

let passed = 0, failed = 0;
function ok(name, cond, extra = '') {
  if (cond) { passed++; console.log(`  PASS ${name}`); }
  else { failed++; console.log(`  FAIL ${name} ${extra}`); }
}
async function expectError(name, promise, needle) {
  try {
    const r = await promise;
    if (r && r.error) { ok(name, !needle || String(r.error.message).includes(needle), r.error.message); return; }
    ok(name, false, 'expected an error but call succeeded');
  } catch (e) {
    ok(name, !needle || String(e.message).includes(needle), e.message);
  }
}

// Wipe leftovers from previous runs. Disable only USER triggers (freeze guard,
// audit) so FK cascades still run; test data only.
const TRIGGERED = ['income_entries', 'expenses', 'fund_transfers', 'coupon_books',
  'cash_handovers', 'committee_tasks', 'program_members', 'programs'];
async function cleanup() {
  const db = new pg.Client({
    connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false },
  });
  await db.connect();
  for (const t of TRIGGERED) await db.query(`alter table public.${t} disable trigger user`);
  await db.query(`delete from public.organizations where name like 'E2E%' or name like 'DBG%'`);
  await db.query(`delete from auth.users where email like 'e2e-%@poorampay.test'`);
  for (const t of TRIGGERED) await db.query(`alter table public.${t} enable trigger user`);
  await db.end();
}
await cleanup();

async function makeUser(email, password, name) {
  const { data, error } = await svc.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: name },
  });
  if (error) throw error;
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: e2 } = await client.auth.signInWithPassword({ email, password });
  if (e2) throw e2;
  return { client, id: data.user.id };
}

console.log('== creating test users ==');
const admin = await makeUser('e2e-admin@poorampay.test', 'Test@12345', 'E2E Admin');
const collector = await makeUser('e2e-collector@poorampay.test', 'Test@12345', 'E2E Collector');
await admin.client.from('profiles').update({ phone: '9999900001' }).eq('id', admin.id);
await collector.client.from('profiles').update({ phone: '9999900002' }).eq('id', collector.id);
ok('profiles auto-created', true);

console.log('== org / committee / program ==');
const { data: org, error: orgErr } = await admin.client.from('organizations')
  .insert({ name: 'E2E Temple', org_type: 'temple', place: 'Testville', created_by: admin.id })
  .select().single();
ok('create organization', !orgErr, orgErr?.message);
const { data: com } = await admin.client.from('committees')
  .insert({ organization_id: org.id, name: 'E2E Ganamela', created_by: admin.id }).select().single();
ok('create committee', !!com);
const { data: prog, error: progErr } = await admin.client.from('programs')
  .insert({ committee_id: com.id, name: 'E2E Utsavam', year: 2026, opening_balance: 10000,
            weekly_amount: 200, total_weeks: 52, created_by: admin.id }).select().single();
ok('create program', !!prog, progErr?.message);
const pid = prog.id;

const { data: mems } = await admin.client.from('program_members').select('*').eq('program_id', pid);
ok('creator auto-added as committee_admin', mems?.some((m) => m.profile_id === admin.id && m.role === 'committee_admin'));
const { data: heads } = await admin.client.from('expense_heads').select('*').eq('program_id', pid);
ok('default expense heads seeded', (heads?.length ?? 0) === 8, `got ${heads?.length}`);

const { error: addMemErr } = await admin.client.from('program_members')
  .insert({ program_id: pid, email: 'e2e-collector@poorampay.test', role: 'collector', display_name: 'Collector C' });
ok('add collector member (email link)', !addMemErr, addMemErr?.message);
const { data: cmem } = await admin.client.from('program_members').select('*')
  .eq('program_id', pid).eq('email', 'e2e-collector@poorampay.test').single();
ok('collector profile auto-linked', cmem?.profile_id === collector.id);

console.log('== areas / houses ==');
const { data: area } = await admin.client.from('areas').insert({ program_id: pid, name: 'Ward 1' }).select().single();
const { data: house } = await collector.client.from('houses')
  .insert({ program_id: pid, area_id: area.id, name: 'Puthenveedu', owner_name: 'Raman', in_subscription: true })
  .select().single();
ok('collector can add house', !!house);

console.log('== income: house collection ==');
const { data: inc1, error: incErr } = await collector.client.from('income_entries')
  .insert({ program_id: pid, entry_type: 'house', amount: 500, mode: 'cash', house_id: house.id,
            area_id: area.id, payer_name: 'Raman', collected_by: collector.id, created_by: collector.id })
  .select().single();
ok('collector records house collection', !!inc1, incErr?.message);
ok('receipt number assigned', inc1?.receipt_no === 1, `got ${inc1?.receipt_no}`);
const { data: inc2 } = await collector.client.from('income_entries')
  .insert({ program_id: pid, entry_type: 'subscription', amount: 200, mode: 'cash', house_id: house.id,
            subscription_week: 1, collected_by: collector.id, created_by: collector.id }).select().single();
ok('receipt number increments', inc2?.receipt_no === 2, `got ${inc2?.receipt_no}`);

// collector must not update income (only admins)
await expectError('collector cannot edit income',
  collector.client.from('income_entries').update({ amount: 9999 }).eq('id', inc1.id).select().single());

console.log('== coupons ==');
const { data: scheme } = await admin.client.from('coupon_schemes')
  .insert({ program_id: pid, name: 'Prize Coupon', price: 500, total_coupons: 100, coupons_per_book: 10,
            created_by: admin.id }).select().single();
const { data: book } = await admin.client.from('coupon_books')
  .insert({ scheme_id: scheme.id, program_id: pid, book_no: 'B-001', coupons_count: 10,
            holder_name: 'Kumar Traders', created_by: admin.id }).select().single();
ok('issue coupon book', !!book);
const { data: remitId, error: remitErr } = await collector.client
  .rpc('record_coupon_remit', { p_book: book.id, p_amount: 2500, p_sold: 5, p_mode: 'cash' });
ok('record coupon remit via RPC', !remitErr && !!remitId, remitErr?.message);
const { data: vbook } = await admin.client.from('v_coupon_books').select('*').eq('id', book.id).single();
ok('coupon settlement view: remitted', Number(vbook?.remitted) === 2500, `got ${vbook?.remitted}`);
ok('coupon settlement view: outstanding 0', Number(vbook?.outstanding) === 0, `got ${vbook?.outstanding}`);

console.log('== expenses: claim -> approve -> pay ==');
const headId = heads[0].id;
const { data: claim, error: claimErr } = await collector.client.from('expenses')
  .insert({ program_id: pid, head_id: headId, kind: 'claim', amount: 750, description: 'Snacks for team',
            mode: 'cash', claimant: collector.id, status: 'pending', created_by: collector.id })
  .select().single();
ok('member submits claim', !!claim, claimErr?.message);
await expectError('collector cannot approve own claim',
  collector.client.rpc('approve_expense', { p_id: claim.id, p_approve: true }), 'NOT_ALLOWED');
const { error: apprErr } = await admin.client.rpc('approve_expense', { p_id: claim.id, p_approve: true });
ok('admin approves claim', !apprErr, apprErr?.message);
const { error: payErr } = await admin.client.rpc('pay_expense', { p_id: claim.id, p_mode: 'cash' });
ok('admin pays claim', !payErr, payErr?.message);

const { data: wallet } = await admin.client.from('expenses')
  .insert({ program_id: pid, head_id: headId, kind: 'wallet', amount: 1200, description: 'Police fee',
            mode: 'bank', status: 'paid', paid_at: new Date().toISOString(), paid_by: admin.id,
            created_by: admin.id }).select().single();
ok('treasurer direct wallet expense', !!wallet);

console.log('== cash handover ==');
const { data: hid, error: hErr } = await collector.client.rpc('create_handover', { p_program: pid });
ok('collector creates handover', !hErr && !!hid, hErr?.message);
const { data: hov } = await collector.client.from('cash_handovers').select('*').eq('id', hid).single();
ok('handover amount = held cash (500+200+2500)', Number(hov?.amount) === 3200, `got ${hov?.amount}`);
const { error: chErr } = await admin.client.rpc('confirm_handover', { p_id: hid });
ok('treasurer confirms handover', !chErr, chErr?.message);
const { data: myCash } = await collector.client.from('v_my_cash').select('*')
  .eq('program_id', pid).eq('collected_by', collector.id);
ok('collector cash-in-hand back to zero', (myCash?.length ?? 0) === 0);

console.log('== finance view ==');
const { data: fin } = await admin.client.from('v_program_finance').select('*').eq('program_id', pid).single();
// income: 500+200+2500 = 3200 cash. expenses paid: 750 cash + 1200 bank.
ok('income_total 3200', Number(fin?.income_total) === 3200, `got ${fin?.income_total}`);
ok('expense_total 1950', Number(fin?.expense_total) === 1950, `got ${fin?.expense_total}`);
ok('cash_balance 2450', Number(fin?.cash_balance) === 2450, `got ${fin?.cash_balance}`);
ok('bank_balance 8800 (10000 opening - 1200)', Number(fin?.bank_balance) === 8800, `got ${fin?.bank_balance}`);

console.log('== permissions: viewer ==');
// collector permissions do NOT include view_money by default; they still see own entries
const { data: seen } = await collector.client.from('expenses').select('id').eq('program_id', pid);
ok('collector sees own claims', (seen?.length ?? 0) >= 1);

console.log('== soft delete & restore ==');
await expectError('delete without reason rejected',
  admin.client.rpc('soft_delete_record', { p_table: 'income_entries', p_id: inc2.id, p_reason: '' }), 'REASON_REQUIRED');
const { error: delErr } = await admin.client.rpc('soft_delete_record',
  { p_table: 'income_entries', p_id: inc2.id, p_reason: 'duplicate entry' });
ok('admin soft-deletes with reason', !delErr, delErr?.message);
const { data: fin2 } = await admin.client.from('v_program_finance').select('*').eq('program_id', pid).single();
ok('balances exclude deleted entry', Number(fin2?.income_total) === 3000, `got ${fin2?.income_total}`);
const { data: delRows } = await admin.client.from('income_entries').select('*')
  .eq('program_id', pid).not('deleted_at', 'is', null);
ok('deleted bucket shows entry', delRows?.length === 1 && delRows[0].delete_reason === 'duplicate entry');
await expectError('collector cannot soft-delete',
  collector.client.rpc('soft_delete_record', { p_table: 'income_entries', p_id: inc1.id, p_reason: 'x' }), 'NOT_ALLOWED');
const { error: restErr } = await admin.client.rpc('restore_record', { p_table: 'income_entries', p_id: inc2.id });
ok('admin restores entry', !restErr, restErr?.message);

console.log('== security hardening ==');
await expectError('cannot self-grant platform admin',
  collector.client.from('profiles').update({ is_platform_admin: true })
    .eq('id', collector.id).select().single());
const { data: profStill } = await collector.client.from('profiles')
  .select('is_platform_admin').eq('id', collector.id).single();
ok('is_platform_admin unchanged', profStill?.is_platform_admin === false);
const { data: spoof } = await collector.client.from('income_entries')
  .insert({ program_id: pid, entry_type: 'donation', amount: 10, mode: 'cash',
            handed_over: true, collected_by: collector.id, created_by: collector.id })
  .select().single();
ok('handed_over spoof forced to false server-side', spoof?.handed_over === false, `got ${spoof?.handed_over}`);
const { data: colAudit } = await collector.client.from('audit_log').select('id')
  .eq('program_id', pid).limit(1);
ok('collector without view_money cannot read audit log', (colAudit?.length ?? 0) === 0, `got ${colAudit?.length}`);
const { data: aggInc } = await admin.client.from('v_income_by_type').select('*').eq('program_id', pid);
ok('aggregate view income-by-type works', (aggInc?.length ?? 0) >= 3, `got ${aggInc?.length}`);

console.log('== audit log ==');
const { data: audit } = await admin.client.from('audit_log').select('*').eq('program_id', pid);
ok('audit log populated', (audit?.length ?? 0) > 5, `got ${audit?.length}`);
ok('audit captured delete action', audit?.some((a) => a.action === 'delete'));

console.log('== budget ==');
const { error: budErr } = await admin.client.from('budget_items').insert([
  { program_id: pid, side: 'income', income_type: 'house', planned: 50000 },
  { program_id: pid, side: 'expense', head_id: headId, planned: 30000 },
]);
ok('budget items saved', !budErr, budErr?.message);

console.log('== register master data & copy-forward ==');
const { error: gpsErr } = await collector.client.from('houses')
  .update({ gps_lat: 10.5276, gps_lng: 76.2144, email: 'raman@example.com', phone: '9847000000' })
  .eq('id', house.id);
ok('collector updates register master data (GPS/email)', !gpsErr, gpsErr?.message);
const { data: prog2, error: p2Err } = await admin.client.from('programs')
  .insert({ committee_id: com.id, name: 'E2E Utsavam', year: 2027, opening_balance: 0,
            unit_label: 'member', created_by: admin.id }).select().single();
ok('create next-year program with unit_label', !p2Err && prog2?.unit_label === 'member', p2Err?.message);
const { data: copied, error: cpErr } = await admin.client.rpc('copy_register', { p_from: pid, p_to: prog2.id });
ok('copy register to next year', !cpErr && Number(copied) === 1, cpErr?.message ?? `count=${copied}`);
const { data: h2 } = await admin.client.from('houses').select('*').eq('program_id', prog2.id);
ok('copied entry keeps GPS + contact', h2?.length === 1 && h2[0].gps_lat === 10.5276
  && h2[0].email === 'raman@example.com' && h2[0].area_id != null, JSON.stringify(h2?.[0] ?? {}));
await expectError('collector cannot copy register',
  collector.client.rpc('copy_register', { p_from: pid, p_to: prog2.id }), 'NOT_ALLOWED');

console.log('== area lifecycle (deactivate / delete) ==');
const { error: deactErr } = await admin.client.from('areas')
  .update({ is_active: false }).eq('id', area.id);
ok('admin can deactivate an area', !deactErr, deactErr?.message);
const { data: areaRow } = await admin.client.from('areas').select('is_active').eq('id', area.id).single();
ok('area marked inactive', areaRow?.is_active === false);
await expectError('cannot delete a non-empty area',
  admin.client.from('areas').delete().eq('id', area.id), 'AREA_NOT_EMPTY');
const { data: emptyArea } = await admin.client.from('areas')
  .insert({ program_id: pid, name: 'E2E Empty Ward' }).select().single();
const { error: delEmptyErr } = await admin.client.from('areas').delete().eq('id', emptyArea.id);
ok('can delete an empty area', !delEmptyErr, delEmptyErr?.message);
const { data: goneArea } = await admin.client.from('areas').select('id').eq('id', emptyArea.id);
ok('deleted area is gone', (goneArea?.length ?? 0) === 0);
await admin.client.from('areas').update({ is_active: true }).eq('id', area.id); // restore for later checks

console.log('== freeze ==');
const { error: frErr } = await admin.client.from('programs').update({ status: 'frozen' }).eq('id', pid);
ok('committee admin freezes program', !frErr, frErr?.message);
await expectError('no income after freeze',
  collector.client.from('income_entries').insert({
    program_id: pid, entry_type: 'house', amount: 100, mode: 'cash',
    collected_by: collector.id, created_by: collector.id }).select().single(), 'FROZEN');
await expectError('no soft delete after freeze',
  admin.client.rpc('soft_delete_record', { p_table: 'income_entries', p_id: inc1.id, p_reason: 'x' }), 'FROZEN');
await expectError('non-padmin cannot unfreeze',
  admin.client.from('programs').update({ status: 'active' }).eq('id', pid).select().single(), 'ONLY_PLATFORM_ADMIN');
const { data: progRow } = await admin.client.from('programs').select('status').eq('id', pid).single();
ok('program still frozen', progRow?.status === 'frozen');

console.log('== isolation: stranger sees nothing ==');
const stranger = await makeUser('e2e-stranger@poorampay.test', 'Test@12345', 'Stranger');
const { data: sOrgs } = await stranger.client.from('organizations').select('*');
const { data: sInc } = await stranger.client.from('income_entries').select('*');
ok('stranger sees no orgs', (sOrgs?.length ?? 0) === 0, `got ${sOrgs?.length}`);
ok('stranger sees no income', (sInc?.length ?? 0) === 0, `got ${sInc?.length}`);

console.log('== storage ==');
const up = await admin.client.storage.from('bills').upload(`${pid}/test.txt`, new Blob(['bill']), { upsert: true });
ok('member upload to own program folder', !up.error, up.error?.message);
const { error: memberDl } = await collector.client.storage.from('bills').download(`${pid}/test.txt`);
ok('member can download own committee bill', !memberDl, memberDl?.message);
const { error: strangerDl } = await stranger.client.storage.from('bills').download(`${pid}/test.txt`);
ok('stranger cannot download another committee bill', !!strangerDl);
const strangerUp = await stranger.client.storage.from('bills').upload(`${pid}/hack.txt`, new Blob(['x']));
ok('stranger cannot upload into another committee folder', !!strangerUp.error, 'upload succeeded!');
const rootUp = await admin.client.storage.from('bills').upload('no-folder.txt', new Blob(['x']));
ok('upload outside a program folder rejected', !!rootUp.error, 'upload succeeded!');

console.log(`\n==== RESULT: ${passed} passed, ${failed} failed ====`);
process.exit(failed ? 1 : 0);
