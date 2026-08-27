# PooramPay — Peer / Architect Review

_Reviewed 2026-08-28. Scope: whole portal, with emphasis on stability, scalability
(millions of transactions), simplicity, and the new public-pages layer._

## Verdict
The app is in good architectural shape. The money model is append-only and
program-scoped; every hot read is indexed and aggregated server-side; the new
public layer is additive, cached, and privacy-safe. No blocking issues found.
Findings below are graded 🟢 healthy / 🟡 minor / 🔧 done-in-this-pass.

---

## 1. Database & performance (the "millions of transactions" question)

**Method.** Rather than seed millions of rows (this free-tier DB was locked into
read-only once before at ~2M rows), each hot query was checked with `EXPLAIN` and
`enable_seqscan = off` to prove an index is *usable* for its predicate, plus a
review of the actual query shapes.

**Result — every hot path is index-backed, zero sequential scans:**

| Path | Query shape | Index used |
|------|-------------|-----------|
| Dashboard finance | `sum() where program_id and deleted_at is null` | `idx_income_prog_created` (partial) |
| Income by type | `group by entry_type where program_id …` | `idx_income_prog_type` (partial) |
| 14-day sparkline | `where program_id … entry_date >= …` | `idx_income_program` |
| Register "paid" dots | `distinct house_id where program_id …` | `idx_income_prog_house` (covering, partial) |
| "Collected by me" | `sum() where program_id, collected_by …` | `idx_income_collected_by` |
| Transactions page | `where program_id … order by created_at desc limit` | `idx_income_prog_created` |
| Expenses (list/finance/by-head) | program-scoped | `idx_expenses_prog_created`, `idx_expenses_head` |
| Public page | `organizations.slug`, `programs.is_public` | `idx_org_slug`, `idx_programs_public` |

**Doctrine that keeps it fast at scale (verified in code):**
- All money totals come from **program-scoped SQL aggregate RPCs** (migrations
  010, 020, 021) — the client never sums rows. 🔧 This pass converted the last two
  offenders: the register "paid" scan and the dashboard "collected by me" sum.
- The **public page reads the stored `results_snapshot` JSON**, not a live scan —
  a Thrissur-Pooram-scale program renders its public page from one blob.
- Public pages are **CDN-cached** (`s-maxage`), so viewer traffic doesn't touch
  the DB on repeat hits.

🟡 **Bounded client loads (acceptable, watch later):**
- `CollectWeekly` loads the program's weekly income rows to build the
  house×week paid grid. Bounded by (members × weeks) for weekly-subscription
  committees only; fine today, convert to an aggregate if a huge weekly club appears.
- Register pages load all `houses` for the program (bounded by member count,
  thousands — not millions) and paginate client-side. Correct trade-off.
- `AccessLog` / `AdminConsole` pull up to 3000 recent rows (padmin-only, capped).

🟢 **Indexing:** comprehensive. No missing indexes for current query patterns.
`profiles` (one row per app user) is small, so the avatar email-joins don't need a
`lower(email)` functional index yet.

## 2. Architecture & stability
- 🟢 RLS + `SECURITY DEFINER` RPC pattern is consistent; anon grants are surgical
  (two read RPCs returning only opt-in/published fields). Base-table RLS untouched.
- 🟢 Public layer is **purely additive** (new `api/` functions, new columns, new
  RPCs, one admin panel). Cannot destabilise the logged-in SPA.
- 🟢 Serverless functions fail safe: unknown/unpublished slug → clean 404, no leak.
  Confirmed live: `/robots.txt`, `/sitemap.xml`, `/c/<slug>`, `/directory` all serve.
- 🟢 Migrations are forward-only and idempotent (`if not exists`), applied to prod.

## 3. Simplicity & UX (audience: non-technical volunteers, WhatsApp/GPay-simple)
- 🟢 One new user concept only: "**Publish public page**" — a switch, a link, a
  WhatsApp share, two photo pickers. No jargon.
- 🟢 Collect flow reworked earlier: searchable member picker, single name field,
  required area, walk-in nudge.
- 🟢 Mobile-first throughout; desktop is a superset. Public pages are mobile-first.
- 🟡 The public-page panel lives in Reports (next to sign & publish). Discoverable
  for admins; consider also linking it from Setup later.

## 4. i18n / multi-language
- 🟢 App is fully EN + ML via i18next; public pages have their own EN/ML server
  dictionary with `hreflang` alternates and `<html lang>` per render.
- 🟡 Adding a new Indian language = one object in `api/_i18n.js` + one locale JSON.
  Structured for it; not wired to a language switch on the app shell beyond EN/ML.

## 5. Security / privacy
- 🟢 Public RPCs expose only: club identity, published snapshot, signatory names,
  and committee **name/position/photo** — never member email or phone.
- 🟢 Anon key only (publishable, RLS-protected); service key never used in functions.
- 🟢 Write RPCs (`set_public_page`, `save_public_page_media`) are committee-admin
  checked. Photos go to the public `logos` bucket, compressed client-side.
- 🟡 A club is only discoverable after an admin **opts in** and results are
  **published** — double gate. Good default.

## Recommended follow-ups (not blocking)
1. Per-club **OG preview image** generation for richer social/Google cards.
2. Register the sitemap in Google Search Console once real clubs publish.
3. Convert `CollectWeekly` to an aggregate if a very large weekly club appears.
4. Enterprise tier (bidding, billing, dashboards) — see `DEVELOPMENT_PLAN.md` §7.
