# Budget Tracker

A private checking balance tracker, transaction ledger, and optional budget planner built with Next.js 16, Better Auth,
Drizzle, and PostgreSQL. Designed for Vercel and Neon; this implementation does
not create or deploy either service.

Start in **Checking**: set a bank balance, record money in and out, and see the
running balance after every transaction. Import CSV transactions with your own
column mapping and duplicate review, or export the full ledger. Optional monthly
planning and forecasts remain in **Your plan** and **Looking ahead**.

## Run locally

Use Node.js 24 or newer and npm.

```sh
npm ci
cp .env.example .env.local
docker compose up -d --wait
npm run db:migrate
npm run dev
```

Open [localhost:3000](http://localhost:3000). With the example configuration,
choose **Sign in as local owner**. This creates a fictional local account, with
an empty ledger and no assumed checking balance. Use **Set balance** and log or
import transactions. For optional planning, in **Plan settings**, load a fictional example or import your
private `base.html`, review the preview, choose **Use this plan**, and **Save plan**.
The original HTML is read as data; its scripts are never executed. It remains
ignored by Git. Personal financial values are not embedded in the app's defaults.

Google is optional locally. To use it, set `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET` in `.env.local` and register this authorized redirect URI:
`http://localhost:3000/api/auth/callback/google`.

The local Postgres instance listens only on loopback port 5433. Fake sign-in
requires `E2E_AUTH=1`, loopback URLs for both the app and database, and no
`VERCEL`/`VERCEL_ENV`. It is blocked on all Vercel environments. Tests use only
fictional accounts and amounts; never point local tests at Neon.

## Access and privacy

`ADMIN_EMAILS` is comma-separated, non-secret configuration. Its default is
`nigel.nds.smith@gmail.com`. Configured admin accounts are enabled on their first
Google sign-in. Every other new account starts disabled and sees an access-pending
page. Admins use **Your account → Manage access** to activate or disable accounts.
Disabling takes effect on the next data request, including existing sessions.
Configured admins cannot be disabled in the app.

Each account owns a separate plan and ledger. Admins manage account identities and
access only; they cannot read another user's financial data. Every financial read,
write, and export scopes data to the authenticated user. Mutations validate input
and request origin. Cookies use an app-specific prefix so BUS321 and Budget can
coexist locally.

## Checking and transaction entry

**Set balance** / **Update balance** accepts the bank balance at the end of a date
(today or earlier). The server subtracts already logged activity on that date to
store its opening balance. For example, a $975 bank balance after a logged $25
expense stores a $1,000 opening balance; the expense is counted once. Adding a
new $10 expense that day makes the tracked balance $965. Reconcile again whenever
you want to match a bank statement or correct missing history.

The current balance includes all entries from the starting date through today.
Older entries reconstruct earlier running balances without changing that known
starting point. Future entries show **Scheduled** and **Projected balance**, and
are excluded from today's balance and money-in/out totals. Balances use the full
ledger even when filtering by month. Same-day ordering uses creation time, then
transaction ID as a stable tie breaker; it does not represent bank posting times.
No balance is assumed until you set one. All ledger activity belongs to the one
checking account tracked by each user; card balances remain forecast settings.

Transactions save immediately. **Uncategorized** makes entry possible without
setting up a budget first. You can categorize an entry later. If another tab edits a transaction, an older
edit or delete receives a conflict; refresh the ledger and review the newer
entry before retrying. The monthly plan
comparison is available beneath the ledger when a month is selected. Checking
and forecast snapshots are independent; no migration guesses a checking balance
from a planning value.

Search descriptions with partial words in any order, and combine category,
income/expense, date, and amount filters. Search covers your history unless a
month is selected. **Uncategorized** shows the remaining expenses for that month
or the whole ledger. Category badges show a color dot and the historical category
name; click a badge to change just that expense's category.

Select expense checkboxes, then **Assign category** to apply one spending category
to the selection. A new category replaces the previous category. Select-all covers
matching expenses, up to 200 per batch; income is never selected. Changing a filter
clears the selection. Assignments save atomically, with an updated-row highlight
and **Undo category change** for the most recent assignment (15 minutes, while
this view remains open). Undo restores the original labels, including removed
categories, and refuses to overwrite newer transaction edits. Search and filters
only narrow the list; checking balances and the monthly plan comparison retain
their full-ledger calculations. No matching rows has its own empty state.

## Import transactions from CSV

Choose **Checking → Import CSV**. The file stays in your browser while you select
its delimiter and header row; introductory rows can be skipped. Map date,
description, and either one amount column or separate credit/debit columns.
Choose the date format and sign convention explicitly; an optional type column
supports positive amounts paired with income/expense labels. An optional category
column can be mapped to saved categories; unmatched expense categories remain
Uncategorized. Unused columns are ignored.

Review normalized rows before anything saves. Invalid rows show their CSV record
numbers and errors; skipping them requires an explicit checkbox. Imports allow
up to 500 data records per batch and a 1 MB file. The server also caps validated
JSON at 200 KB; split large files into smaller batches if requested.

Potential duplicates match the same user's date, amount, and direction (money in
or out), including earlier rows in the same file. Review the existing and incoming
entry, then **Skip duplicate** or **Update existing**. If several entries match,
choose the specific entry to update. **Apply to this and all remaining duplicates**
applies that choice only to unresolved matches; earlier choices remain intact.
These are candidate matches, not a claim that two same-amount purchases are the
same event. For distinct purchases with an identical date/amount/direction, log
the additional entry manually after review.

Confirm the final counts to import. The server rechecks the matching transactions
inside the same transaction as the writes; changes since preview require another
review. Imports are atomic and owner-scoped, and manual transaction edits use the
same per-user database lock. Updates keep the existing transaction ID. Reimporting
a file goes through duplicate review again. CSV export can be imported back by
mapping its Date, Type, Description, Category, and Amount columns.

Plans use explicit saves. Unsaved changes remain in memory; the save bar and
navigation warning make that visible. A stale revision receives a conflict rather
than overwriting another tab. Export your unsaved edits as JSON before reloading.
Transactions save immediately and retain their original category label even if the
plan's category is later renamed or removed. Editing an amount, date, or
description preserves that historical category; choosing a different category
explicitly uses its current saved-plan label. CSV export includes the full ledger;
plan JSON contains the current plan only, not transactions.

## Forecast assumptions

Amounts are computed in cents. Monthly interest uses each card's opening balance;
first-month spending and interest are prorated from the balance date. Monthly
income is split evenly over two configurable paydays. Giving follows received
income. Insurance, minimums, and scheduled extra repayments have configurable due
days. One-off events apply once within their month. A promotion includes its end
month and switches to standard APR the following month.

After minimums, extra payments follow your card order, highest current APR, or
smallest balance. Optional surplus sweeping keeps checking at its bank floor
unless planned bills or payments already put it below the floor. Loan inflows are
reported as new borrowing: card payoff does not imply those loans are paid off.
The model estimates monthly cash flow and does not guarantee daily bank balances,
model new loan repayment, or connect to banks. Actual ledger entries update checking running balances. Forecast balance snapshots
remain separate; update those in Plan settings when refreshing a forecast.

## Verification

```sh
npm run lint
npm run typecheck
MIGRATION_TEST_DATABASE_URL=postgresql://budget:budget@localhost:5433/budget_migration_test npm test
DATABASE_URL=postgresql://budget:budget@localhost:5433/budget_e2e_test npm run test:e2e
npm run format:check
```

Create disposable test databases once with
`docker compose exec db createdb -U budget budget_e2e_test` and
`docker compose exec db createdb -U budget budget_migration_test`, and install
Chromium with `npx playwright install chromium`. `test:e2e` validates the target
before migrating the disposable database, building, and running Playwright. It
supplies fictional authentication settings without needing `.env.local` or Google
credentials; database URL query parameters and hosted Vercel environments are
rejected. Playwright tests run
the production build on desktop Chromium and Pixel 7 sizes against that database.
They start their own server on port 3100 and refuse to reuse an existing server or
use the normal development database. Override `E2E_BASE_URL` with another loopback
port if needed. They verify access approval/disable, ownership,
persistence, conflict handling, origin checks, transaction CRUD/running balances, interactive CSV mapping and duplicate review,
atomic import conflicts, import previews,
dark mode, narrow-screen layout, and axe accessibility. Screenshots are written to
ignored `.local/` files. `AGENTS.md` has the editing/testing protocol, and
`docs/SPEC.md` describes acceptance and architecture. GitHub Actions runs lint,
type checking, formatting, unit/script tests, migration integration, and both
browser projects against ephemeral PostgreSQL on every PR.

## Vercel / Neon setup for the owner

1. Create a Neon database. Set its pooled PostgreSQL URL as `DATABASE_URL` in
   Vercel, including Neon’s required TLS configuration.
2. Set `BETTER_AUTH_SECRET` to a generated random secret of at least 32 characters,
   `BETTER_AUTH_URL` to the canonical HTTPS app URL, `GOOGLE_CLIENT_ID`,
   `GOOGLE_CLIENT_SECRET`, and `ADMIN_EMAILS`. Do not set `E2E_AUTH` on Vercel.
3. Add `https://YOUR_APP_HOST/api/auth/callback/google` as an authorized redirect
   URI on the Google OAuth client, and the canonical app origin as an authorized
   JavaScript origin. Use separate Google clients and databases for previews if
   you choose to enable real sign-in there.
4. Commit `vercel.json`, which sets Vercel's Build Command to
   `npm run build:vercel`. Ensure Vercel exposes its system environment variables
   (`VERCEL_ENV`) and set `DATABASE_URL` in the **Production** environment.
   Production builds run `npm run db:migrate` before `npm run build`; migration
   errors fail the build and prevent deployment. Preview, development, and plain
   local builds skip automatic migrations. Use a separate database for previews
   and apply its migrations explicitly if needed.
5. Deploy through Vercel, then sign in as
   the configured owner and import the private reference report through settings.

## Generated SEO and share assets

Set `SITE_URL` to the canonical public origin (defaults to
`https://budget.nigel-smith.dev`). Set it in the production build environment;
metadata and discovery files are generated from this configuration. Previews
must retain `VERCEL_ENV=preview` so they remain excluded from search.

The landing page has canonical, Open Graph, and X large-card metadata plus
WebSite and WebApplication JSON-LD. Only the public landing page is indexable;
account pages retain `noindex, nofollow, noarchive` and are omitted from the
sitemap. Authentication remains the protection for private data; robots rules
are crawler guidance. Development, previews, and loopback origins disallow
crawling and generate an empty sitemap.

All assets are code-generated, with no static social images or favicon files:

- `/opengraph-image` and `/twitter-image`: request-time 1200×630 PNG cards.
- `/icon/32`, `/icon/192`, `/icon/512`: request-time branded PNG icons.
- `/apple-icon`: request-time 180×180 home-screen icon.
- `/favicon.ico`: a generated ICO containing the same 32×32 brand icon.
- `/sitemap.xml`, `/robots.txt`, `/manifest.webmanifest`: generated Next.js metadata routes.

Social cards and icons use `next/og`, inline SVG, and its bundled font without
remote asset requests. Change shared branding and origin configuration in
`lib/seo.ts`. The manifest supplies home-screen identity; there is no offline
service worker. The sitemap deliberately omits `lastmod` rather than inventing a
content modification date on every request.

Run `npm run check` and, after building, `npx playwright test e2e/seo.spec.ts`
to check discovery metadata and the generated binary assets. After deployment,
submit `/sitemap.xml` in your search console and refresh the social platform's
cached preview if it still shows the old card.

## Updating the database schema

Edit `db/schema.ts`, run `npm run db:generate`, review the generated SQL, and commit
the SQL, snapshots, and `db/migrations/meta/_journal.json` together with the app
change. The next production Vercel build applies pending migrations automatically;
you do not need to connect to Neon manually. No GitHub Actions migration job is
required. Vercel's [build configuration](https://vercel.com/docs/project-configuration)
and [system environment variables](https://vercel.com/docs/environment-variables/system-environment-variables)
control the build command and production gate.

`db:migrate` applies committed migrations only; it does not generate SQL, push the
schema, seed data, or reset the database. Applied migrations are skipped on reruns.
A PostgreSQL transaction advisory lock serializes simultaneous migration runs,
including on Neon's pooled connections. Pending SQL and migration history commit
together or roll back together on error. Connection, lock, and statement timeouts
bound waiting. The runner also checks the hashes and timestamps of all applied
migrations, rejecting edited/deleted history or an older checkout. Keep applied
SQL and journal entries unchanged; create a new migration for every schema update.

Review SQL for destructive changes and keep migrations compatible with the running
app. The current deployment stays live while the new build runs, and a later build
or deployment failure does not undo a successful migration. Prefer adding a column,
deploying code that uses it, then removing old columns in a later release. Vercel
rollback/promotion without a rebuild does not run this hook or roll back the schema;
deploy a new production build for schema updates. Transaction-incompatible SQL
(such as `CREATE INDEX CONCURRENTLY`) needs a separate planned operation.

To verify concurrency, reruns, history protection, and rollback with PostgreSQL,
create a **disposable local** database named `budget_migration_test`, then run:

```sh
MIGRATION_TEST_DATABASE_URL=postgresql://budget:budget@localhost:5433/budget_migration_test npm run test:scripts
```

The integration test resets that database's `public` and `drizzle` schemas and
refuses non-loopback hosts or other database names. Without the test URL, script
tests run the deployment guards and skip database integration tests.

No real Google callback was exercised during local automated tests; the provider
uses Better Auth's [documented Google integration](https://better-auth.com/docs/authentication/google)
and [Next.js handler](https://better-auth.com/docs/integrations/next). Google and
Neon credentials still need to be supplied by the owner for those live services.

`npm audit` reports upstream development-tool advisories in Next's lint tooling
(`braces`). They do not appear in the production dependency audit. The esbuild
override keeps Drizzle's legacy loader on a patched esbuild release. Do not
downgrade Next via `npm audit fix --force`; upgrade the affected upstream lint
tooling when a compatible fix is available.
