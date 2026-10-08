import { describe, expect, it } from "vitest";
import {
  mapCsvRows,
  parseCsv,
  parseCsvAmount,
  parseCsvDate,
  type CsvMapping,
} from "@/lib/csv-import";
import { csvCell } from "@/lib/ledger";

const mapping: CsvMapping = {
  headerRow: 1,
  date: 0,
  description: 1,
  layout: "signed",
  amount: 2,
  credit: -1,
  debit: -1,
  type: -1,
  category: -1,
  dateFormat: "iso",
  positiveKind: "income",
  categoryIds: {},
};
describe("CSV parsing", () => {
  it("handles BOM, preamble, blank lines, quoted multiline cells, escaped quotes, and physical row numbers", () => {
    const records = parseCsv(
      '\uFEFFExport report\r\n\r\nDate,Details,Amount\r\n2026-10-01,"A \"\"quoted\"\"\r\nmerchant",-12.50\r\n',
      ",",
    );
    expect(records).toEqual([
      { row: 1, cells: ["Export report"] },
      { row: 3, cells: ["Date", "Details", "Amount"] },
      { row: 4, cells: ["2026-10-01", 'A "quoted"\nmerchant', "-12.50"] },
    ]);
    expect(
      mapCsvRows(records, { ...mapping, headerRow: 3 }).rows[0],
    ).toMatchObject({ row: 4, amountCents: 1250, kind: "expense" });
  });
  it("supports explicitly selected semicolon and tab delimiters", () => {
    expect(
      parseCsv(
        'Date;Details;Credit;Debit\n2026-10-01;"Cafe; lunch";;12.50',
        ";",
      )[1].cells,
    ).toEqual(["2026-10-01", "Cafe; lunch", "", "12.50"]);
    expect(
      parseCsv("Date\tDetails\tAmount\n2026-10-01\tBus fare\t-2.25", "\t")[1]
        .cells,
    ).toEqual(["2026-10-01", "Bus fare", "-2.25"]);
  });
  it("rejects malformed quotes and large files rather than quietly changing data", () => {
    expect(() =>
      parseCsv('Date,Description\n2026-10-01,"Unclosed', ","),
    ).toThrow("not closed");
    expect(() =>
      parseCsv('Date,Description\n2026-10-01,"Closed"oops', ","),
    ).toThrow("closing quote");
    expect(() => parseCsv("x".repeat(1_000_001), ",")).toThrow("1 MB");
    expect(() => parseCsv(" ", ",")).toThrow("empty");
  });
});
describe("CSV date and money conversion", () => {
  it("honors the selected date format and rejects impossible or ambiguous unsupported dates", () => {
    expect(parseCsvDate("04/05/2026", "mdy")).toBe("2026-04-05");
    expect(parseCsvDate("04/05/2026", "dmy")).toBe("2026-05-04");
    expect(parseCsvDate("2024-02-29", "iso")).toBe("2024-02-29");
    expect(() => parseCsvDate("2026-02-29", "iso")).toThrow("does not exist");
    expect(() => parseCsvDate("04/05/2026", "iso")).toThrow("YYYY-MM-DD");
    expect(() => parseCsvDate("4/5/26", "mdy")).toThrow("MM/DD/YYYY");
  });
  it("converts cents exactly and supports USD grouping and parentheses", () => {
    expect(parseCsvAmount("-12.50")).toBe(-1250);
    expect(parseCsvAmount("$1,234.56")).toBe(123456);
    expect(parseCsvAmount("($12.50)")).toBe(-1250);
    expect(parseCsvAmount("$-12.50")).toBe(-1250);
    expect(parseCsvAmount(".29")).toBe(29);
    expect(parseCsvAmount("0.29")).toBe(29);
    expect(parseCsvAmount("+1000000.00")).toBe(100_000_000);
    for (const invalid of [
      "",
      "1,23",
      "12.345",
      "1e3",
      "NaN",
      "Infinity",
      "1 234,56",
      "(-12.50)",
      "1000000.01",
      "=100",
    ])
      expect(() => parseCsvAmount(invalid)).toThrow();
  });
  it("round-trips formula-safe signed exports without executing descriptions", () => {
    const csv = [
      "Date,Details,Amount,Type",
      ["2026-10-01", "=SUM(1,2)", "-12.50", "expense"].map(csvCell).join(","),
    ].join("\n");
    const result = mapCsvRows(parseCsv(csv, ","), { ...mapping, type: 3 });
    expect(result.issues).toEqual([]);
    expect(result.rows[0]).toMatchObject({
      amountCents: 1250,
      kind: "expense",
      description: "'=SUM(1,2)",
    });
  });
});
describe("CSV row mapping", () => {
  it("uses sign direction, optional type precedence, and user-selected category mappings", () => {
    const csv =
      "Date,Details,Amount,Category\n2026-10-01,Pay,100.01,Salary\n2026-10-02,Lunch,-12.50,Dining\n2026-10-03,Book,-20,Unknown";
    const result = mapCsvRows(parseCsv(csv, ","), {
      ...mapping,
      category: 3,
      categoryIds: { Dining: "category-1" },
    });
    expect(
      result.rows.map((row) => [row.kind, row.categoryId, row.amountCents]),
    ).toEqual([
      ["income", "income", 10001],
      ["expense", "category-1", 1250],
      ["expense", "uncategorized", 2000],
    ]);
    const reverse = mapCsvRows(
      parseCsv("Date,Details,Amount\n2026-10-01,Lunch,12.50", ","),
      { ...mapping, positiveKind: "expense" },
    );
    expect(reverse.rows[0].kind).toBe("expense");
    const typed = mapCsvRows(
      parseCsv(
        "Date,Details,Amount,Type\n2026-10-01,Pay,100,credit\n2026-10-01,Lunch,12.50,expense",
        ",",
      ),
      { ...mapping, type: 3 },
    );
    expect(typed.rows.map((row) => row.kind)).toEqual(["income", "expense"]);
  });
  it("supports separate credit/debit columns and reports every excluded row", () => {
    const csv =
      "Date;Details;Credit;Debit\n2026-10-01;Pay;100;\n2026-10-02;Lunch;;12.50\n2026-10-03;Both;5;2\n2026-10-04;Zero;0;0\n2026-10-05;Negative;;-2\n2026-02-30;Date;;2\n2026-10-06;Missing column;3";
    const result = mapCsvRows(parseCsv(csv, ";"), {
      ...mapping,
      layout: "split",
      credit: 2,
      debit: 3,
    });
    expect(result.rows.map((row) => [row.kind, row.amountCents])).toEqual([
      ["income", 10000],
      ["expense", 1250],
      ["expense", 200],
    ]);
    expect(result.issues.map((issue) => issue.row)).toEqual([4, 5, 7, 8]);
    expect(result.issues[0].message).toContain("both");
    expect(result.issues[1].message).toContain("Zero");
    expect(result.dataCount).toBe(7);
  });
  it("requires complete unique mappings and caps imports at 500 data rows", () => {
    const records = parseCsv(
      "Date,Details,Amount\n2026-10-01,Lunch,-12.50",
      ",",
    );
    expect(() => mapCsvRows(records, { ...mapping, date: -1 })).toThrow(
      "Map the date",
    );
    expect(() => mapCsvRows(records, { ...mapping, description: 0 })).toThrow(
      "different CSV column",
    );
    expect(() => mapCsvRows(records, { ...mapping, headerRow: 3 })).toThrow(
      "header row",
    );
    const excess = parseCsv(
      "Date,Details,Amount\n" + "2026-10-01,Lunch,-12.50\n".repeat(501),
      ",",
    );
    expect(() => mapCsvRows(excess, mapping)).toThrow("500");
  });
  it("treats arbitrary category names as literal dictionary keys", () => {
    const records = parseCsv(
      "Date,Details,Amount,Category\n2026-10-01,Book,-10,constructor\n2026-10-02,Gift,-20,__proto__",
      ",",
    );
    expect(
      mapCsvRows(records, { ...mapping, category: 3 }).rows.map(
        (row) => row.categoryId,
      ),
    ).toEqual(["uncategorized", "uncategorized"]);
    expect(
      mapCsvRows(records, {
        ...mapping,
        category: 3,
        categoryIds: { ["__proto__"]: "category-0" },
      }).rows[1].categoryId,
    ).toBe("category-0");
  });
});
