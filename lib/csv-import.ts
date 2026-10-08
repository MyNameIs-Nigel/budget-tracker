import { validDate } from "./budget";
import type { ImportRow } from "./import-transactions";

export const CSV_FILE_LIMIT = 1_000_000;
export const CSV_ROW_LIMIT = 500;
export type CsvDelimiter = "," | ";" | "\t";
export type CsvRecord = { row: number; cells: string[] };
export type CsvMapping = {
  headerRow: number;
  date: number;
  description: number;
  layout: "signed" | "split";
  amount: number;
  credit: number;
  debit: number;
  type: number;
  category: number;
  dateFormat: "iso" | "mdy" | "dmy";
  positiveKind: "income" | "expense";
  categoryIds: Record<string, string>;
};
export type CsvIssue = { row: number; message: string };

/** Parse records without treating cell contents as formulas or executable code. */
export function parseCsv(text: string, delimiter: CsvDelimiter): CsvRecord[] {
  if (new TextEncoder().encode(text).length > CSV_FILE_LIMIT)
    throw new Error("Choose a CSV file smaller than 1 MB.");
  const source = text.replace(/^\uFEFF/, "");
  const records: CsvRecord[] = [];
  let cells: string[] = [],
    cell = "",
    quoted = false,
    closed = false;
  let line = 1,
    startLine = 1;
  const pushCell = () => {
    cells.push(cell);
    cell = "";
    closed = false;
  };
  const pushRecord = () => {
    pushCell();
    if (cells.some((value) => value.trim() !== ""))
      records.push({ row: startLine, cells });
    cells = [];
    if (records.length > 5_000)
      throw new Error(
        "This CSV has too many rows. Split it into smaller files.",
      );
  };
  for (let i = 0; i < source.length; i++) {
    const character = source[i];
    if (quoted) {
      if (character === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else if (character === "\r" || character === "\n") {
        if (character === "\r" && source[i + 1] === "\n") i++;
        cell += "\n";
        line++;
      } else cell += character;
      continue;
    }
    if (character === delimiter) pushCell();
    else if (character === "\r" || character === "\n") {
      if (character === "\r" && source[i + 1] === "\n") i++;
      pushRecord();
      line++;
      startLine = line;
    } else if (character === '"') {
      if (cell !== "" || closed)
        throw new Error(
          `Row ${line}: a quote must start a field. Check the separator.`,
        );
      quoted = true;
    } else if (closed) {
      if (!/\s/.test(character))
        throw new Error(`Row ${line}: unexpected text after a closing quote.`);
    } else cell += character;
  }
  if (quoted)
    throw new Error(`Row ${startLine}: a quoted field is not closed.`);
  if (cell !== "" || cells.length > 0 || closed) pushRecord();
  if (records.length === 0) throw new Error("This CSV is empty.");
  return records;
}

export function parseCsvDate(value: string, format: CsvMapping["dateFormat"]) {
  const text = value.trim();
  let result = text;
  if (format === "iso") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text))
      throw new Error("Date must use YYYY-MM-DD.");
  } else {
    const match = /^(\d{1,2})([/-])(\d{1,2})\2(\d{4})$/.exec(text);
    if (!match)
      throw new Error(
        `Date must use ${format === "mdy" ? "MM/DD/YYYY" : "DD/MM/YYYY"}.`,
      );
    const month = format === "mdy" ? match[1] : match[3];
    const day = format === "mdy" ? match[3] : match[1];
    result = `${match[4]}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  if (!validDate(result)) throw new Error("Date does not exist.");
  return result;
}

/** Convert exact USD decimal strings to integer cents, without float rounding. */
export function parseCsvAmount(value: string) {
  let text = value.trim();
  // Our formula-safe CSV exports prefix signed amounts with an apostrophe.
  if (/^'[+-](?:\$?\d|\$?\.)/.test(text)) text = text.slice(1);
  const parentheses = text.startsWith("(") && text.endsWith(")");
  if (parentheses) text = text.slice(1, -1).trim();
  text = text.replace(/^\$([+-])/, "$1$");
  const match =
    /^([+-])?\$?((?:\d{1,3}(?:,\d{3})+|\d+)?)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match || (!match[2] && !match[3]) || (parentheses && match[1]))
    throw new Error(
      "Amount must be a USD number with at most two decimals (for example, -12.50).",
    );
  const cents =
    Number(match[2].replaceAll(",", "")) * 100 +
    Number((match[3] ?? "").padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents > 100_000_000)
    throw new Error("Amount must be at most $1,000,000.");
  return (parentheses || match[1] === "-" ? -1 : 1) * cents;
}

export function mapCsvRows(records: CsvRecord[], mapping: CsvMapping) {
  const header = records.find((record) => record.row === mapping.headerRow);
  if (!header) throw new Error("Choose a header row from the CSV preview.");
  const selected = [mapping.date, mapping.description];
  if (mapping.layout === "signed") selected.push(mapping.amount);
  else selected.push(mapping.credit, mapping.debit);
  if (selected.some((column) => column < 0 || column >= header.cells.length))
    throw new Error(
      "Map the date, description, and amount columns before continuing.",
    );
  if (mapping.type >= 0 && mapping.layout === "signed")
    selected.push(mapping.type);
  if (mapping.category >= 0) selected.push(mapping.category);
  if (new Set(selected).size !== selected.length)
    throw new Error("Use a different CSV column for each field.");
  const data = records.filter((record) => record.row > header.row);
  if (data.length === 0)
    throw new Error("There are no transactions after the selected header row.");
  if (data.length > CSV_ROW_LIMIT)
    throw new Error(
      "Import at most 500 data rows at a time. Split this CSV into smaller files.",
    );
  const rows: ImportRow[] = [],
    issues: CsvIssue[] = [];
  for (const record of data) {
    try {
      if (record.cells.length !== header.cells.length)
        throw new Error(
          `Expected ${header.cells.length} columns, found ${record.cells.length}.`,
        );
      const cell = (column: number) => record.cells[column]?.trim() ?? "";
      const date = parseCsvDate(cell(mapping.date), mapping.dateFormat);
      const description = cell(mapping.description);
      if (!description || description.length > 160)
        throw new Error("Description must contain 1–160 characters.");
      let kind: "income" | "expense", amountCents: number;
      if (mapping.layout === "split") {
        const credit = cell(mapping.credit)
          ? Math.abs(parseCsvAmount(cell(mapping.credit)))
          : 0;
        const debit = cell(mapping.debit)
          ? Math.abs(parseCsvAmount(cell(mapping.debit)))
          : 0;
        if (credit && debit)
          throw new Error("A row cannot contain both a credit and a debit.");
        kind = credit > 0 ? "income" : "expense";
        amountCents = credit || debit;
      } else {
        const signed = parseCsvAmount(cell(mapping.amount));
        kind =
          signed < 0
            ? mapping.positiveKind === "income"
              ? "expense"
              : "income"
            : mapping.positiveKind;
        if (mapping.type >= 0) {
          const type = cell(mapping.type).toLowerCase();
          if (["income", "credit", "deposit"].includes(type)) kind = "income";
          else if (["expense", "debit", "withdrawal"].includes(type))
            kind = "expense";
          else
            throw new Error(
              "Type must be income / credit / deposit or expense / debit / withdrawal.",
            );
        }
        amountCents = Math.abs(signed);
      }
      if (amountCents === 0)
        throw new Error("Zero amounts are not transactions.");
      const sourceCategory =
        mapping.category >= 0 ? cell(mapping.category) : "";
      const categoryId = Object.hasOwn(mapping.categoryIds, sourceCategory)
        ? mapping.categoryIds[sourceCategory]
        : "uncategorized";
      rows.push({
        row: record.row,
        date,
        kind,
        description,
        amountCents,
        categoryId:
          kind === "income" ? "income" : categoryId || "uncategorized",
      });
    } catch (error) {
      issues.push({
        row: record.row,
        message: error instanceof Error ? error.message : "Check this row.",
      });
    }
  }
  return { rows, issues, dataCount: data.length };
}
