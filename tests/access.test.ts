import { expect, it } from "vitest";
import { isLocalTestMode, configuredAdmin, startsDisabled } from "@/lib/access";

it("AUTH-02 new users start disabled; only configured admins bootstrap", () => {
  expect(
    startsDisabled("someone@example.com", {
      ADMIN_EMAILS: "owner@example.com",
    }),
  ).toBe(true);
  expect(
    startsDisabled("OWNER@EXAMPLE.COM", {
      ADMIN_EMAILS: " owner@example.com ",
    }),
  ).toBe(false);
  expect(
    configuredAdmin("impostor@example.com", {
      ADMIN_EMAILS: "owner@example.com",
    }),
  ).toBe(false);
});
it("AUTH-04 test login requires local app and local database and no Vercel", () => {
  const env = {
    E2E_AUTH: "1",
    BETTER_AUTH_URL: "http://localhost:3000",
    DATABASE_URL: "postgresql://a:b@localhost:5433/budget",
  };
  expect(isLocalTestMode(env)).toBe(true);
  for (const VERCEL_ENV of ["production", "preview", "development"])
    expect(isLocalTestMode({ ...env, VERCEL_ENV })).toBe(false);
  expect(isLocalTestMode({ ...env, VERCEL: "1" })).toBe(false);
  expect(
    isLocalTestMode({ ...env, BETTER_AUTH_URL: "https://budget.example.com" }),
  ).toBe(false);
  expect(
    isLocalTestMode({
      ...env,
      DATABASE_URL: "postgresql://a:b@fake.neon.tech/budget",
    }),
  ).toBe(false);
  expect(isLocalTestMode({ ...env, E2E_AUTH: "0" })).toBe(false);
});

it("AUTH-04 rejects connection parameters that override the apparent local database host", () => {
  const env = {
    E2E_AUTH: "1",
    BETTER_AUTH_URL: "http://localhost:3100",
  };
  for (const DATABASE_URL of [
    "postgresql://localhost/budget?host=remote.example",
    "postgresql://localhost/budget?%68ost=remote.example",
    "postgresql://localhost/budget?host=/tmp/postgres",
    "https://localhost/budget",
  ])
    expect(isLocalTestMode({ ...env, DATABASE_URL })).toBe(false);
});
