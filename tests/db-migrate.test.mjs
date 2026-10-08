import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { Pool } from "pg";
import { runMigrations } from "../scripts/db-migrate.mjs";

const databaseUrl = process.env.MIGRATION_TEST_DATABASE_URL;

test(
  "migration safety against isolated local PostgreSQL",
  { skip: !databaseUrl },
  async (t) => {
    const url = new URL(databaseUrl);
    assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
    assert.match(url.pathname, /^\/budget_migration_test(?:_[a-z0-9]+)?$/);
    const pool = new Pool({ connectionString: databaseUrl });
    const folder = await mkdtemp(path.join(tmpdir(), "budget-migrations-"));
    const journalFile = path.join(folder, "meta/_journal.json");
    const ledger = () =>
      pool.query(
        "SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id",
      );
    try {
      // This database is disposable and never the app's development database.
      await pool.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
      await pool.query("DROP SCHEMA public CASCADE");
      await pool.query("CREATE SCHEMA public");
      await cp(new URL("../db/migrations/", import.meta.url), folder, {
        recursive: true,
      });
      const journal = JSON.parse(await readFile(journalFile, "utf8"));
      const baseCount = journal.entries.length;
      const initialFile = path.join(folder, `${journal.entries[0].tag}.sql`);
      const initialSql = await readFile(initialFile, "utf8");
      const nextTag = `${String(baseCount).padStart(4, "0")}_test`;
      const nextFile = path.join(folder, `${nextTag}.sql`);
      const appendMigration = async (sql) => {
        if (journal.entries.length === baseCount) {
          journal.entries.push({
            ...journal.entries.at(-1),
            idx: baseCount,
            when: journal.entries.at(-1).when + 1,
            tag: nextTag,
          });
        }
        await writeFile(journalFile, JSON.stringify(journal));
        await writeFile(nextFile, sql);
      };

      // Model upgrading an existing installation, rather than testing only an
      // empty database that already has every current table.
      await writeFile(
        journalFile,
        JSON.stringify({ ...journal, entries: journal.entries.slice(0, 1) }),
      );

      await t.test(
        "overlapping first runs apply each migration once",
        async () => {
          await Promise.all([
            runMigrations(databaseUrl, folder),
            runMigrations(databaseUrl, folder),
            runMigrations(databaseUrl, folder),
          ]);
          assert.equal((await ledger()).rowCount, 1);
        },
      );

      await t.test(
        "additive migrations preserve legacy accounts, plans and transactions without guessing a bank balance",
        async () => {
          await pool.query(`INSERT INTO "user" (id, name, email)
          VALUES ('migration-test', 'Fictional User', 'migration@example.test')`);
          const legacyPlan = {
            fictional: true,
            balances: { asOf: "2026-10-07", checking: 123.45 },
          };
          await pool.query(
            "INSERT INTO plans (user_id, data, revision) VALUES ($1, $2, 7)",
            ["migration-test", JSON.stringify(legacyPlan)],
          );
          await pool.query(`INSERT INTO transactions
            (id, user_id, date, kind, category_id, category_name, description, amount_cents, created_at)
            VALUES ('fed91d8d-0f6d-4079-84ab-9e38fcbcf186', 'migration-test', '2026-10-07',
              'expense', 'legacy-category', 'Historical category', 'Fictional legacy purchase', 1234,
              '2026-10-07T12:00:00Z')`);
          const legacyTransactions = (
            await pool.query("SELECT * FROM transactions ORDER BY id")
          ).rows;
          await writeFile(journalFile, JSON.stringify(journal));
          await Promise.all([
            runMigrations(databaseUrl, folder),
            runMigrations(databaseUrl, folder),
            runMigrations(databaseUrl, folder),
          ]);
          assert.equal((await ledger()).rowCount, baseCount);
          assert.deepEqual(
            (await pool.query("SELECT * FROM transactions ORDER BY id")).rows,
            legacyTransactions,
          );
          assert.equal(
            (await pool.query("SELECT * FROM checking_balances")).rowCount,
            0,
          );
          assert.deepEqual(
            (
              await pool.query(`SELECT
                to_regclass('public.checking_balances') AS checking_table,
                to_regclass('public.transactions_duplicate_idx') AS duplicate_index`)
            ).rows,
            [
              {
                checking_table: "checking_balances",
                duplicate_index: "transactions_duplicate_idx",
              },
            ],
          );
          const before = (await ledger()).rows;
          await runMigrations(databaseUrl, folder);
          await runMigrations(databaseUrl, folder);
          assert.deepEqual((await ledger()).rows, before);
          assert.deepEqual(
            (await pool.query("SELECT data, revision FROM plans")).rows,
            [{ data: legacyPlan, revision: 7 }],
          );
          assert.equal((await pool.query('SELECT * FROM "user"')).rowCount, 1);
        },
      );

      await t.test(
        "editing applied SQL blocks pending migrations",
        async () => {
          await appendMigration("CREATE TABLE migration_marker (id integer);");
          await writeFile(
            initialFile,
            initialSql + "\n-- edited after application\n",
          );
          await assert.rejects(
            runMigrations(databaseUrl, folder),
            /history differs/,
          );
          assert.equal((await ledger()).rowCount, baseCount);
          assert.equal(
            (
              await pool.query(
                "SELECT to_regclass('public.migration_marker') AS name",
              )
            ).rows[0].name,
            null,
          );
          await writeFile(initialFile, initialSql);
        },
      );

      await t.test(
        "failed SQL rolls back DDL and ledger; a corrected retry succeeds",
        async () => {
          await appendMigration(
            "CREATE TABLE migration_marker (id integer);\n--> statement-breakpoint\nSELECT * FROM missing_migration_test_table;",
          );
          await assert.rejects(runMigrations(databaseUrl, folder));
          assert.equal((await ledger()).rowCount, baseCount);
          assert.equal(
            (
              await pool.query(
                "SELECT to_regclass('public.migration_marker') AS name",
              )
            ).rows[0].name,
            null,
          );
          await appendMigration("CREATE TABLE migration_marker (id integer);");
          await Promise.all([
            runMigrations(databaseUrl, folder),
            runMigrations(databaseUrl, folder),
          ]);
          assert.equal((await ledger()).rowCount, baseCount + 1);
        },
      );

      await t.test(
        "older checkouts and changed journal timestamps fail closed",
        async () => {
          await writeFile(
            journalFile,
            JSON.stringify({
              ...journal,
              entries: journal.entries.slice(0, baseCount),
            }),
          );
          await assert.rejects(
            runMigrations(databaseUrl, folder),
            /history differs/,
          );
          journal.entries[baseCount].when += 1;
          await writeFile(journalFile, JSON.stringify(journal));
          await assert.rejects(
            runMigrations(databaseUrl, folder),
            /history differs/,
          );
          assert.equal((await ledger()).rowCount, baseCount + 1);
        },
      );

      await t.test("out-of-order timestamps are rejected", async () => {
        journal.entries[baseCount].when = journal.entries[baseCount - 1].when;
        await writeFile(journalFile, JSON.stringify(journal));
        await assert.rejects(
          runMigrations(databaseUrl, folder),
          /unique and increasing/,
        );
      });
    } finally {
      await pool.end();
      await rm(folder, { recursive: true, force: true });
    }
  },
);
