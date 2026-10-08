import { z } from "zod";
import { transactionSchema } from "./ledger";
import { transactionOrder } from "./checking";
import type { Transaction } from "./store";

export const importRowSchema = transactionSchema.extend({
  row: z.number().int().min(1).max(1_000_000),
});
export type ImportRow = z.infer<typeof importRowSchema>;
export type ResolvedImportRow = ImportRow & { categoryName: string };

const snapshotSchema = transactionSchema.extend({
  id: z.string().min(1).max(60),
  categoryName: z.string().min(1).max(80),
  createdAt: z.string().datetime(),
});
const decisionSchema = z.object({
  row: z.number().int().min(1).max(1_000_000),
  action: z.enum(["skip", "update"]),
  targetId: z.string().min(1).max(60).optional(),
  expected: snapshotSchema.optional(),
});
export type ImportDecision = z.infer<typeof decisionSchema>;
export const importTransactionsSchema = z
  .object({
    rows: z
      .array(importRowSchema)
      .min(1, "Choose at least one transaction.")
      .max(500, "Import at most 500 transactions at a time."),
    decisions: z.array(decisionSchema).max(500).default([]),
    reviewToken: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .optional(),
    commit: z.boolean().default(false),
  })
  .superRefine((input, ctx) => {
    if (new Set(input.rows.map((row) => row.row)).size !== input.rows.length)
      ctx.addIssue({
        code: "custom",
        path: ["rows"],
        message: "CSV row numbers must be unique.",
      });
    if (
      new Set(input.decisions.map((decision) => decision.row)).size !==
      input.decisions.length
    )
      ctx.addIssue({
        code: "custom",
        path: ["decisions"],
        message: "Choose one action per duplicate row.",
      });
  });

export type ImportDuplicate = {
  row: number;
  incoming: ImportRow;
  matches: Transaction[];
};
export type ImportPreview = {
  duplicates: ImportDuplicate[];
  newCount: number;
  reviewToken: string;
};
export type ImportResult = {
  transactions: Transaction[];
  added: number;
  updated: number;
  skipped: number;
};

export const duplicateKey = (
  t: Pick<ImportRow, "date" | "kind" | "amountCents">,
) => `${t.date}:${t.kind}:${t.amountCents}`;

export function stagedTransaction(row: ResolvedImportRow): Transaction {
  return {
    id: `csv-row-${row.row}`,
    date: row.date,
    kind: row.kind,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    description: row.description,
    amountCents: row.amountCents,
    createdAt: "1970-01-01T00:00:00.000Z",
  };
}

/** Earlier rows in the same file are candidates, so one import cannot add them twice. */
export function findImportDuplicates(
  rows: readonly ResolvedImportRow[],
  existing: readonly Transaction[],
) {
  const candidates = new Map<string, Transaction[]>();
  for (const transaction of [...existing].sort(transactionOrder)) {
    const key = duplicateKey(transaction);
    candidates.set(key, [...(candidates.get(key) ?? []), transaction]);
  }
  const duplicates: ImportDuplicate[] = [];
  let newCount = 0;
  for (const row of rows) {
    const key = duplicateKey(row);
    const matches = candidates.get(key);
    if (matches) duplicates.push({ row: row.row, incoming: row, matches });
    else {
      newCount++;
      candidates.set(key, [stagedTransaction(row)]);
    }
  }
  return { duplicates, newCount };
}

export class ImportConflictError extends Error {
  constructor() {
    super(
      "Transactions changed while you were reviewing. Review the duplicates again.",
    );
  }
}

function sameSnapshot(actual: Transaction, expected: Transaction) {
  return (Object.keys(actual) as (keyof Transaction)[]).every(
    (field) => actual[field] === expected[field],
  );
}

/** Validate every decision before producing any writes. */
export function planTransactionImport(
  rows: readonly ResolvedImportRow[],
  existing: readonly Transaction[],
  decisions: readonly ImportDecision[],
) {
  const preview = findImportDuplicates(rows, existing);
  const duplicates = new Map(
    preview.duplicates.map((duplicate) => [duplicate.row, duplicate]),
  );
  const actions = new Map(
    decisions.map((decision) => [decision.row, decision]),
  );
  if (
    actions.size !== decisions.length ||
    decisions.some((decision) => !duplicates.has(decision.row))
  )
    throw new ImportConflictError();
  const inserts = new Map<string, ResolvedImportRow>();
  const updates = new Map<string, ResolvedImportRow>();
  let updated = 0;
  let skipped = 0;
  for (const row of rows) {
    const duplicate = duplicates.get(row.row);
    if (!duplicate) {
      inserts.set(stagedTransaction(row).id, row);
      continue;
    }
    const decision = actions.get(row.row);
    if (!decision) throw new ImportConflictError();
    if (decision.action === "skip") {
      skipped++;
      continue;
    }
    const target = duplicate.matches.find(
      (match) => match.id === decision.targetId,
    );
    if (
      !target ||
      (decision.expected && !sameSnapshot(target, decision.expected))
    )
      throw new ImportConflictError();
    if (target.id.startsWith("csv-row-")) {
      const prior = inserts.get(target.id);
      if (!prior) throw new ImportConflictError();
      inserts.set(target.id, { ...row, row: prior.row });
    } else updates.set(target.id, row);
    updated++;
  }
  return {
    inserts: [...inserts.values()],
    updates: [...updates.entries()].map(([targetId, row]) => ({
      targetId,
      row,
    })),
    added: inserts.size,
    updated,
    skipped,
  };
}
