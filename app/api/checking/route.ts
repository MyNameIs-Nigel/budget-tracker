import { and, eq, sql } from "drizzle-orm";
import { checkingBalances, transactions } from "@/db/schema";
import { today } from "@/lib/budget";
import { checkingBalanceSchema, signedAmount } from "@/lib/checking";
import { apiUser, body, handle, HttpError, json, sameOrigin } from "@/lib/http";
import { getCheckingBalance } from "@/lib/store";
import { withLedgerLock } from "@/lib/transaction-api";

export function GET() {
  return handle(async () =>
    json(await getCheckingBalance((await apiUser()).id)),
  );
}

export function PUT(req: Request) {
  return handle(async () => {
    sameOrigin(req);
    const u = await apiUser();
    const input = await body(req, checkingBalanceSchema);
    if (input.asOf > today())
      throw new HttpError(400, "Choose today or an earlier balance date.");

    const balance = await withLedgerLock(u.id, async (tx) => {
      let balanceCents = input.balanceCents;
      if (input.mode === "closing") {
        const activity = await tx
          .select({
            kind: transactions.kind,
            amountCents: transactions.amountCents,
          })
          .from(transactions)
          .where(
            and(
              eq(transactions.userId, u.id),
              eq(transactions.date, input.asOf),
            ),
          );
        balanceCents -= activity.reduce((sum, t) => sum + signedAmount(t), 0);
        if (balanceCents < -2_147_483_648 || balanceCents > 2_147_483_647)
          throw new HttpError(
            400,
            "This balance is outside the supported range.",
          );
      }
      const fields = {
        asOf: checkingBalances.asOf,
        balanceCents: checkingBalances.balanceCents,
        revision: checkingBalances.revision,
      };
      const [saved] =
        input.revision === null
          ? await tx
              .insert(checkingBalances)
              .values({ userId: u.id, asOf: input.asOf, balanceCents })
              .onConflictDoNothing()
              .returning(fields)
          : await tx
              .update(checkingBalances)
              .set({
                asOf: input.asOf,
                balanceCents,
                revision: sql`${checkingBalances.revision} + 1`,
                updatedAt: new Date(),
              })
              .where(
                and(
                  eq(checkingBalances.userId, u.id),
                  eq(checkingBalances.revision, input.revision),
                ),
              )
              .returning(fields);
      if (!saved)
        throw new HttpError(
          409,
          "Your checking balance changed in another tab. Reload before saving.",
        );
      return saved;
    });
    return json(balance);
  });
}
