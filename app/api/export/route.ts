import { apiUser, handle } from "@/lib/http";
import { getTransactions } from "@/lib/store";
import { csvCell } from "@/lib/ledger";
export function GET() {
  return handle(async () => {
    const u = await apiUser(),
      rows = await getTransactions(u.id);
    const csv = [
      ["Date", "Type", "Category", "Description", "Amount (USD)"],
      ...rows.map((t) => [
        t.date,
        t.kind,
        t.categoryName,
        t.description,
        (t.amountCents / 100).toFixed(2),
      ]),
    ]
      .map((r) => r.map(csvCell).join(","))
      .join("\r\n");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="budget-transactions.csv"',
        "Cache-Control": "private, no-store",
      },
    });
  });
}
