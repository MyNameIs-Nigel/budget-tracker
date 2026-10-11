# Budget Tracker

A private, mobile-first budget planner and spending ledger. Google is the only
production sign-in provider. Each approved account owns its own data. The owner
configured by `ADMIN_EMAILS` can approve and disable accounts, but cannot browse
their financial data. The default owner is Nigel; new non-owner accounts start
disabled, can sign in, and see an access-pending page.

## Acceptance

- AUTH-01: signed-out visitors cannot read or write plans, transactions, or exports.
- AUTH-02: new non-admin accounts start disabled; every data request checks the
  current database flag, so disabling an existing session takes effect immediately.
- AUTH-03: only the configured admin can activate accounts. Admins cannot disable
  themselves or another configured admin. Budget data is scoped by session user ID.
- AUTH-04: local fake sign-in requires `E2E_AUTH=1`, a loopback auth URL, a loopback
  database host, and no Vercel environment. It cannot be enabled on Vercel.
- PLAN-01: income, giving, insurance, card minimums, extra repayment, categories,
  balances, APR changes, horizon, and one-off cash events are editable and persisted.
- PLAN-02: allocation controls cap increases at available income. Reducing income
  can leave an over-budget plan; show the shortfall without silently changing it.
- PLAN-03: explicit save, dirty warning, retryable failure, optimistic version checks,
  and an import preview prevent silently losing changes or overwriting another tab.
- FORECAST-01: use cents; accrue estimated monthly APR interest on opening debt
  balances; prorate the first month's interest and spending by remaining days.
  Receive monthly income in two equal installments on configurable days. Giving
  follows received income. Insurance/minimums/extra fall on configurable due days.
- FORECAST-02: pay minimums, then explicit extra by chosen priority, then optionally
  sweep checking above its floor. Roll unused extra to the next debt; never pay a
  negative balance. Rates switch the month AFTER the inclusive promotion end.
- FORECAST-03: one-off inflows/outflows occur once in their month. Giving applies
  only to flagged positive inflows. Borrowed inflows remain explicitly reported as
  new borrowing; paying a card with a loan does not mean total debt disappeared.
- FORECAST-04: show floor breaches, monthly cash flow, interest, and payoff dates.
  Warn that this is a monthly estimate, not a bank feed or daily payment guarantee.
  Actual transactions do not automatically change balance snapshots or forecasts.
- LEDGER-01: Checking is the default view. Add, edit, and delete dated income/expense
  records without requiring a plan; filter by month or show all; optionally compare
  monthly actual category spending to the current plan; export the full ledger CSV.
- CHECKING-01: save an owner-scoped signed-cents opening checkpoint with optimistic
  revision checks. The UI accepts an end-of-day bank balance and atomically subtracts
  already logged same-day activity to avoid double counting. Existing data is preserved;
  no initial actual balance is guessed from forecast settings.
- CHECKING-02: derive running balances over the whole ledger with stable date/creation/ID
  ordering, including history before the checkpoint. Same-day and subsequent CRUD/import
  activity updates checking; future entries are labelled projected and excluded from
  today's balance. Filtering never resets a balance. Forecast snapshots remain separate.
- CSV-01: explicit delimiter, header-row, column, date-format, amount-sign/type, and
  category mapping. Support quoted delimiters/newlines/escaped quotes and separate
  credit/debit columns. Show normalized preview and row errors; invalid row skipping
  requires acknowledgement. Bound imports to 500 records, 1 MB files, 200 KB JSON.
- CSV-02: candidates match owner/date/cents/direction, including in-file duplicates.
  Compare incoming and existing values, choose skip/update, select targets for multiple
  matches, and optionally apply a choice to this and all unresolved matches. Preserve
  earlier choices. Final confirmation precedes all writes.
- CSV-03: an import review token fingerprints input and matching records; recheck under
  the same per-owner PostgreSQL transaction advisory lock used by CRUD/reconciliation.
  Changed matches reject the entire commit with 409. Atomic import updates retain IDs;
  all authenticated reads/writes/exports preserve owner boundaries and origin checks.
- LEDGER-02: editing a transaction's amount, date, or description preserves its
  historical category identity and label, including after a category is removed.
  Explicit category/direction changes resolve against the saved plan.
- LEDGER-03: malformed transaction IDs return 404 before querying PostgreSQL.
- LEDGER-04: manual edits and deletes require the previously read mutable-field
  snapshot. Compare it under the owner ledger lock; stale writes return 409 and
  preserve newer data, including changes made by imports. The UI retains failed
  form edits and tells users to refresh before retrying.
- LEDGER-05: category badges display a visible label and stable color indicator;
  expenses can be recategorized directly. Description search matches every partial
  word regardless of case/order. Combine category, direction, inclusive date and
  amount filters; distinguish an empty ledger from no matches. Filtering preserves
  full-ledger balances and selected-month totals/comparisons. Changing filters
  clears expense selections. Income cannot receive spending categories.
- LEDGER-06: assign one spending category to selected expenses (up to 200 and the
  shared JSON byte limit). Check every owner-scoped prior snapshot under the ledger
  lock before writing; stale batches reject atomically. Report changed counts,
  highlight updated rows, and offer a 15-minute undo for the latest assignment.
  A server-signed, owner-bound undo receipt restores historical category labels
  only when every affected transaction still matches its post-assignment snapshot.
- IMPORT-01: read the private reference HTML as data, never execute its scripts.
  Import the original categories, suggestions, debt assumptions, balances, and events.
  Preview and explicitly save. No private report values are shipped as app defaults.
- UI-01: match BUS321's Geist typography, pill controls, thin borders, compact shell,
  150ms hover/focus feedback and 180ms appearance indicator; use amber colors.
  Support light/system/dark, 44px touch targets, reduced motion, and narrow screens.

## Architecture

Next.js 16 App Router and Cache Components, React 19, Tailwind 4. Request-time
authenticated components stream inside Suspense; financial reads never use a
shared cache. Better Auth Google OAuth/OIDC, Drizzle with node-postgres, and
Neon-compatible PostgreSQL. Auth tables, one versioned JSONB plan per user, and a
transaction ledger and separate versioned checking checkpoint with user foreign keys. All mutations authenticate, authorize,
check same-origin requests and validate inputs. Auth cookies have an app-specific
prefix to avoid collisions with BUS321 on localhost.

Production uses Vercel and Neon. Vercel's configured build command runs committed
migrations before building only when `VERCEL_ENV=production`, failing deployment
on migration errors. Plain local and preview builds skip automatic migrations.
The migration runner serializes runs with a transaction advisory lock, validates
applied history hashes/timestamps, and commits pending SQL and history atomically.
Applied migrations are immutable and future changes must remain compatible with
the app serving traffic during deployment. Local development and tests use
isolated Postgres. No deployment is part of this implementation.
