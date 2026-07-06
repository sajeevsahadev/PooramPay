# PooramPay

Festival committee collections & expense management for temples, churches, mosques,
colleges and cultural organizations in Kerala (and beyond). PWA + web app,
English + Malayalam.

**Live:** https://poorampay.vercel.app

## What it does

- **Organizations → Committees → yearly Programs** with roles per program
  (Committee Admin, Treasurer, Collector, Member, Viewer) and a per-member
  permission matrix.
- **Collections:** house-to-house, prize coupon books (issue → sell → remit,
  with per-holder outstanding), weekly home subscriptions (houses × weeks grid,
  arrears), bank interest, brochure/stage advertisements, donations. Automatic
  receipt numbers.
- **Expenses:** claims with bill photos → treasurer approval → payable → paid;
  direct wallet expenses; vendor advances; multi-day programme tagging.
- **Cash control:** per-collector cash-in-hand, handover-to-treasurer with
  two-side confirmation, cash↔bank transfers.
- **Transparency:** append-only ledger. No hard deletes — soft delete with
  mandatory reason into a visible "Deleted Transactions" bucket; every change
  audit-logged; program **freeze** makes everything read-only forever
  (only a platform administrator can unfreeze).
- **Reports:** P&L with retained balance carried to next year, cash book,
  budget vs actual, coupon settlement, collection/expense breakdowns. Printable.
- **Kanban tasks**, areas & house registers with team allocation.
- **Platform admin console** (full visibility over all organizations).

## Stack

React 18 + Vite + TypeScript + Tailwind v4 + vite-plugin-pwa · i18next (en/ml)
· Supabase (Postgres, Auth with Google, Storage, RLS) · Vercel.

All authorization is enforced in the database with Row Level Security and
security-definer RPCs; the freeze and soft-delete rules are database triggers,
so they cannot be bypassed from any client.

## Development

```bash
npm install
cp .env.example .env.local   # fill in Supabase URL, anon key, DB url
npm run db:migrate           # apply supabase/migrations/*.sql
npm run dev
```

### Scripts

| Script | Purpose |
|---|---|
| `npm run db:migrate` | Apply pending SQL migrations |
| `node scripts/e2e.mjs` | 48-test backend suite (RLS, money lifecycle, freeze, audit) |
| `node scripts/seed-demo.mjs` | Seed the demo temple/program |
| `node scripts/clean-test-data.mjs` | Remove e2e test data |

## Deploy

`npx vercel deploy --prod` — project `poorampay`, env vars
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
