import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { migrationDatabaseUrl } from "../scripts/db-migrate.mjs";
import { buildForVercel } from "../scripts/vercel-build.mjs";

test("Vercel configuration selects the guarded build command", () => {
  const config = JSON.parse(
    readFileSync(new URL("../vercel.json", import.meta.url)),
  );
  assert.equal(config.buildCommand, "npm run build:vercel");
});

test("production migrates before building", () => {
  const calls = [];
  buildForVercel({ VERCEL_ENV: "production" }, (script) => calls.push(script));
  assert.deepEqual(calls, ["db:migrate", "build"]);
});

for (const target of [undefined, "preview", "development", "staging"]) {
  test(`${target ?? "local"} builds never automatically migrate`, () => {
    const calls = [];
    buildForVercel({ VERCEL_ENV: target, NODE_ENV: "production" }, (script) =>
      calls.push(script),
    );
    assert.deepEqual(calls, ["build"]);
  });
}

test("a migration failure blocks the build", () => {
  const calls = [];
  assert.throws(() =>
    buildForVercel({ VERCEL_ENV: "production" }, (script) => {
      calls.push(script);
      throw new Error("migration failed");
    }),
  );
  assert.deepEqual(calls, ["db:migrate"]);
});

test("hosted migrations require scoped credentials without loading env files", () => {
  for (const env of [{ VERCEL: "1" }, { VERCEL_ENV: "production" }]) {
    assert.throws(
      () =>
        migrationDatabaseUrl(env, () => {
          assert.fail("must not load local credentials");
        }),
      /Set DATABASE_URL/,
    );
  }
});

test("manual local migrations can load local environment files", () => {
  const env = {};
  assert.equal(
    migrationDatabaseUrl(env, () => {
      env.DATABASE_URL = "postgresql://localhost/budget";
    }),
    "postgresql://localhost/budget",
  );
});
