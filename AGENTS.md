<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Working on Budget Tracker

## Start here

Read `README.md` for setup and user behavior and `docs/SPEC.md` for acceptance
criteria before editing. Check `git status` and the branch baseline; preserve
unrelated changes. Use Node.js 24 or newer and `npm ci` with the committed lockfile.
Do not substitute a different Next.js major or use `npm audit fix --force`.

This is a private, single-checking-account ledger per user, with optional budget
planning and debt forecasts. Checking is the default view. Forecast balance
snapshots are independent of the actual ledger: never infer or overwrite one
from the other. `base.html` is a private, ignored source report, not a fixture.
Use fictional accounts, descriptions, and amounts in code, tests, and screenshots.

## Run the app locally

1. Start Docker Desktop, then `docker compose up -d --wait` (PostgreSQL 17 on
   `127.0.0.1:5433`, database/user/password `budget`).
2. If `.env.local` does not exist, copy `.env.example` to `.env.local`. Never
   overwrite an existing environment file or print its secret values.
3. Confirm `DATABASE_URL` targets that local database before `npm run db:migrate`.
4. Run `npm run dev` and open `http://localhost:3000`. Use **Sign in as local
   owner** with `E2E_AUTH=1`; Google credentials are unnecessary for local work.
5. Production-mode local serving is `npm run build`, then `npm start`.

Keep the browser origin consistent with `BETTER_AUTH_URL`; `localhost` and
`127.0.0.1` are different cookie/origin identities. Fake sign-in requires local
app and PostgreSQL URLs, no database query parameters, and no Vercel environment.
Do not weaken those guards to make tests pass. Plain `build` never migrates.

## Code map and contracts

- `app/`: App Router pages and route handlers. This repo enables Cache Components;
  request-time authenticated server components sit inside Suspense. Read the
  installed Next.js guides for the APIs you touch (especially route handlers,
  server/client boundaries, authentication, and testing). Await route `params`
  and request APIs. Never put private financial reads in a shared cache.
- `lib/auth.ts`, `access.ts`, `dal.ts`: Better Auth, admin configuration, and
  fresh database access checks. An existing session must lose financial access
  on its next request after disabling. Admins manage access, not other ledgers.
- `lib/http.ts`: API auth, exact origin checks, bounded JSON reads, no-store
  responses, and public error messages. Validate and authorize every mutation;
  preserve Next.js control-flow errors via `unstable_rethrow`. Do not log payloads
  or credentials. `lib/request-limits.ts` shares the 200 KB JSON byte limit.
- `lib/store.ts`, `transaction-api.ts`: owner-scoped reads and per-owner advisory
  transaction locks. All transaction writes, imports, and reconciliation use the
  same lock. Within a transaction, pass its connection to helpers; do not hold a
  pooled connection while requesting another one. Transactions retain historical
  category names unless the user explicitly changes the category or direction.
  PATCH sends `expected` alongside new fields; DELETE sends `{ expected }`. Both
  compare the prior mutable-field snapshot inside the lock and reject stale
  edits/deletes with 409. Keep this protection compatible with CSV imports.
- `lib/budget.ts`: Zod plan validation and pure cents-based forecast calculations.
  Promotions end inclusively; first-month timing is partial; borrowed cash is
  still debt. Changing these assumptions requires behavioral regression tests.
- `lib/checking.ts`: opening checkpoints, full-ledger running balances, stable
  date/creation/ID ordering, and exclusion of future entries from today's balance.
  UI reconciliation accepts a closing bank balance and converts it on the server.
- `lib/csv-import.ts`, `import-transactions.ts`: data-only parsing, mapping,
  duplicate candidates, and atomic import planning. A duplicate is a candidate,
  not proof of identity. Keep explicit review, owner scope, and stale-review 409s.
  Never evaluate imported HTML/JS or CSV formulas.
- `components/Dashboard.tsx`: editable plan and last-saved snapshot/revision.
  Saving must preserve edits made while the request is pending. Ledger comparisons
  and category selection use the saved plan. `Ledger`, `CheckingBalance`, and
  `CsvImport` own the checking flows; keep keyboard, mobile, and error states usable.
- `db/schema.ts`, `db/migrations/`: PostgreSQL schema and committed history.
  Add a migration for schema changes; commit SQL, snapshot, and journal together.
  Applied SQL/history is immutable. Never use schema push, reset shared data, or
  edit an applied migration to fix drift. Test upgrades as well as fresh installs.
- `lib/seo.ts` and metadata routes: public landing metadata and generated images;
  account pages remain noindex. SEO is not an authorization boundary.

## Testing protocol

For a bug, first reproduce it with a regression at the right layer, observe the
failure, then fix it and run the targeted test. Count root causes rather than
individual assertions or files. Don't call mocked/unit coverage browser evidence.

- Pure domain/validation work: `npx vitest run tests/<name>.test.ts`. Cover edge
  cases and externally meaningful invariants (e.g. cash/debt conservation), not
  tests that merely mirror implementation.
- Script and deployment guards: `npm run test:scripts`. Without
  `MIGRATION_TEST_DATABASE_URL`, the database integration suite is **skipped**;
  don't report a full migration pass in that case.
- API, auth, persistence, and UI work: production-build Playwright on desktop and
  mobile, backed by disposable local PostgreSQL. Use actual requests to check
  ownership, disabled sessions, 400/403/404/409 behavior, persistence, and races.
  Check affected dialogs with axe and keyboard interactions where relevant.
- Before a PR: lint, typecheck, unit/script tests, formatting, and a production
  build. Run both browser projects for application changes and migration
  integration for database/guard changes. Inspect the final diff for secrets,
  unintended generated files, and unrelated changes. Report actual results and
  skips separately from remote CI and any untested live integrations.

Create test databases once (an "already exists" error means reuse the disposable
one; do not reset the development database):

```sh
docker compose exec db createdb -U budget budget_e2e_test
docker compose exec db createdb -U budget budget_migration_test
npx playwright install chromium
npm run lint
npm run typecheck
npm run format:check
MIGRATION_TEST_DATABASE_URL=postgresql://budget:budget@localhost:5433/budget_migration_test npm test
DATABASE_URL=postgresql://budget:budget@localhost:5433/budget_e2e_test npm run test:e2e
```

`test:e2e` validates the target, migrates **only** the disposable database, builds,
then starts its own production server on port 3100. It supplies fictional auth
and fixed SEO configuration without reading local credentials into the test
runner. The default DB is `budget_e2e_test` on port 5433; an exported `DATABASE_URL`
must pass the same guard. No normal development DB, remote host, connection query
parameters, or hosted Vercel environment is accepted. Playwright never reuses an
existing server. Override `E2E_BASE_URL=http://localhost:3200` for a port conflict;
use an explicit port. Avoid concurrent Next.js builds/dev/typegen in one checkout.

For a targeted browser run, append arguments, for example:
`npm run test:e2e -- --project=desktop --grep 'LEDGER-02'`. After an unchanged
successful build, `npx playwright test` with the same `DATABASE_URL` skips rebuilding.
If app code changes, rebuild. Failure traces/screenshots are in `test-results/`;
visual artifacts are in `.local/`, both ignored. CI in `.github/workflows/checks.yml`
runs the same checks with ephemeral PostgreSQL and no deployment credentials.

The migration integration test drops `public` and `drizzle` schemas. Its URL must
name a local `budget_migration_test` database (optional test suffix), **never** an
app database. Both test suites validate the connection before opening it. Do not
use port forwards to hosted databases as "local" test targets.

## Deployment and reporting

Production Vercel builds run `build:vercel`, which migrates only for
`VERCEL_ENV=production` and fails closed. Migrations can succeed even if the
subsequent build fails, so keep schema changes compatible with the running app.
Do not deploy, change production configuration, or migrate a hosted database
without explicit authorization for the exact target. A PR request authorizes
committing, pushing, and opening the PR; it does not authorize merging it.

Keep audit findings reproducible. Use severe for potential financial-data loss or
access-boundary failure, moderate for broken core behavior/resource bounds, and
light for localized validation or misleading feedback. Record fixes and remaining
limitations in the PR; do not count test/docs improvements as fixed product bugs.
