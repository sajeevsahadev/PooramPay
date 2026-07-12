// Focused test of the committee_members -> program_members projection triggers.
// Runs as the DB owner (bypasses RLS) to exercise trigger logic directly.
// Self-cleaning: removes the temp org at the end.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

const root = 'D:/AI/Pal';
function loadEnv() {
  const p = join(root, '.env.local');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnv();
const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await db.connect();

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS ' + m); } else { fail++; console.log('  FAIL ' + m); } };
const val = async (sql, args) => (await db.query(sql, args)).rows[0];
const rows = async (sql, args) => (await db.query(sql, args)).rows;

const owner = (await val(`select id from public.profiles order by created_at limit 1`)).id;
let orgId;
try {
  orgId = (await val(
    `insert into public.organizations (name, org_type, created_by) values ('ZZ Proj Test','club',$1) returning id`,
    [owner])).id;
  const comId = (await val(
    `insert into public.committees (organization_id, name, created_by) values ($1,'ZZ Committee',$2) returning id`,
    [orgId, owner])).id;

  // committee_after_insert seeds 5 positions + owner as admin member
  ok((await val(`select count(*) c from public.committee_positions where committee_id=$1`, [comId])).c === '5',
    'new committee seeds 5 default positions');
  ok((await val(`select count(*) c from public.committee_members where committee_id=$1 and role='committee_admin'`, [comId])).c === '1',
    'committee creator auto-added as admin member');

  // program A
  const progA = (await val(
    `insert into public.programs (committee_id, name, year, created_by) values ($1,'Prog A',2026,$2) returning id`,
    [comId, owner])).id;
  ok((await val(`select role from public.program_members where program_id=$1 and profile_id=$2`, [progA, owner])).role === 'committee_admin',
    'program A inherits creator as committee_admin');

  // add committee member X (own tier) -> should project to program A
  await db.query(
    `insert into public.committee_members (committee_id, email, display_name, tier) values ($1,'x@test.zz','X',$2)`,
    [comId, 'own']);
  ok((await val(`select role from public.program_members where program_id=$1 and email='x@test.zz'`, [progA]))?.role === 'collector',
    'adding committee member X projects into program A as collector');

  // program B created later -> should inherit X automatically
  const progB = (await val(
    `insert into public.programs (committee_id, name, year, created_by) values ($1,'Prog B',2027,$2) returning id`,
    [comId, owner])).id;
  ok(!!(await val(`select 1 from public.program_members where program_id=$1 and email='x@test.zz'`, [progB])),
    'new program B inherits committee member X');

  // change X tier own -> admin: propagates to BOTH programs
  await db.query(`update public.committee_members set tier='admin' where committee_id=$1 and email='x@test.zz'`, [comId]);
  const xRoles = await rows(`select pm.role from public.program_members pm join public.programs p on p.id=pm.program_id
    where p.committee_id=$1 and pm.email='x@test.zz'`, [comId]);
  ok(xRoles.length === 2 && xRoles.every(r => r.role === 'committee_admin'),
    'changing X tier to admin propagates to all programs');

  // FK refs cleared on delete: assign X to a coupon book + a task, then remove X
  const xPmA = (await val(`select id from public.program_members where program_id=$1 and email='x@test.zz'`, [progA])).id;
  const schemeId = (await val(
    `insert into public.coupon_schemes (program_id, name, price, total_coupons, created_by) values ($1,'S',10,100,$2) returning id`,
    [progA, owner])).id;
  const bookId = (await val(
    `insert into public.coupon_books (scheme_id, program_id, book_no, coupons_count, holder_name, assigned_member_id, created_by)
     values ($1,$2,'B1',25,'H',$3,$4) returning id`, [schemeId, progA, xPmA, owner])).id;
  const taskId = (await val(
    `insert into public.committee_tasks (program_id, title, assignee_member_id, created_by) values ($1,'T',$2,$3) returning id`,
    [progA, xPmA, owner])).id;

  await db.query(`delete from public.committee_members where committee_id=$1 and email='x@test.zz'`, [comId]);
  ok((await val(`select count(*) c from public.program_members where email='x@test.zz' and program_id in ($1,$2)`, [progA, progB])).c === '0',
    'removing committee member X deletes projected program_members rows');
  ok((await val(`select assigned_member_id from public.coupon_books where id=$1`, [bookId])).assigned_member_id === null,
    'coupon book assignment nulled on member removal');
  ok((await val(`select assignee_member_id from public.committee_tasks where id=$1`, [taskId])).assignee_member_id === null,
    'task assignment nulled on member removal');

} finally {
  if (orgId) await db.query(`delete from public.organizations where id=$1`, [orgId]);
}
console.log(`\n==== PROJECTION: ${pass} passed, ${fail} failed ====`);
await db.end();
process.exit(fail ? 1 : 0);
