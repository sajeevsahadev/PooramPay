# PooramPay — Development & Architecture Plan

_Last updated: 2026-08-28_

This is the working plan for the **public pages / SEO growth layer** and the
**tiered product roadmap** (Basic → Standard → Enterprise). It is written to be
picked up by any future session or teammate. Read `MEMORY.md` in the memory dir
for cross-session context; read the migration comments for DB rationale.

---

## 1. Vision & audience

PooramPay is a **multi-tenant finance app for Kerala festival committees**
(temples, churches, mosques, clubs, colleges, residents' associations). The
guiding principle for every screen:

> The people using this are **ordinary committee volunteers**, not accountants
> or software professionals. It must feel as simple as **WhatsApp or GPay**.

Non-negotiables that shape all work:

- **Mobile-first.** ~90% use it on a phone; ~10% (enterprise / management) on a
  laptop. Design for the phone, let the desktop be a comfortable superset.
- **Bilingual now (English + Malayalam), all Indian languages later.** Every
  user-facing string goes through i18n. No hardcoded copy.
- **Trust is the product.** Append-only records, soft-delete with reason,
  published & digitally-signed accounts, no ads, data never sold.
- **Simple beats feature-rich.** Present the existing features well before adding
  new ones.

---

## 2. Product tiers (roadmap)

The current app is effectively **Basic/Standard**. Tiers are a future
packaging decision — the data model must not block them.

| Tier | Audience | Headline features |
|------|----------|-------------------|
| **Basic** (free yr 1) | Small committees | Collections, expenses w/ approval, cash book, coupons, budget, reports, public page |
| **Standard** (paid yr 2+) | Active committees | Everything in Basic + multi-committee, roles & tiers, register at scale, audit trail, published accounts |
| **Enterprise** | Large festivals (e.g. **Thrissur Pooram**), devaswoms, dioceses | Standard + the "build later" backlog in §7: facility/stall **bidding & auctions**, a real **billing/invoicing platform**, **planning dashboards**, multi-program consolidation, vendor management |

**Architectural implication:** keep money, register, and org/committee/program
entities clean and additive. Enterprise features attach as **new tables + new
routes + feature flags per program**, never as forks of the core.

---

## 3. Current stack (unchanged)

- **Frontend:** React 18 + Vite 6 + TypeScript + Tailwind v4 + vite-plugin-pwa; i18next (en/ml).
- **Backend:** Supabase (Postgres 17, Google OAuth, Storage, RLS + SECURITY DEFINER RPCs).
- **Hosting:** Vercel, git-linked (push to `main` → prod). Domain `www.poorampay.com`.
- **Perf doctrine (already established):** every hot query is **program-scoped**
  and hits an index with `program_id` leading. Aggregates are **server-side RPCs**
  (migrations 010, 020, 021) — never client-side sums over `income_entries`.

---

## 4. The public pages / SEO layer (BUILDING NOW)

**Goal:** turn a committee's **opt-in, already-published** accounts into an
indexable web page that ranks on Google and recruits the next committee. Folder
method (decided): **`poorampay.com/c/<slug>`** and directory index pages.

> Note on the exact path: root-level slugs (`/mizhi`) collide with the SPA's own
> routes (`/collect`, `/profile`, …) and would force a fragile denylist that
> breaks every time we add an app route. We use the **`/c/<slug>` folder** — same
> SEO benefit as any sub-folder, zero collision risk. Directory lives at
> `/directory` and `/directory/<district>`.

### 4.1 Why server-rendered (not the SPA)
The app is a client-rendered SPA; Google can execute JS but ranks true HTML far
better. So the public layer is a **thin Vercel serverless render** that returns
complete HTML (title, meta, OG, JSON-LD, visible content) — **the logged-in app
stays the SPA it is.** No Next.js migration.

### 4.2 Routing (`vercel.json` rewrites, before the SPA catch-all)
```
/c/:slug        → /api/committee?slug=:slug
/directory      → /api/directory
/directory/:d   → /api/directory?district=:d
/sitemap.xml    → /api/sitemap
/robots.txt     → /api/robots
(everything else) → /index.html   (SPA, unchanged)
```

### 4.3 Data additions (migration 022)
- `organizations.slug text unique`, `organizations.cover_url text`
  (the **committee / "conducted by" group photo**).
- `programs.slug text`, `programs.is_public boolean default false`
  (**explicit admin opt-in** — nothing is public until chosen).
- Slug generation: kebab of name + short suffix on collision. Backfill existing.

### 4.4 Public data access (anon-safe)
- `public_committee_page(p_slug text)` — SECURITY DEFINER, **granted to `anon`**,
  returns ONLY: org identity (name, type, place, district, logos, cover), the
  program (name, year), and the **published** income/expenditure snapshot +
  signatures **iff `is_public` and results are published**. Nothing else. No
  member PII beyond public committee roles/photos the admin chose to show.
- `public_directory(p_district text default null)` — list of public committees.
- Both read only opt-in/published data → safe to serve unauthenticated.

### 4.5 Multi-language public pages
- Server dictionary `api/_i18n.js` (en + ml now; structured so a new language is
  one object). Page renders in `?hl=ml` (default en), with `<link rel="alternate"
  hreflang="en|ml|x-default">` between them. `<html lang>` set per render.
- Same phrase keys mirror the app's i18n so translations stay consistent.

### 4.6 In-app admin UI
- On the committee's Setup / Reports area: a **"Public page"** panel — toggle
  publish, see the URL, copy/share-to-WhatsApp, and upload the **committee photo**
  (cover) + confirm the slug. Plain-language: "Show our published accounts to the
  public so people can find us on Google."

### 4.7 SEO specifics
- Per-page `<title>`, `meta description`, canonical, OG/Twitter, `Organization` +
  `Event` JSON-LD. `sitemap.xml` generated from public committees. `robots.txt`
  allows crawl + points to sitemap. CDN cache headers (`s-maxage`) so pages are
  fast and cheap; revalidate on publish.

---

## 5. Home page = marketing landing (BUILDING NOW)
Rework `/` (logged-out) into a **story-driven** page that walks a committee
through the journey — *the shoebox problem → set up → collect every rupee →
spend with approval → publish signed accounts → be found on Google* — each
"chapter" showing the real feature with a phone mockup, bilingual, mobile-first,
with repeated sign-in CTAs. Reuses the festival gradient + decor system.

---

## 6. Solution-architect review (scalability · stability · simplicity)

**Scalability**
- Public pages are **read-only, cached at the CDN edge**, and hit narrow indexed
  RPCs → they scale independently of the app and add ~zero load per viewer.
- Add `idx_programs_public` and unique index on `organizations.slug` /
  `programs.slug` for O(1) slug lookups.
- Keep the "aggregate, don't ship rows" doctrine: the public snapshot comes from
  the **stored `results_snapshot`** (already computed at sign-off), NOT a live
  scan — so a Thrissur-Pooram-scale program with millions of rows renders its
  public page from one JSON blob.

**Stability**
- The public layer is **purely additive**: new function dir, new columns, new
  anon-only RPCs, one admin panel. It cannot break the logged-in app.
- `anon` grants are surgical — only the two public RPCs, returning only
  opt-in/published fields. RLS on base tables is untouched.
- Fail safe: if a slug isn't public/published, the function returns a clean 404
  page, never leaks data.

**Simplicity (the hardest requirement)**
- One new user-facing concept: "**Publish our page**" (a switch + a photo). No
  new vocabulary for volunteers.
- Public pages need no login; sharing is a WhatsApp button.
- Enterprise complexity (bidding/billing/dashboards) stays **out** of the Basic
  UI — gated behind a program feature flag so ordinary users never see it.

**Risks / decisions**
- _Serverless env vars:_ functions read `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
  from `process.env` (already set in Vercel for builds; anon key is a publishable
  key, RLS-protected). If a function 500s on missing env, set those two in the
  Vercel project → Settings → Environment Variables.
- _Path choice:_ `/c/<slug>` over `/mizhi` to avoid SPA route collisions (§4).
- _Freshness:_ public page revalidates on publish; snapshot-based so no heavy reads.

---

## 7. Enterprise backlog — BUILD LATER (reminder)

These are **explicitly deferred**. Captured here + in memory so we build them as
the Enterprise tier on top of the current foundation, not now:

1. **Facility / stall bidding & auctions** — temples/churches auctioning shops,
   stalls, ad boards, and festival concessions: list lots, accept bids, publish
   results, award. New tables `auction_lots`, `bids`, `awards`; public bid pages.
2. **Real billing / invoicing platform** — issue invoices/receipts to vendors &
   sponsors, track dues, payment gateway integration. New `invoices`, `payments`.
3. **Big-festival planning dashboards** — for events like **Thrissur Pooram**:
   multi-committee consolidation, budget vs. actual at scale, cash-flow timelines,
   committee-of-committees roll-ups, richer charts.
4. **Vendor & sponsor management**, procurement, and approvals workflow.
5. **All Indian languages** beyond en/ml (Tamil, Hindi, Kannada, Telugu, …).

---

## 8. Build order (tonight → onward)

- [x] Perf hardening (migrations 020/021) — done earlier.
- [ ] **Migration 022:** slugs, `is_public`, `cover_url`; slug backfill; indexes.
- [ ] Public RPCs (`public_committee_page`, `public_directory`) granted to `anon`.
- [ ] Serverless: `api/committee`, `api/directory`, `api/sitemap`, `api/robots` + `api/_render`, `api/_i18n`, `api/_supabase`.
- [ ] `vercel.json` rewrites.
- [ ] In-app **Public page** admin panel + committee photo upload.
- [ ] Committee & member **photos** on the public page.
- [ ] **Home page** storytelling rebuild.
- [ ] Peer review (`PEER_REVIEW.md`) + typecheck/build/deploy.
- [ ] `WIP.md` for resume-after-limits.

Deferred → §7 (Enterprise).
