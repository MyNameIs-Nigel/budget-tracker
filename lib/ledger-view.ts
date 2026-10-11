import type { Transaction } from "./store";

export type LedgerFilters = {
  search: string;
  category: string;
  kind: string;
  from: string;
  to: string;
  minimum: string;
  maximum: string;
};

export const emptyLedgerFilters: LedgerFilters = {
  search: "",
  category: "",
  kind: "",
  from: "",
  to: "",
  minimum: "",
  maximum: "",
};

/** Search terms may appear in any order; amounts are unsigned dollars. */
export function matchesLedgerFilters(row: Transaction, filters: LedgerFilters) {
  const terms = filters.search
    .trim()
    .toLocaleLowerCase("en-US")
    .split(/\s+/)
    .filter(Boolean);
  const description = row.description.toLocaleLowerCase("en-US");
  return (
    terms.every((term) => description.includes(term)) &&
    (!filters.category || row.categoryId === filters.category) &&
    (!filters.kind || row.kind === filters.kind) &&
    (!filters.from || row.date >= filters.from) &&
    (!filters.to || row.date <= filters.to) &&
    (!filters.minimum ||
      row.amountCents >= Math.round(Number(filters.minimum) * 100)) &&
    (!filters.maximum ||
      row.amountCents <= Math.round(Number(filters.maximum) * 100))
  );
}

export function categoryTone(id: string) {
  let hash = 0;
  for (const character of id)
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return `category-tone-${hash % 6}`;
}
