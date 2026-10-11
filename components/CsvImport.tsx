"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, FileUp, LoaderCircle, X } from "lucide-react";
import { money, type Plan } from "@/lib/budget";
import {
  CSV_FILE_LIMIT,
  mapCsvRows,
  parseCsv,
  type CsvDelimiter,
  type CsvMapping,
} from "@/lib/csv-import";
import type {
  ImportDecision,
  ImportPreview,
  ImportResult,
} from "@/lib/import-transactions";
import type { Transaction } from "@/lib/store";
import { JSON_BODY_LIMIT } from "@/lib/request-limits";
import "./CsvImport.css";

const styles = {
  actionButtons: "csv-import-action-buttons",
  actions: "csv-import-actions",
  activeStep: "csv-import-active-step",
  amount: "csv-import-amount",
  categoryList: "csv-import-category-list",
  categoryMapping: "csv-import-category-mapping",
  categoryRow: "csv-import-category-row",
  checkbox: "csv-import-checkbox",
  columns: "csv-import-columns",
  comparison: "csv-import-comparison",
  comparisonCard: "csv-import-comparison-card",
  confirmIcon: "csv-import-confirm-icon",
  content: "csv-import-content",
  decisions: "csv-import-decisions",
  dialog: "csv-import-dialog",
  header: "csv-import-header",
  headerRecord: "csv-import-header-record",
  invalid: "csv-import-invalid",
  money: "csv-import-money",
  notice: "csv-import-notice",
  rawPreview: "csv-import-raw-preview",
  srOnly: "csv-import-sr-only",
  stepTitle: "csv-import-step-title",
  steps: "csv-import-steps",
  summary: "csv-import-summary",
  table: "csv-import-table",
  tableScroll: "csv-import-table-scroll",
  upload: "csv-import-upload",
};

type Step = "map" | "review" | "duplicates" | "confirm";
const stepNames = {
  map: "Map columns",
  review: "Review rows",
  duplicates: "Resolve duplicates",
  confirm: "Confirm import",
};
const initialMapping: CsvMapping = {
  headerRow: 1,
  date: -1,
  description: -1,
  layout: "signed",
  amount: -1,
  credit: -1,
  debit: -1,
  type: -1,
  category: -1,
  dateFormat: "iso",
  positiveKind: "income",
  categoryIds: {},
};

class ImportConflict extends Error {}
async function importRequest<T>(payload: unknown): Promise<T> {
  const body = JSON.stringify(payload);
  if (new TextEncoder().encode(body).length > JSON_BODY_LIMIT)
    throw new Error(
      "This import is too large. Split the CSV into smaller files.",
    );
  const response = await fetch("/api/transactions/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  let value;
  try {
    value = await response.json();
  } catch {
    throw new Error("Could not connect. Your import is still here; try again.");
  }
  if (!response.ok) {
    if (response.status === 409)
      throw new ImportConflict(
        value.message ??
          "Transactions changed. Check for duplicates again before importing.",
      );
    throw new Error(value.message ?? "Could not import these transactions.");
  }
  return value as T;
}

export default function CsvImport({
  plan,
  onClose,
  onImported,
}: {
  plan: Plan;
  onClose: () => void;
  onImported: (result: ImportResult) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const stepTitle = useRef<HTMLHeadingElement>(null);
  const [text, setText] = useState("");
  const [filename, setFilename] = useState("");
  const [delimiter, setDelimiter] = useState<CsvDelimiter>(",");
  const [mapping, setMapping] = useState<CsvMapping>(initialMapping);
  const [step, setStep] = useState<Step>("map");
  const [review, setReview] = useState<ReturnType<typeof mapCsvRows> | null>(
    null,
  );
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [decisions, setDecisions] = useState<ImportDecision[]>([]);
  const [allowInvalid, setAllowInvalid] = useState(false);
  const [applyRemaining, setApplyRemaining] = useState(false);
  const [targetId, setTargetId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [parseError, setParseError] = useState("");
  const parsed = useMemo(() => {
    if (!text) return { records: [], error: "" };
    try {
      return { records: parseCsv(text, delimiter), error: "" };
    } catch (err) {
      return {
        records: [],
        error: err instanceof Error ? err.message : "Check the CSV format.",
      };
    }
  }, [text, delimiter]);
  const header = parsed.records.find(
    (record) => record.row === mapping.headerRow,
  );
  const categories = [
    { id: "uncategorized", name: "Uncategorized" },
    ...plan.categories,
    { id: "bills", name: "Insurance & bills" },
    { id: "giving", name: "Giving" },
    { id: "debt", name: "Debt payments" },
  ];
  const sourceCategories = useMemo(
    () =>
      mapping.category < 0
        ? []
        : [
            ...new Set(
              parsed.records
                .filter((record) => record.row > mapping.headerRow)
                .map((record) => record.cells[mapping.category]?.trim() ?? ""),
            ),
          ],
    [parsed.records, mapping.category, mapping.headerRow],
  );
  const currentDuplicate = preview?.duplicates.find(
    (duplicate) =>
      !decisions.some((decision) => decision.row === duplicate.row),
  );
  const currentTarget =
    currentDuplicate?.matches.find((match) => match.id === targetId) ??
    currentDuplicate?.matches[0];
  const updateCount = decisions.filter(
    (decision) => decision.action === "update",
  ).length;
  const skipCount = decisions.filter(
    (decision) => decision.action === "skip",
  ).length;

  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    if (step !== "map") stepTitle.current?.focus();
  }, [step]);

  function setField<K extends keyof CsvMapping>(
    field: K,
    value: CsvMapping[K],
  ) {
    setMapping((previous) => ({ ...previous, [field]: value }));
    setError("");
  }
  function resetColumns(headerRow = mapping.headerRow) {
    setMapping((previous) => ({
      ...initialMapping,
      dateFormat: previous.dateFormat,
      positiveKind: previous.positiveKind,
      headerRow,
    }));
    setReview(null);
    setError("");
    setAllowInvalid(false);
  }
  function column(
    label: string,
    field:
      | "date"
      | "description"
      | "amount"
      | "credit"
      | "debit"
      | "type"
      | "category",
    optional = false,
  ) {
    return (
      <label className="stack-field">
        <span>
          {label}
          {optional && <span className="muted"> · optional</span>}
        </span>
        <select
          aria-label={label}
          value={mapping[field]}
          disabled={!header || busy}
          onChange={(event) => setField(field, Number(event.target.value))}
        >
          <option value={-1}>
            {optional ? "Do not use a column" : "Select a column"}
          </option>
          {header?.cells.map((name, index) => (
            <option key={index} value={index}>
              {index + 1}: {name.trim() || "Unnamed column"}
            </option>
          ))}
        </select>
      </label>
    );
  }
  function showReview() {
    setError("");
    try {
      const nextReview = mapCsvRows(parsed.records, mapping);
      setReview(nextReview);
      setAllowInvalid(false);
      setPreview(null);
      setDecisions([]);
      setStep("review");
      if (!nextReview.rows.length)
        setError(
          "There are no valid transactions to import. Review the mapping and row errors.",
        );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Check the mapped columns.",
      );
    }
  }
  async function checkDuplicates() {
    if (
      !review ||
      !review.rows.length ||
      (review.issues.length > 0 && !allowInvalid)
    )
      return;
    setBusy(true);
    setError("");
    try {
      const nextPreview = await importRequest<ImportPreview>({
        rows: review.rows,
      });
      setPreview(nextPreview);
      setDecisions([]);
      setTargetId("");
      setApplyRemaining(false);
      setStep(nextPreview.duplicates.length ? "duplicates" : "confirm");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not check for duplicates.",
      );
    } finally {
      setBusy(false);
    }
  }
  function resolveDuplicate(action: "skip" | "update") {
    if (!currentDuplicate || !preview) return;
    const unresolved = preview.duplicates.filter(
      (duplicate) =>
        !decisions.some((decision) => decision.row === duplicate.row),
    );
    // A bulk update is safe only when every remaining row has one unambiguous match.
    const resolve = applyRemaining ? unresolved : [currentDuplicate];
    if (
      action === "update" &&
      applyRemaining &&
      resolve.some((duplicate) => duplicate.matches.length > 1)
    ) {
      setError(
        "Some remaining rows match more than one transaction. Choose the transaction for each update, or apply Skip to all remaining rows.",
      );
      return;
    }
    const next = [
      ...decisions,
      ...resolve.map((duplicate): ImportDecision => {
        if (action === "skip") return { row: duplicate.row, action };
        const target =
          duplicate.row === currentDuplicate.row
            ? currentTarget
            : duplicate.matches[0];
        return {
          row: duplicate.row,
          action,
          targetId: target!.id,
        };
      }),
    ];
    setDecisions(next);
    setTargetId("");
    setApplyRemaining(false);
    setError("");
    if (next.length === preview.duplicates.length) setStep("confirm");
    else stepTitle.current?.focus();
  }
  async function commitImport() {
    if (!review || !preview) return;
    setBusy(true);
    setError("");
    try {
      const result = await importRequest<ImportResult>({
        rows: review.rows,
        commit: true,
        reviewToken: preview.reviewToken,
        decisions,
      });
      onImported(result);
      onClose();
    } catch (err) {
      if (err instanceof ImportConflict) {
        setPreview(null);
        setDecisions([]);
        setStep("review");
      }
      setError(
        err instanceof Error
          ? err.message
          : "Could not import these transactions.",
      );
    } finally {
      setBusy(false);
    }
  }
  function transactionCard(
    transaction: Pick<
      Transaction,
      "date" | "description" | "kind" | "amountCents" | "categoryName"
    >,
    label: string,
  ) {
    return (
      <article className={styles.comparisonCard}>
        <p className="eyebrow">{label}</p>
        <h4>{transaction.description}</h4>
        <strong className={styles.amount}>
          {transaction.kind === "expense" ? "−" : "+"}
          {money(transaction.amountCents / 100, true)}
        </strong>
        <p className="muted small">
          {transaction.date} · {transaction.categoryName}
        </p>
      </article>
    );
  }
  const acceptedCount =
    (preview?.newCount ?? 0) +
    new Set(
      decisions
        .filter(
          (decision) =>
            decision.action === "update" &&
            !decision.targetId?.startsWith("csv-row-"),
        )
        .map((decision) => decision.targetId),
    ).size;
  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby="csv-import-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className={styles.header}>
        <div>
          <p className="eyebrow">Checking account</p>
          <h2 id="csv-import-title">Import transactions</h2>
        </div>
        <button
          className="icon-btn"
          type="button"
          aria-label="Close import"
          disabled={busy}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      <ol className={styles.steps} aria-label="Import progress">
        {(Object.keys(stepNames) as Step[]).map((value, index) => (
          <li
            key={value}
            aria-current={value === step ? "step" : undefined}
            className={value === step ? styles.activeStep : ""}
          >
            <span>{index + 1}</span>
            {stepNames[value]}
          </li>
        ))}
      </ol>
      <div className={styles.content} aria-busy={busy}>
        <h3 ref={stepTitle} tabIndex={-1} className={styles.stepTitle}>
          {stepNames[step]}
        </h3>
        {step === "map" && (
          <>
            <p className="muted">
              Choose your file, then tell us which columns to use. Nothing is
              saved until you confirm the import.
            </p>
            <label className={styles.upload}>
              <FileUp size={25} aria-hidden="true" />
              <span>
                <strong>{filename || "Choose CSV file"}</strong>
                <small>Up to 1 MB · 500 transactions per import</small>
              </span>
              <input
                type="file"
                accept=".csv,text/csv,text/plain"
                aria-label="Choose CSV file"
                disabled={busy}
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  setParseError("");
                  setError("");
                  if (file.size > CSV_FILE_LIMIT) {
                    setParseError("Choose a CSV file smaller than 1 MB.");
                    return;
                  }
                  setBusy(true);
                  try {
                    const contents = await file.text();
                    setText(contents);
                    setFilename(file.name);
                    resetColumns(1);
                  } catch {
                    setParseError("Could not read this file. Choose it again.");
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </label>
            <div className={`two-columns ${styles.columns}`}>
              <label className="stack-field">
                <span>Separator</span>
                <select
                  value={delimiter}
                  disabled={busy}
                  onChange={(event) => {
                    setDelimiter(event.target.value as CsvDelimiter);
                    resetColumns(1);
                  }}
                >
                  <option value=",">Comma (,)</option>
                  <option value=";">Semicolon (;)</option>
                  <option value="\t">Tab</option>
                </select>
              </label>
              <label className="stack-field">
                <span>Header row</span>
                <input
                  aria-label="Header row number"
                  type="number"
                  min="1"
                  max={parsed.records.at(-1)?.row ?? 1}
                  step="1"
                  value={mapping.headerRow}
                  disabled={!text || busy}
                  onChange={(event) => resetColumns(Number(event.target.value))}
                />
                <small className="muted">
                  Line containing the column names. Earlier rows are ignored.
                </small>
              </label>
            </div>
            {(parseError || parsed.error) && (
              <p role="alert" className="error-text">
                {parseError || parsed.error}
              </p>
            )}
            {parsed.records.length > 0 && (
              <details className={styles.rawPreview} open>
                <summary>File preview · row numbers match your CSV</summary>
                <div
                  className={styles.tableScroll}
                  tabIndex={0}
                  role="region"
                  aria-label="CSV file preview"
                >
                  <table className={styles.table}>
                    <caption className={styles.srOnly}>
                      First rows in the selected CSV
                    </caption>
                    <tbody>
                      {parsed.records.slice(0, 6).map((record) => (
                        <tr
                          key={record.row}
                          className={
                            record.row === mapping.headerRow
                              ? styles.headerRecord
                              : ""
                          }
                        >
                          <th scope="row">Row {record.row}</th>
                          {record.cells.map((cell, index) => (
                            <td key={index} title={cell}>
                              {cell || "—"}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!header && (
                  <p role="alert" className="error-text small">
                    Choose a row that contains the column names.
                  </p>
                )}
              </details>
            )}
            {header && (
              <>
                <div className={`two-columns ${styles.columns}`}>
                  {column("Date column", "date")}
                  {column("Description column", "description")}
                </div>
                <div className={`two-columns ${styles.columns}`}>
                  <label className="stack-field">
                    <span>Date format</span>
                    <select
                      value={mapping.dateFormat}
                      onChange={(event) =>
                        setField(
                          "dateFormat",
                          event.target.value as CsvMapping["dateFormat"],
                        )
                      }
                    >
                      <option value="iso">YYYY-MM-DD</option>
                      <option value="mdy">MM/DD/YYYY</option>
                      <option value="dmy">DD/MM/YYYY</option>
                    </select>
                  </label>
                  <label className="stack-field">
                    <span>Amount layout</span>
                    <select
                      value={mapping.layout}
                      onChange={(event) =>
                        setField(
                          "layout",
                          event.target.value as CsvMapping["layout"],
                        )
                      }
                    >
                      <option value="signed">Signed amount</option>
                      <option value="split">Separate credit and debit</option>
                    </select>
                  </label>
                </div>
                {mapping.layout === "signed" ? (
                  <>
                    <div className={`two-columns ${styles.columns}`}>
                      {column("Amount column", "amount")}
                      {column("Type column", "type", true)}
                    </div>
                    {mapping.type < 0 ? (
                      <label className="stack-field">
                        <span>Positive amounts mean</span>
                        <select
                          value={mapping.positiveKind}
                          onChange={(event) =>
                            setField(
                              "positiveKind",
                              event.target.value as CsvMapping["positiveKind"],
                            )
                          }
                        >
                          <option value="income">
                            Income · negative amounts are expenses
                          </option>
                          <option value="expense">
                            Expense · negative amounts are income
                          </option>
                        </select>
                      </label>
                    ) : (
                      <p className={styles.notice}>
                        Type takes precedence over the amount sign. Supported
                        values: income, credit, deposit, expense, debit,
                        withdrawal.
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <div className={`two-columns ${styles.columns}`}>
                      {column("Credit column", "credit")}
                      {column("Debit column", "debit")}
                    </div>
                    <p className={styles.notice}>
                      Credit and debit columns determine direction; either sign
                      is accepted.
                    </p>
                  </>
                )}
                <p className="muted small">
                  Amounts use USD and a decimal point; dollar signs, comma
                  grouping, and parentheses for negatives are supported. Dates
                  are never guessed.
                </p>
                {column("Category column", "category", true)}
                {sourceCategories.length > 0 && (
                  <details className={styles.categoryMapping} open>
                    <summary>Match file categories to your categories</summary>
                    <p className="muted small">
                      Unmatched expenses stay Uncategorized. Income uses the
                      Income category.
                    </p>
                    <div className={styles.categoryList}>
                      {sourceCategories.map((name) => (
                        <label key={name} className={styles.categoryRow}>
                          <span>{name || "Empty category"}</span>
                          <select
                            aria-label={`Category for ${name || "empty category"}`}
                            value={
                              Object.hasOwn(mapping.categoryIds, name)
                                ? mapping.categoryIds[name]
                                : "uncategorized"
                            }
                            onChange={(event) =>
                              setField("categoryIds", {
                                ...mapping.categoryIds,
                                [name]: event.target.value,
                              })
                            }
                          >
                            {categories.map((category) => (
                              <option key={category.id} value={category.id}>
                                {category.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      ))}
                    </div>
                  </details>
                )}
              </>
            )}
          </>
        )}
        {step === "review" && review && (
          <>
            <p className="muted">
              {review.rows.length} valid transactions from {filename}. Check the
              dates, signs, and categories before looking for duplicates.
            </p>
            <div
              className={styles.tableScroll}
              tabIndex={0}
              role="region"
              aria-label="Transactions to import"
            >
              <table className={styles.table}>
                <caption className={styles.srOnly}>
                  Parsed transactions to import
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Row</th>
                    <th scope="col">Date</th>
                    <th scope="col">Description</th>
                    <th scope="col">Category</th>
                    <th scope="col">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {review.rows.slice(0, 30).map((row) => (
                    <tr key={row.row}>
                      <th scope="row">{row.row}</th>
                      <td>{row.date}</td>
                      <td>{row.description}</td>
                      <td>
                        {row.kind === "income"
                          ? "Income"
                          : (categories.find(
                              (category) => category.id === row.categoryId,
                            )?.name ?? "Uncategorized")}
                      </td>
                      <td className={styles.money}>
                        {row.kind === "expense" ? "−" : "+"}
                        {money(row.amountCents / 100, true)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {review.rows.length > 30 && (
              <p className="muted small">
                Showing the first 30 of {review.rows.length} valid transactions.
              </p>
            )}
            {review.issues.length > 0 && (
              <div className={styles.invalid}>
                <h4>{review.issues.length} rows need attention</h4>
                <p>
                  Go back to correct the mapping, or explicitly skip these rows.
                </p>
                <ul tabIndex={0} aria-label="Invalid CSV rows">
                  {review.issues.map((issue) => (
                    <li key={issue.row}>
                      <strong>Row {issue.row}:</strong> {issue.message}
                    </li>
                  ))}
                </ul>
                <label className={styles.checkbox}>
                  <input
                    type="checkbox"
                    checked={allowInvalid}
                    onChange={(event) => setAllowInvalid(event.target.checked)}
                  />
                  <span>
                    Skip the {review.issues.length} invalid rows listed above
                  </span>
                </label>
              </div>
            )}
          </>
        )}
        {step === "duplicates" &&
          preview &&
          currentDuplicate &&
          currentTarget && (
            <>
              <p className="muted">
                Duplicate {decisions.length + 1} of {preview.duplicates.length}{" "}
                · CSV row {currentDuplicate.row}
              </p>
              <p>
                We found a transaction with the same date, amount, and
                direction. Compare the details before choosing.
              </p>
              {currentDuplicate.matches.length > 1 && (
                <label className="stack-field">
                  <span>Existing transaction</span>
                  <select
                    value={currentTarget.id}
                    onChange={(event) => setTargetId(event.target.value)}
                  >
                    {currentDuplicate.matches.map((match) => (
                      <option key={match.id} value={match.id}>
                        {match.description} · {match.categoryName}
                        {match.id.startsWith("csv-row-")
                          ? " · earlier CSV row"
                          : ""}
                      </option>
                    ))}
                  </select>
                  <small className="muted">
                    More than one transaction matches. Choose which one to
                    update.
                  </small>
                </label>
              )}
              <div className={styles.comparison}>
                {transactionCard(
                  currentTarget,
                  currentTarget.id.startsWith("csv-row-")
                    ? "Earlier CSV row"
                    : "Already saved",
                )}
                {transactionCard(
                  {
                    ...currentDuplicate.incoming,
                    categoryName:
                      currentDuplicate.incoming.kind === "income"
                        ? "Income"
                        : (categories.find(
                            (category) =>
                              category.id ===
                              currentDuplicate.incoming.categoryId,
                          )?.name ?? "Uncategorized"),
                  },
                  "Incoming CSV row",
                )}
              </div>
              <label className={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={applyRemaining}
                  onChange={(event) => {
                    setApplyRemaining(event.target.checked);
                    setError("");
                  }}
                />
                <span>Apply to this and all remaining duplicates</span>
              </label>
              <p className="muted small">
                Skip keeps the existing transaction. Update replaces its
                description and category with the CSV row. Your earlier
                decisions stay as selected.
              </p>
            </>
          )}
        {step === "confirm" && review && preview && (
          <>
            <div className={styles.confirmIcon}>
              <Check size={26} aria-hidden="true" />
            </div>
            <p>
              Ready to import from <strong>{filename}</strong>.
            </p>
            <dl className={styles.summary}>
              <div>
                <dt>New transactions</dt>
                <dd>{preview.newCount}</dd>
              </div>
              <div>
                <dt>Updates selected</dt>
                <dd>{updateCount}</dd>
              </div>
              <div>
                <dt>Duplicates skipped</dt>
                <dd>{skipCount}</dd>
              </div>
              {review.issues.length > 0 && (
                <div>
                  <dt>Invalid rows skipped</dt>
                  <dd>{review.issues.length}</dd>
                </div>
              )}
            </dl>
            <p className="muted small">
              Repeated rows in the same file share one transaction. New
              transactions and updates are saved together after one final
              duplicate check.
            </p>
            {decisions.length > 0 && (
              <details>
                <summary>Your duplicate decisions</summary>
                <ul
                  className={styles.decisions}
                  tabIndex={0}
                  aria-label="Duplicate import decisions"
                >
                  {decisions.map((decision) => (
                    <li key={decision.row}>
                      Row {decision.row}:{" "}
                      {decision.action === "skip" ? "Skip" : "Update"}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
        {busy && (
          <p role="status" className="muted small">
            <LoaderCircle size={15} className="spin" />{" "}
            {step === "confirm"
              ? "Saving transactions…"
              : "Checking your import…"}
          </p>
        )}
      </div>
      <div className={styles.actions}>
        {step === "map" ? (
          <button
            className="btn"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
        ) : (
          <button
            className="btn"
            type="button"
            disabled={busy}
            onClick={() => {
              setError("");
              setStep(step === "review" ? "map" : "review");
            }}
          >
            <ArrowLeft size={15} />
            Back
          </button>
        )}
        {step === "map" && (
          <button
            className="btn primary"
            type="button"
            disabled={busy || !header || !!parsed.error || !!parseError}
            onClick={showReview}
          >
            Review rows
          </button>
        )}
        {step === "review" && (
          <button
            className="btn primary"
            type="button"
            disabled={
              busy ||
              !review ||
              !review.rows.length ||
              (review.issues.length > 0 && !allowInvalid)
            }
            onClick={checkDuplicates}
          >
            Check for duplicates
          </button>
        )}
        {step === "duplicates" && (
          <div className={`button-row ${styles.actionButtons}`}>
            <button
              className="btn"
              type="button"
              disabled={busy}
              onClick={() => resolveDuplicate("skip")}
            >
              Skip this row
            </button>
            <button
              className="btn primary"
              type="button"
              disabled={busy}
              onClick={() => resolveDuplicate("update")}
            >
              Update existing
            </button>
          </div>
        )}
        {step === "confirm" && (
          <button
            className="btn primary"
            type="button"
            disabled={busy}
            onClick={commitImport}
          >
            {busy && <LoaderCircle size={15} className="spin" />}
            {acceptedCount
              ? `Import ${acceptedCount} transactions`
              : "Finish import"}
          </button>
        )}
      </div>
    </dialog>
  );
}
