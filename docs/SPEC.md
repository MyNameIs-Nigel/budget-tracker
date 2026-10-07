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
- LEDGER-01: add, edit, and delete dated income/expense records; filter by month;
  compare actual category spending to the current plan; export the full ledger CSV.
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
transaction ledger with user foreign keys. All mutations authenticate, authorize,
check same-origin requests and validate inputs. Auth cookies have an app-specific
prefix to avoid collisions with BUS321 on localhost.

Production uses Vercel and Neon. Migrations are an explicit operator command;
builds do not mutate databases. Local development and tests use isolated Postgres.
No deployment is part of this implementation.
