import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "pg";
import {
  assertTestDatabaseUrl,
  isLocalDatabaseUrl,
} from "../lib/local-database.mjs";
import { browserTestEnvironment } from "../scripts/test-environment.mjs";
import { runBrowserTests } from "../scripts/test-e2e.mjs";

test("local guards reject node-postgres host overrides without opening a connection", () => {
  const value =
    "postgresql://localhost/budget_migration_test?host=remote.example";
  assert.equal(
    new Client({ connectionString: value }).connectionParameters.host,
    "remote.example",
  );
  assert.equal(isLocalDatabaseUrl(value), false);
  assert.throws(
    () => assertTestDatabaseUrl(value, "migration"),
    /disposable local/,
  );
  for (const suite of ["browser", "migration"]) {
    const name = suite === "browser" ? "e2e" : "migration";
    for (const value of [
      `postgresql://remote.example/budget_${name}_test`,
      `postgresql://localhost/budget_${name}_test?%68ost=remote.example`,
      `postgresql://localhost/budget_${name}_test?port=5432`,
      "postgresql://localhost/budget",
      `https://localhost/budget_${name}_test`,
      undefined,
    ])
      assert.throws(
        () => assertTestDatabaseUrl(value, suite),
        /disposable local/,
      );
    for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
      const value = `postgresql://${host}/budget_${name}_test_ci`;
      assert.equal(assertTestDatabaseUrl(value, suite), value);
    }
  }
});

test("browser tests use fictional auth and one origin without inheriting real providers", () => {
  const env = browserTestEnvironment({
    E2E_BASE_URL: "http://127.0.0.1:3200/",
    GOOGLE_CLIENT_ID: "must-not-be-used",
    GOOGLE_CLIENT_SECRET: "must-not-be-used",
    BETTER_AUTH_SECRET: "must-not-be-used",
    ADMIN_EMAILS: "real-admin@example.com",
    E2E_AUTH: "0",
  });
  assert.equal(env.GOOGLE_CLIENT_ID, "");
  assert.equal(env.GOOGLE_CLIENT_SECRET, "");
  assert.notEqual(env.BETTER_AUTH_SECRET, "must-not-be-used");
  assert.equal(env.ADMIN_EMAILS, "owner@budget.test");
  assert.equal(env.E2E_AUTH, "1");
  assert.equal(env.BETTER_AUTH_URL, "http://127.0.0.1:3200");
  assert.equal(env.E2E_BASE_URL, env.BETTER_AUTH_URL);
});

test("unsafe browser environments fail before any command can run", () => {
  for (const env of [
    { VERCEL_ENV: "preview" },
    { VERCEL: "1" },
    { DATABASE_URL: "postgresql://localhost/budget" },
    {
      DATABASE_URL:
        "postgresql://localhost/budget_e2e_test?host=remote.example",
    },
    { E2E_BASE_URL: "https://remote.example:3100" },
    { E2E_BASE_URL: "http://localhost" },
    { E2E_BASE_URL: "http://localhost:3100/path" },
  ])
    assert.throws(() =>
      runBrowserTests(env, [], () => assert.fail("must not start")),
    );
});

test("browser runner migrates the disposable database, builds, then tests with one environment", () => {
  const calls = [];
  runBrowserTests({}, ["--project=desktop"], (command, args, env) =>
    calls.push({ command, args, env }),
  );
  assert.deepEqual(
    calls.map(({ args }) => args),
    [
      ["run", "db:migrate"],
      ["run", "build"],
      ["exec", "--", "playwright", "test", "--project=desktop"],
    ],
  );
  assert.ok(calls.every((call) => call.env === calls[0].env));
  assert.match(calls[0].env.DATABASE_URL, /\/budget_e2e_test$/);
  let count = 0;
  assert.throws(
    () =>
      runBrowserTests({}, [], () => {
        count++;
        throw new Error("migration failed");
      }),
    /migration failed/,
  );
  assert.equal(count, 1);
});
