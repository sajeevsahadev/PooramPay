# WIP — overnight build (2026-08-28)

If a session resumes this (e.g. after a usage-limit pause via the
`poorampay-resume-after-limits` watchdog): the big pieces are **DONE and
deployed**. Continue with the optional polish list at the bottom. Always
commit + push before deploying (git-linked Vercel auto-deploys).

## Done & live (verified on www.poorampay.com)
- ✅ `DEVELOPMENT_PLAN.md` — tiers (Basic/Standard/Enterprise), architecture,
  folder-method decision, Enterprise backlog (also in memory `enterprise-backlog`).
- ✅ Migration 022 — org `slug`+`cover_url`, program `is_public`+`group_photo_url`,
  anon RPCs `public_committee_page` / `public_directory`, admin RPCs
  `set_public_page` / `save_public_page_media`. Slugs backfilled. (023 not needed.)
- ✅ Migrations 020/021 — register paid-set + "collected by me" server aggregates.
- ✅ Serverless public pages: `api/committee.js` (`/c/:slug`), `api/directory.js`
  (`/directory`, `/directory/:district`), `api/sitemap.js`, `api/robots.js`,
  shared `api/_render.js` / `_i18n.js` / `_supabase.js`. Bilingual EN/ML +
  hreflang + JSON-LD, mobile-first. `vercel.json` rewrites + CSP for Google Fonts.
- ✅ In-app **Public Page panel** (`src/components/PublicPagePanel.tsx`) in Reports:
  publish toggle, /c/<slug> link + copy + WhatsApp share, committee + cover photo
  upload (compressed → `logos` bucket via `uploadPublicPhoto`).
- ✅ Committee & member **photos** on public page (avatars matched by email).
- ✅ Home page storytelling journey (7 chapters, all features + public page) in
  `Landing.tsx`, bilingual, with `/directory` link.
- ✅ `PEER_REVIEW.md` — perf/index audit (EXPLAIN-verified, no seq scans), stability,
  simplicity, security.
- ✅ One clearly-labelled **Test** club published for a live demo:
  `www.poorampay.com/c/mizhi-samskarika-vedi-test` (safe to leave or unpublish).

## Perf conclusion
Every hot query is index-backed & program-scoped; money totals come from aggregate
RPCs; public pages read the stored snapshot and are CDN-cached. No missing indexes.

## Optional polish (safe to pick up next)
1. Per-club dynamic **OG image** (currently uses cover/logo/app icon).
2. Link the Public Page panel from Setup too (not just Reports).
3. Convert `CollectWeekly` weekly-grid load to an aggregate if a very large weekly
   club appears (currently a bounded, acceptable load).
4. Visually spot-check `/c/<slug>` and the home journey on a real phone; tune spacing.
5. Enterprise tier — deferred, see `DEVELOPMENT_PLAN.md` §7 (bidding, billing,
   festival dashboards, more Indian languages).

## Guardrails
- Do NOT seed >~1M rows on this free-tier project (it locks read-only).
- Public data is opt-in + published only; never expose member email/phone.
- Migrations via `node scripts/migrate.mjs`; keep them forward-only/idempotent.
