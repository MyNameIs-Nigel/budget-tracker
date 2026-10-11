import { isLocalDatabaseUrl } from "./local-database.mjs";

type Env = Record<string, string | undefined>;
const loopback = (value: string | undefined) => {
  try {
    return ["localhost", "127.0.0.1", "[::1]"].includes(
      new URL(value ?? "").hostname,
    );
  } catch {
    return false;
  }
};

export function isLocalTestMode(env: Env = process.env) {
  return (
    env.E2E_AUTH === "1" &&
    !env.VERCEL &&
    !env.VERCEL_ENV &&
    loopback(env.BETTER_AUTH_URL) &&
    isLocalDatabaseUrl(env.DATABASE_URL)
  );
}
export function configuredAdmin(email: string, env: Env = process.env) {
  const admins = (env.ADMIN_EMAILS ?? "nigel.nds.smith@gmail.com")
    .split(",")
    .map((s) => s.trim().toLowerCase());
  return (
    admins.includes(email.toLowerCase()) ||
    (isLocalTestMode(env) && email.toLowerCase() === "owner@budget.test")
  );
}
export function startsDisabled(email: string, env: Env = process.env) {
  return !configuredAdmin(email, env);
}
