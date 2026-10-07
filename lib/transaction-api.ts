import "server-only";
import { getPlan } from "./store";
import type { Plan } from "./budget";
import { HttpError } from "./http";
export async function categoryName(
  userId: string,
  categoryId: string,
  kind: "income" | "expense",
) {
  if (kind === "income") {
    if (categoryId !== "income")
      throw new HttpError(400, "Choose the income category.");
    return "Income";
  }
  const fixed = {
    bills: "Insurance & bills",
    giving: "Giving",
    debt: "Debt payments",
  };
  if (Object.hasOwn(fixed, categoryId))
    return fixed[categoryId as keyof typeof fixed];
  const p = await getPlan(userId);
  const c = (p.data as Plan).categories.find((c) => c.id === categoryId);
  if (!c) throw new HttpError(400, "Choose a category from your saved budget.");
  return c.name;
}
