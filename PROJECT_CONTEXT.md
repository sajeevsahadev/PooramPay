# PooramPay — Project Context & Handoff

> **Purpose of this file.** This is the single source of truth for anyone (a new
> developer, or an AI assistant like Claude) picking up work on PooramPay. It
> captures *what the app is, the decisions we made, the infrastructure, and the
> hard-won gotchas* so a fresh person can continue without re-discovering
> everything. **Keep it up to date** — when you make a meaningful decision or hit
> a non-obvious trap, add it to the Change Log at the bottom.
>
> _Last updated: 2026-07-11_

---

## 1. What PooramPay is

A **multi-tenant PWA + web app** for **Kerala festival committee collections &
expense management** — for temples, churches, mosques, colleges, clubs and
cultural organizations (and beyond). Bilingual: **English + Malayalam** (i18next,
more languages possible later).

**Live:** https://www.poorampay.com (apex 308-redirects to www)
Also reachable at https://poorampay.vercel.app

### Core domain model
**Organizations → Committees → yearly Programs**, with **roles per program**
(Committee Admin, Treasurer, Collector, Member, Viewer) and a **per-member
permission matrix**.

### What it does
- **Collections:** house-to-house, prize coupon books (issue → sell → remit, with
  per-holder outstanding), weekly home subscriptions (houses × weeks grid,
  arrears), bank interest, brochure/stage advertisements, donations. Automatic
  receipt numbers.
- **Expenses:** claims with bill photos → treasurer approval → payable → paid;
  direct wallet expenses; vendor advances; multi-day programme tagging.
- **Cash control:** per-collector cash-in-hand, handover-to-treasurer with
  two-side confirmation, cash↔bank transfers.
- **Transparency:** append-only ledger; no hard deletes; program freeze; audit log.
- **Reports:** P&L with retained balance carried to next year, cash book, budget
  vs actual, coupon settlement, breakdowns. Printable.
- **Kanban tasks**, areas & house registers with team allocation.
- **Platform admin console** (full visibility across all organizations).

---

## 2. Non-negotiable business rules

These are enforced **in the database** (RLS + triggers + security-definer RPCs),
so they cannot be bypassed from any client. Do not weaken them without a reason.

1. **Financial records are append-only.** No hard deletes.
2. **Soft delete requires a mandatory reason** and moves the row into a visible
   "Deleted Transactions" bucket (not hidden).
3. **Only Committee Admins can edit/delete** financial records.
4. **Program freeze = read-only forever.** Only a *platform admin* can unfreeze.
5. **Yearly programs carry retained balance forward** to the next year.
6. **Two-tier financial visibility** (see §4) — running totals are visible only to
   finance roles; ordinary members see only published/signed final results.

### Business model
Year 1 free per committee; paid from year 2.

---

## 3. Tech stack & architecture

- **Frontend:** React 18 + Vite 6 + TypeScript + **Tailwind v4** (`@tailwindcss/vite`)
  + `vite-plugin-pwa`. Router: react-router-dom v7.
- **i18n:** i18next / react-i18next, locales `en` + `ml`.
- **Backend:** **Supabase** — Postgres 17, Auth (Google only), Storage, and
  **Row Level Security** everywhere.
- **Hosting:** Vercel (project `poorampay`, team `javanam`).
- **No charting library** — custom SVG charts in `src/components/charts.tsx`
  (Donut / Sparkline / MiniBars).

**Authorization is enforced in the DB**, not the client. RLS policies use a hashed
`IN`-subquery pattern (`my_member_programs()` / `my_role_programs()` /
`my_perm_programs()` + `(select auth.uid())`). Freeze and soft-delete are triggers.
Keep new policies in this same pattern.

### Repo layout
```
src/
  main.tsx            App bootstrap; mounts InstallPrompt + UpdatePrompt
  App.tsx             Routes
  state/AppContext.tsx  Global state, auth, finance refresh, access logging
  components/         Shell, ui (Modal etc.), charts, GpsPin, InstallPrompt, UpdatePrompt
  pages/              Dashboard, Collect*, Coupons, Expenses, Reports, Areas,
                      Members, Tasks, AdminConsole, AccessLog, Profile, ...
  lib/                types, units, geo, supabase client
  i18n/               en/ml strings
supabase/migrations/  001..014 SQL (apply with npm run db:migrate)
scripts/              migrate, e2e, seed-demo, clean-test-data, loadtest
```

### Migrations (source of truth for schema)
`001_core` · `002_security` · `003_fix_org_select` · `004_perf_and_security` ·
`005_advisor_fixes` · `006_daily_income_view` · `007_register_generalize` ·
`008_area_lifecycle` · `009_area_delete_cascade_guard` · `010_scale_aggregates` ·
`011_profile_nickname` · `012_access_log` · `013_org_location` ·
`014_results_signoff`

---

## 4. Key feature decisions (the "why")

- **Two-tier financial visibility (migration 014).** Live totals (balances,
  collected, spent, cashbook, budget, P&L) require the `view_money` permission —
  **finance roles only** (admin/treasurer). Viewer's default `view_money` is now
  **FALSE**. Non-finance members see only *"Collected by me"* (their own sum) +
  tasks + coupon status + expense vouchers — **not** org totals.
  **Rationale:** hide running totals *during* the collection drive so coupon
  selling doesn't stall once the target is visibly met.
- **Sign & publish results.** `sign_and_publish_results(program)` RPC lets a
  committee admin snapshot opening/income/expense/retained into
  `programs.results_published/_at/_snapshot(jsonb)` and record a digital
  signature per admin in `program_signoffs`. Once published, **all** members see
  the signed final income & expenditure + remaining balance + signatures.
  `unpublish_results(program)` is **platform-admin only**. `Reports.tsx` branches
  on `view_money`: without it → published-snapshot-only (or "pending"); with it →
  full live view + sign/publish panel.
- **Generalized register (migration 007).** `programs.unit_label` ∈
  `house/member/family/shop/unit` drives all wording via `useUnits()` /
  `incomeTypeLabel()` in `src/lib/units.ts`. **Always use these helpers** for
  register words — never hardcode "house". Org types include club/association/political.
  `copy_register(from,to)` RPC copies areas + register between same-committee programs.
- **Area lifecycle (008/009).** Areas can be deactivated (hidden from pickers,
  kept in history) or deleted only when empty (`assert_area_empty` trigger, guarded
  by `pg_trigger_depth()>1` so cascade deletes still work).
- **Nickname (011).** `profiles.nickname` (user-editable). `displayName()` in
  `src/lib/types.ts`: nickname wins over per-program display_name.
- **Access log (012).** Login audit into `access_log`; captured client-side in
  `AppContext.logAccess()` once per browser session via ipwho.is. RLS: insert own,
  SELECT platform-admin only. `/access-log` page is padmin-only.
- **Superadmin oversight.** Platform admins fetch ALL programs (decoupled from
  membership); work with zero memberships. Org delete requires typing the exact
  org name to confirm.

---

## 5. Infrastructure & accounts

> **Secrets live in `D:\AI\Pal\.env.local` (gitignored) — never in git or this file.**

- **Supabase project ref:** `tovxkjmbetamizlijtcr` (org "PooramPay").
  Region is **ap-southeast-2** (not ap-south-1, despite older notes).
- **DB connection (works from dev machine):** session pooler —
  `postgresql://postgres.tovxkjmbetamizlijtcr:<PW>@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres`
  (port 5432 session mode = supports DDL + trigger toggling).
  The direct host `db.tovxkjmbetamizlijtcr.supabase.co` went IPv6-only and fails
  from this machine. `migrate.mjs` / `e2e` / `seed` all use the pooler URL.
- **DDL fallback when pg is down:** POST to
  `https://api.supabase.com/v1/projects/tovxkjmbetamizlijtcr/database/query`
  (avoid em-dashes in the JSON body).
- **GitHub:** https://github.com/sajeevsahadev/PooramPay (push works via Git
  Credential Manager; no PAT needed).
- **Vercel:** account `sajeevsahadev`, project `poorampay`, team `javanam`.
  Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- **Domain:** www.poorampay.com via Cloudflare CNAME-flatten (DNS-only). Supabase
  `site_url = https://www.poorampay.com`; `uri_allow_list` has www + apex +
  vercel.app + localhost.
- **Auth:** Google sign-in only (OAuth client in Google Cloud project "badmint").
  **Platform admin:** sajeevsahadev@gmail.com (must support adding more admins).

---

## 6. Local development

```bash
npm install
cp .env.example .env.local     # fill Supabase URL, anon key, DB (pooler) url
npm run db:migrate             # apply supabase/migrations/*.sql
npm run dev
```

| Script | Purpose |
|---|---|
| `npm run db:migrate` | Apply pending SQL migrations |
| `node scripts/e2e.mjs` | Backend suite (RLS, money lifecycle, freeze, audit) — keep it green |
| `node scripts/seed-demo.mjs` | Seed the demo temple/program |
| `node scripts/clean-test-data.mjs` | Remove e2e test data |
| `node scripts/loadtest.mjs` | Load/scale testing |

**Deploy:** `npx vercel deploy --prod` (project `poorampay`).

---

## 7. Gotchas & hard-won lessons (READ before you code)

- **⚠ Free-tier storage cap (~600–640 MB).** Seeding >~2M income rows fills disk
  and Supabase auto-enables **READ-ONLY mode** (whole DB rejects writes). Recovery:
  POST `https://api.supabase.com/v1/projects/tovxkjmbetamizlijtcr/readonly/temporary-disable`
  (≈15-min write window), delete orphan data, re-enable triggers, then
  **`VACUUM FULL`** (plain delete does NOT shrink). **Do not seed >~1M rows** on
  this project; 10M needs a paid instance.
- **Tailwind v4:** custom component classes must live in `@layer components` or
  they override utilities.
- **Never define a component that contains an `<input>` inside another
  component's render body** — it gets a new identity each render, the input
  remounts per keystroke, and mobile only captures one digit. Keep such
  components at module scope. (Bit us on the Budget row.)
- **Overlays / modals:** never rely on `position:fixed` inside a transformed
  ancestor. The page-enter transform on `<main>` traps fixed positioning, so
  popups rendered below the fold. `Modal` in `src/components/ui.tsx` **portals to
  `document.body`** + scroll-lock + Escape. Portal any new overlay.
- **Aggregate performance (migration 010):** the aggregate VIEWS did a whole-table
  GROUP BY before the program filter → seq scans (34s sparkline @2M rows). Hot
  paths now use **program-scoped SQL functions** (`program_finance`,
  `income_by_type`, `expense_by_head`, `income_by_day`, `program_my_cash`) via
  `rpc`. Views kept only for AdminConsole bulk.
- **Browser permission APIs must be allow-listed in `vercel.json`
  Permissions-Policy.** GPS was blocked by `geolocation=()`; now
  `geolocation=(self), camera=(self)`.
- **PWA update flow is PROMPT, not silent** (`vite.config` `registerType:'prompt'`).
  `src/components/UpdatePrompt.tsx` uses `useRegisterSW`, checks for updates on
  load + focus + hourly, shows a dismissible Update/Later banner. After a deploy
  that changes the service worker, tell users to hard-refresh **once**; future
  updates then auto-prompt.
- **PS 5.1 file editing corrupts UTF-8** (`Get-Content`/`-replace` reads UTF-8 as
  ANSI → corrupts emoji). Use `[System.IO.File]::ReadAllText/WriteAllText` with
  `UTF8Encoding($false)`. Prefer editor tools over PowerShell for `.tsx` edits.
- **E2E cleanup** must disable only USER triggers — never
  `session_replication_role=replica` (it breaks FK cascades).

---

## 8. Design / theme

**Professional** direction (neon was rejected as too heavy): light stone
background, white cards, deep indigo brand (`#3730a3` / `#4338ca`), stat cards =
white with a left accent bar (`.stat-label` / `.stat-value`), tiles = soft tints,
charts = muted solid colors, no glows/gradients. Standard Tailwind palettes.
New UI should follow this direction. Logo = gradient coin + ₹ + gold spark
(`public/icon.svg`, `favicon.svg`, `icon-maskable.svg`).

---

## 9. Change Log

> Append new decisions here (newest first). Keep entries one or two lines.

- **2026-07-11** — Two-tier financial visibility (migration 014): live totals
  gated behind `view_money` (finance roles only); viewer `view_money` now FALSE;
  committee admins digitally sign + publish final results, which all members then
  see. Org location = country/state/district cascading dropdowns
  (India/Kerala/Thrissur defaults, migration 013). Domain www.poorampay.com live.
- **2026-07-09** — Access log (012) + AccessLog page; PWA install prompt; nickname
  (011) + Profile page + personalized dashboard; org delete with typed
  confirmation; new logo; aggregate scale functions (010); modals portal to body.
- **2026-07-08** — Register generalized (007) via `unit_label`; area lifecycle
  (008/009); GPS pin component + Permissions-Policy fix; PWA update prompt banner;
  DB moved to ap-southeast-2 session pooler.
- **2026-07-07** — Security/perf hardening (004/005): RLS hashed-subquery pattern,
  30+ indexes, aggregate views; superadmin oversight; theme set to professional.
- **2026-07-06/07** — Phases 1–3 built and shipped live. Core schema (001) +
  security (002/003). Google auth, Vercel deploy, e2e suite, demo seed.
