# Budget Tracker

A private budget planner and spending ledger built with Next.js 16, Better Auth,
Drizzle, and PostgreSQL. Designed for Vercel and Neon; this implementation does
not create or deploy either service.

Plan monthly income and essentials, allocate spending with capped sliders, and
forecast debt payments, promotional APR changes, checking balances, and one-off
cash changes. Track actual income/expenses separately, compare spending with the
saved plan, and export a transaction CSV or portable plan JSON.

## Run locally

Use Node.js 24 or newer and npm.

```sh
npm ci
cp .env.example .env.local
docker compose up -d
npm run db:migrate
npm run dev
```

Open [localhost:3000](http://localhost:3000). With the example configuration,
choose **Sign in as local owner**. This creates a fictional local account, with
an empty budget. In **Plan settings**, load a fictional example or import your
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

Plans use explicit saves. Unsaved changes remain in memory; the save bar and
navigation warning make that visible. A stale revision receives a conflict rather
than overwriting another tab. Export your unsaved edits as JSON before reloading.
Transactions save immediately and retain their original category label even if the
plan's category is later renamed or removed. CSV export includes the full ledger;
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
model new loan repayment, or connect to banks. Actual ledger entries do not mutate
balance snapshots; update balances in settings when you check your accounts.

## Verification

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run format:check
```

Playwright tests run the production build on desktop Chromium and Pixel 7 sizes
against the local database. They verify access approval/disable, ownership,
persistence, conflict handling, origin checks, transaction CRUD/CSV, import previews,
dark mode, narrow-screen layout, and axe accessibility. Screenshots are written to
ignored `.local/` files. `docs/SPEC.md` describes acceptance and architecture.

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
