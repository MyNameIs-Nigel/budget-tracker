import nextEnv from "@next/env";
import { sql } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

export function migrationDatabaseUrl(
  env = process.env,
  loadLocalEnv = () => nextEnv.loadEnvConfig(process.cwd()),
) {
  // Hosted builds must use their scoped credentials, never an .env fallback.
  if (!env.VERCEL && !env.VERCEL_ENV) loadLocalEnv();
  if (!env.DATABASE_URL)
    throw new Error("Set DATABASE_URL before running migrations.");
  return env.DATABASE_URL;
}

export async function runMigrations(
  databaseUrl,
  migrationsFolder = "./db/migrations",
) {
  const config = { migrationsFolder };
  const migrations = readMigrationFiles(config);
  for (const [index, migration] of migrations.entries()) {
    if (
      !Number.isSafeInteger(migration.folderMillis) ||
      (index > 0 &&
        migration.folderMillis <= migrations[index - 1].folderMillis)
    ) {
      throw new Error("Migration timestamps must be unique and increasing.");
    }
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    connectionTimeoutMillis: 10_000,
  });
  try {
    await drizzle(pool).transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL lock_timeout = '30s'`);
      await tx.execute(sql`SET LOCAL statement_timeout = '120s'`);
      // Transaction locks work with Neon's pooled connections. Hold this before
      // reading history or creating the ledger, including on a fresh database.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(193582731, 1)`);

      const ledger = await tx.execute(
        sql`SELECT to_regclass('drizzle.__drizzle_migrations') AS name`,
      );
      if (ledger.rows[0].name) {
        const applied = await tx.execute(sql`
          SELECT hash, created_at FROM drizzle.__drizzle_migrations
          ORDER BY created_at, id
        `);
        for (const [index, row] of applied.rows.entries()) {
          const migration = migrations[index];
          if (
            !migration ||
            Number(row.created_at) !== migration.folderMillis ||
            row.hash !== migration.hash
          ) {
            throw new Error(
              "Migration history differs from this checkout. Restore applied SQL and journal entries; add a new migration instead.",
            );
          }
        }
      }

      // Drizzle's nested transaction uses a savepoint on the same connection.
      // The outer transaction covers the ledger, pending SQL, and advisory lock.
      await migrate(tx, config);
    });
    console.log("Database migrations complete.");
  } finally {
    await pool.end();
  }
}

if (import.meta.main) await runMigrations(migrationDatabaseUrl());
