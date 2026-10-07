import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalDb = globalThis as unknown as { budgetPool?: Pool };
const pool =
  globalDb.budgetPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 3,
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 10_000,
  });
if (process.env.NODE_ENV !== "production") globalDb.budgetPool = pool;
export const db = drizzle(pool, { schema });
