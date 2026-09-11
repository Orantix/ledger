# Orantix Ledger

Self-hosted bookkeeping and financial reporting: the book *is* the source of
the financial statements, not something reconciled against them after the
fact. Non-accountants capture transactions in plain language; a rules-based
classification engine posts them as proper double-entry journal entries.

This repo currently implements the first vertical slice: **Capture →
Classification/Posting → Ledger → Trial Balance**. OCR/document
intelligence, FS generation, reconciliation, the owner dashboard, and access
control are not built yet — see the project brief for the full roadmap.

## Stack

- **API**: NestJS + Prisma + PostgreSQL (`apps/api`)
- **Web**: Next.js (App Router) (`apps/web`)
- pnpm workspace monorepo, Docker Compose for self-hosting

## How a transaction flows

1. A capture is entered in plain language: what it was for, the amount,
   date, category, and — the field that matters most — **how it was paid**
   (company bank / the user's own money / unpaid-on-credit). An attachment
   (receipt/invoice/bill) can be linked to it.
2. The classification engine looks for an active rule matching
   `(category, paymentMethod)`. Rules are deterministic and versioned —
   never a guess.
   - **Match found** → a balanced double-entry journal entry is posted
     immediately (debit the expense/asset account, credit Bank /
     Director's Current Account / Creditors depending on payment method).
   - **No match** → the capture sits in the review queue until a
     bookkeeper picks the two accounts by hand, optionally teaching the
     engine a new rule for next time.
3. Every posted journal entry is immutable. Corrections are reversing
   entries only, never edits.
4. The trial balance sums every journal line by account — the first proof
   the pipeline is internally consistent.

## Running locally with Docker Compose

```bash
docker compose up --build
```

- API: http://localhost:3001
- Web: http://localhost:3000

The API container runs against a fresh Postgres with no schema yet — run
migrations and seed once the `db` service is healthy:

```bash
docker compose exec api pnpm prisma:deploy
docker compose exec api pnpm seed
```

## Running locally without Docker

Requires a local Postgres reachable at the URL in `apps/api/.env`.

```bash
pnpm install

cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local

pnpm prisma:generate
pnpm prisma:migrate   # creates the schema
pnpm seed              # starter chart of accounts + classification rules

pnpm dev:api   # http://localhost:3001
pnpm dev:web   # http://localhost:3000
```

## Seeded chart of accounts & rules

`apps/api/prisma/seed.ts` seeds a minimal SME chart of accounts (Bank,
Creditors, Director's Current Account, Share Capital, a handful of expense
categories) and a starter set of classification rules for Orantix's own
books — this slice is meant to be validated end-to-end on that single real
entity before being generalized further.
