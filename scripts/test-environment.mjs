import { assertTestDatabaseUrl } from "../lib/local-database.mjs";

/** Build a fictional test configuration without reading local credential files. */
export function browserTestEnvironment(env = process.env) {
  if (env.VERCEL || env.VERCEL_ENV)
    throw new Error(
      "Browser tests must not run in a hosted Vercel environment.",
    );
  const baseURL = env.E2E_BASE_URL ?? "http://localhost:3100";
  const url = new URL(baseURL);
  if (
    url.protocol !== "http:" ||
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    !url.port ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error(
      "E2E_BASE_URL must be a loopback HTTP origin with an explicit port.",
    );
  const databaseURL = assertTestDatabaseUrl(
    env.DATABASE_URL ??
      "postgresql://budget:budget@localhost:5433/budget_e2e_test",
    "browser",
  );
  return {
    ...env,
    NODE_ENV: "production",
    DATABASE_URL: databaseURL,
    E2E_BASE_URL: url.origin,
    BETTER_AUTH_URL: url.origin,
    BETTER_AUTH_SECRET:
      "fictional-browser-tests-only-secret-at-least-32-characters",
    E2E_AUTH: "1",
    ADMIN_EMAILS: "owner@budget.test",
    GOOGLE_CLIENT_ID: "",
    GOOGLE_CLIENT_SECRET: "",
    VERCEL: "",
    VERCEL_ENV: "",
    // SEO tests exercise the public production metadata with a fixed fixture.
    SITE_URL: "https://budget.nigel-smith.dev",
  };
}
