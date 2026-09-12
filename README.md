# Orantix Ledger

Self-hosted bookkeeping and financial reporting: the book *is* the source of
the financial statements, not something reconciled against them after the
fact. Non-accountants capture transactions in plain language; a rules-based
classification engine posts them as proper double-entry journal entries, and
financial statements are generated straight off that same ledger.

## Stack

- **API**: NestJS + Prisma + PostgreSQL (`apps/api`)
- **Web**: Next.js App Router (`apps/web`)
- pnpm workspace monorepo, Docker Compose for self-hosting

## What's implemented

- **Capture** — plain-language entry (what/how much/how paid), with receipts
  attached before or after the capture exists.
- **Document intelligence** — uploading a receipt/invoice runs OCR
  (tesseract.js for images, pdf-parse for text-layer PDFs) and pre-fills
  vendor/amount/date/currency, each with a confidence score. Low-confidence
  fields are left blank rather than guessed. Scanned (image-only) PDFs are
  reported as unsupported rather than silently skipped.
- **Classification & posting** — deterministic, versioned rules map
  `(category, paymentMethod)` to a double-entry pair. A rule match only
  auto-posts if the accounts involved aren't flagged `sensitive` (equity /
  related-party) and the amount isn't anomalous for that category's
  history — otherwise it goes to the review queue with the matched rule
  kept as a one-click suggestion, never a silent guess.
- **Ledger** — immutable journal entries; corrections are reversing entries
  only. Postings are blocked against a fiscal period once it's finalized.
  Light multi-currency: a capture carries its transaction currency and a
  manually entered exchange rate to the base currency (no FX revaluation /
  unrealized gain-loss yet — see Known gaps).
- **Financial statements** — Income Statement, Balance Sheet (balances via
  a computed cumulative-retained-earnings line, no manual closing entries
  needed), Statement of Changes in Equity, and a direct-method Statement of
  Cash Flows, all generated from `journal_lines` for a fiscal period via a
  versioned, admin-editable account→FS mapping. Draft periods regenerate
  live; Finalizing locks the period and requires every variance flag
  resolved first. Exports to Excel and PDF.
- **Reconciliation** — scans a period for accounts with real activity but
  no FS mapping, and for capital shareholders committed vs. what's actually
  been paid in, raising flags that must be explained before a period can go
  Final.
- **Owner dashboard** — cash-basis monthly cashflow, burn rate & runway,
  related-party balances by shareholder (from personal-draw captures),
  capital committed-vs-paid-in, budget vs. actual.
- **Access control** — JWT auth, five roles (Owner, Staff, Bookkeeper,
  Accountant, Admin). Every route requires auth by default; sensitive
  actions (classify, reverse, finalize, chart-of-accounts edits, FS mapping
  edits) are role-gated. Admins can add/disable users and reset passwords
  from the app; every user can change their own password. Minimal by
  design — a dedicated identity product can replace this later.
- **Production hardening** — the API refuses to boot with a missing,
  placeholder, or short `JWT_SECRET`; login is rate-limited; security
  headers (helmet) and configurable CORS are on by default; seeding a real
  deployment (`seed:accounts` + `create-admin`) never creates demo users or
  a shared password the way the dev seed does.
- **Tests** — an integration suite (`pnpm test` in `apps/api`) covers the
  ledger's money-math paths against a real Postgres test database: balanced
  vs. unbalanced postings, reversal correctness, sensitive-account and
  anomaly-based review routing, balance-sheet balancing, period finalization
  and the period-closed guard, and the reconciliation explain-then-finalize
  flow.

### Known gaps (deliberately out of scope for this pass)

- **Multi-entity roll-up** — needs a tenancy decision (a `companyId` on
  every table) that deserves its own pass, not a bolt-on.
- **AR/AP aging** — there's no "settle this invoice" transaction type yet,
  so Creditors/Receivables are ledger balances, not aged per-invoice.
- **FX revaluation** — exchange rates are captured per-transaction; there's
  no period-end unrealized gain/loss journal entry.
- **Scanned-PDF OCR** — only text-layer PDFs and images are read; a
  scanned/image-only PDF is flagged unsupported rather than rasterized.

## How a transaction flows

1. A capture is entered in plain language: what it was for, the amount,
   date, category, and — the field that matters most — **how it was paid**
   (company bank / the user's own money / unpaid-on-credit). Attach a
   receipt first and the form pre-fills from OCR.
2. The classification engine looks for an active rule matching
   `(category, paymentMethod)`.
   - **Match found, nothing flagged** → posts immediately: debit the
     expense/asset account, credit Bank / Director's Current Account /
     Creditors depending on payment method.
   - **Match found but the account is sensitive or the amount is
     unusual, or no rule matched at all** → sits in the review queue for a
     human, with the matched rule (if any) offered as a starting point.
3. Every posted journal entry is immutable. Corrections are reversing
   entries only, never edits.
4. Financial statements, reconciliation, and the dashboard are all read
   models over the same `journal_lines` — nothing is a separate system
   that needs reconciling against the book.

## Running locally with Docker Compose (dev/demo data)

```bash
cp .env.example .env
# put a real value in .env: JWT_SECRET=$(openssl rand -base64 48)

docker compose up --build
```

- API: http://localhost:3001
- Web: http://localhost:8080

The API container runs against a fresh Postgres with no schema yet — run
migrations and seed once the `db` service is healthy:

```bash
docker compose exec api pnpm prisma:deploy
docker compose exec api pnpm seed
```

## Running locally without Docker (dev/demo data)

Requires a local Postgres reachable at the URL in `apps/api/.env`.

```bash
pnpm install

cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

Generate a real secret before starting the API — it refuses to boot
without one:

```bash
# put the output in apps/api/.env as JWT_SECRET="..."
openssl rand -base64 48
```

```bash
pnpm prisma:generate
pnpm prisma:migrate   # creates the schema
pnpm seed              # chart of accounts, rules, FS mappings, dev users

pnpm dev:api   # http://localhost:3001
pnpm dev:web   # http://localhost:8080
```

## Deploying for real use (no demo data)

Same steps, except skip `pnpm seed` — it deliberately refuses to run with
`NODE_ENV=production`, since it creates demo users sharing one password.
Use this instead:

```bash
pnpm prisma:deploy          # or prisma:migrate on first setup
pnpm seed:accounts          # chart of accounts, rules, FS mappings — no users

# creates exactly one admin account; omit ADMIN_PASSWORD to get a
# random one printed once
ADMIN_EMAIL=you@yourcompany.com ADMIN_PASSWORD='...' pnpm create-admin
```

Log in as that admin and add everyone else from the **Users** page — each
new account gets a random temporary password shown once, which you
communicate out of band. Also set, in `apps/api/.env`:

- `ALLOWED_ORIGINS` — comma-separated list of origins allowed to call the
  API (e.g. your web app's URL). Left unset, the API allows all origins
  and logs a warning — fine for local dev, not for anything public.
- A reverse proxy (Caddy, nginx, Traefik) terminating HTTPS in front of
  both services — neither one does TLS itself.
- A backup plan for the Postgres volume — it's a normal Postgres database,
  so standard `pg_dump`/`pg_basebackup` practice applies.

## Seed data (dev/demo only)

`apps/api/prisma/seed.ts` seeds a starter chart of accounts (Bank,
Creditors, Director's Current Account, Share Capital, a handful of expense
categories — Bank marked `isCash`, Director's Current Account / Share
Capital marked `sensitive`), classification rules, FS mappings, and **one
dev user per role, all sharing `SEED_PASSWORD`** (default `orantix123`):
`admin@orantix.local`, `owner@orantix.local`, `bookkeeper@orantix.local`,
`accountant@orantix.local`, `staff@orantix.local`.

This is for trying the app out, not for anything real — see "Deploying
for real use" above.

## Testing

```bash
cd apps/api
pnpm test
```

Spins up (or reuses) a `orantix_ledger_test` database on the same Postgres
server referenced by `TEST_ADMIN_DATABASE_URL`/`TEST_DATABASE_URL`
(defaults to the same credentials as local dev), runs migrations against
it, and exercises the ledger's posting, reversal, review-routing, and
financial-statement logic end to end. No mocking of the database — these
are the real Prisma models and real Postgres.

## License

AGPL-3.0 — see [LICENSE](LICENSE). Self-hosting, modifying, and using this
commercially for your own bookkeeping is all fine. If you modify it and
run it as a service for others, the AGPL requires you to make your
modified source available to them too.
