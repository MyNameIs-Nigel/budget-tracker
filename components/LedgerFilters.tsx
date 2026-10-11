import type { LedgerFilters } from "@/lib/ledger-view";
import { emptyLedgerFilters } from "@/lib/ledger-view";

export default function LedgerFiltersBar({
  filters,
  categories,
  uncategorized,
  disabled,
  onChange,
}: {
  filters: LedgerFilters;
  categories: { id: string; name: string }[];
  uncategorized: number;
  disabled: boolean;
  onChange: (filters: LedgerFilters) => void;
}) {
  const update = (key: keyof LedgerFilters, value: string) =>
    onChange({ ...filters, [key]: value });
  const active = Object.values(filters).some(Boolean);
  const labels: Record<keyof LedgerFilters, string> = {
    search: "Search",
    category: "Category",
    kind: "Type",
    from: "From",
    to: "Through",
    minimum: "Minimum",
    maximum: "Maximum",
  };
  return (
    <div className="ledger-filters">
      <label className="stack-field ledger-search">
        <span>Search transactions</span>
        <input
          id="transaction-search"
          type="search"
          placeholder="Search descriptions across your history"
          maxLength={160}
          value={filters.search}
          disabled={disabled}
          onChange={(event) => update("search", event.target.value)}
        />
      </label>
      <div className="ledger-filter-row">
        <label className="stack-field">
          <span>Category filter</span>
          <select
            value={filters.category}
            disabled={disabled}
            onChange={(event) => update("category", event.target.value)}
          >
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label className="stack-field">
          <span>Transaction type</span>
          <select
            value={filters.kind}
            disabled={disabled}
            onChange={(event) => update("kind", event.target.value)}
          >
            <option value="">Money in and out</option>
            <option value="expense">Expenses</option>
            <option value="income">Income</option>
          </select>
        </label>
        <button
          className="btn"
          disabled={disabled}
          aria-pressed={filters.category === "uncategorized"}
          onClick={() =>
            onChange({
              ...filters,
              category:
                filters.category === "uncategorized" ? "" : "uncategorized",
              kind: "",
            })
          }
        >
          Uncategorized · {uncategorized}
        </button>
        <details className="ledger-more-filters">
          <summary>Dates and amounts</summary>
          <div className="ledger-filter-row">
            <label className="stack-field">
              <span>From date</span>
              <input
                type="date"
                value={filters.from}
                disabled={disabled}
                onChange={(event) => update("from", event.target.value)}
              />
            </label>
            <label className="stack-field">
              <span>Through date</span>
              <input
                type="date"
                value={filters.to}
                disabled={disabled}
                onChange={(event) => update("to", event.target.value)}
              />
            </label>
            <label className="stack-field">
              <span>Minimum amount (USD)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={filters.minimum}
                disabled={disabled}
                onChange={(event) => update("minimum", event.target.value)}
              />
            </label>
            <label className="stack-field">
              <span>Maximum amount (USD)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={filters.maximum}
                disabled={disabled}
                onChange={(event) => update("maximum", event.target.value)}
              />
            </label>
          </div>
        </details>
      </div>
      {active && (
        <div
          className="ledger-filter-chips"
          aria-label="Active transaction filters"
        >
          {(Object.keys(filters) as (keyof LedgerFilters)[])
            .filter((key) => filters[key])
            .map((key) => {
              const value =
                key === "category"
                  ? (categories.find((category) => category.id === filters[key])
                      ?.name ?? filters[key])
                  : key === "kind"
                    ? filters[key] === "expense"
                      ? "Expenses"
                      : "Income"
                    : filters[key];
              return (
                <button
                  key={key}
                  className="btn filter-chip"
                  disabled={disabled}
                  aria-label={`Remove ${labels[key].toLowerCase()} filter`}
                  onClick={() => update(key, "")}
                >
                  {labels[key]}: {value} <span aria-hidden="true">×</span>
                </button>
              );
            })}
          <button
            className="text-btn"
            disabled={disabled}
            onClick={() => onChange({ ...emptyLedgerFilters })}
          >
            Clear search and filters
          </button>
        </div>
      )}
      {filters.from && filters.to && filters.from > filters.to && (
        <p className="error-text small" role="status">
          Choose a through date on or after the from date.
        </p>
      )}
      {filters.minimum &&
        filters.maximum &&
        Number(filters.minimum) > Number(filters.maximum) && (
          <p className="error-text small" role="status">
            Choose a maximum amount at least as large as the minimum.
          </p>
        )}
    </div>
  );
}
