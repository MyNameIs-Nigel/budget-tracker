import { money } from "@/lib/budget";
import type { SpendingHistory } from "@/lib/spending-history";

export default function CategorySpending({
  history,
  categoryId,
}: {
  history: SpendingHistory;
  categoryId: string;
}) {
  return (
    <p className="category-history small muted">
      {history.hasTransactions ? (
        <>
          Spent in {history.label}:{" "}
          <strong>
            {money((history.byCategory[categoryId] ?? 0) / 100, true)}
          </strong>
        </>
      ) : (
        <>No transactions recorded in {history.label}.</>
      )}
    </p>
  );
}
