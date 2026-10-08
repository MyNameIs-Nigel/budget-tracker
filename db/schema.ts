import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { Plan } from "@/lib/budget";
const time = (name: string) => timestamp(name, { withTimezone: true });

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  disabled: boolean("disabled").notNull().default(true),
  createdAt: time("created_at").notNull().defaultNow(),
  updatedAt: time("updated_at").notNull().defaultNow(),
});
export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: time("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: time("created_at").notNull(),
    updatedAt: time("updated_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);
export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: time("access_token_expires_at"),
    refreshTokenExpiresAt: time("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: time("created_at").notNull(),
    updatedAt: time("updated_at").notNull(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);
export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: time("expires_at").notNull(),
  createdAt: time("created_at").defaultNow(),
  updatedAt: time("updated_at").defaultNow(),
});
export const plans = pgTable("plans", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  data: jsonb("data").$type<Plan>().notNull(),
  revision: integer("revision").notNull().default(0),
  updatedAt: time("updated_at").notNull().defaultNow(),
});
export const checkingBalances = pgTable(
  "checking_balances",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    asOf: date("as_of").notNull(),
    balanceCents: integer("balance_cents").notNull(),
    revision: integer("revision").notNull().default(0),
    updatedAt: time("updated_at").notNull().defaultNow(),
  },
  (t) => [check("checking_revision_nonnegative", sql`${t.revision} >= 0`)],
);
export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    kind: text("kind").$type<"income" | "expense">().notNull(),
    categoryId: text("category_id").notNull(),
    categoryName: text("category_name").notNull(),
    description: text("description").notNull(),
    amountCents: integer("amount_cents").notNull(),
    createdAt: time("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("transactions_user_date_idx").on(t.userId, t.date),
    index("transactions_duplicate_idx").on(
      t.userId,
      t.date,
      t.amountCents,
      t.kind,
    ),
    check("positive_amount", sql`${t.amountCents} > 0`),
    check("transaction_kind", sql`${t.kind} in ('income', 'expense')`),
  ],
);
