// Pure helpers for the custom report builder: filtering, grouping, CSV.
export type FieldType = "text" | "number" | "date" | "bool";

export interface FieldDef {
  key: string;
  label: string;
  group: string;
  type: FieldType;
}

export type Row = Record<string, unknown>;

export type FilterOp = "contains" | "equals" | "not_equals" | "gt" | "lt" | "empty" | "not_empty";

export interface Filter {
  field: string;
  op: FilterOp;
  value: string;
}

export type AggFn = "count" | "sum" | "avg" | "distinct";

export interface Aggregate {
  fn: AggFn;
  field?: string; // not needed for count
}

function str(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

export function matchFilter(row: Row, f: Filter): boolean {
  const raw = row[f.field];
  const s = str(raw).toLowerCase();
  const val = f.value.trim().toLowerCase();
  switch (f.op) {
    case "empty":
      return s === "";
    case "not_empty":
      return s !== "";
    case "contains":
      return val === "" || s.includes(val);
    case "equals":
      return s === val;
    case "not_equals":
      return s !== val;
    case "gt":
    case "lt": {
      const n = Number(raw);
      const t = Number(f.value);
      if (Number.isFinite(n) && Number.isFinite(t) && f.value.trim() !== "") {
        return f.op === "gt" ? n > t : n < t;
      }
      // fall back to string compare (dates in ISO format compare correctly)
      return f.op === "gt" ? s > val : s < val;
    }
  }
}

export function applyFilters(rows: Row[], filters: Filter[]): Row[] {
  const active = filters.filter((f) => f.field);
  if (!active.length) return rows;
  return rows.filter((r) => active.every((f) => matchFilter(r, f)));
}

export function aggLabel(a: Aggregate, fields: FieldDef[]): string {
  if (a.fn === "count") return "Count";
  const l = fields.find((f) => f.key === a.field)?.label ?? a.field ?? "";
  return `${a.fn === "sum" ? "Sum" : a.fn === "avg" ? "Average" : "Distinct"} of ${l}`;
}

export function computeAgg(rows: Row[], a: Aggregate): number {
  if (a.fn === "count") return rows.length;
  const field = a.field ?? "";
  if (a.fn === "distinct") {
    return new Set(rows.map((r) => str(r[field])).filter((s) => s !== "")).size;
  }
  const nums = rows.map((r) => Number(r[field])).filter((n) => Number.isFinite(n));
  const sum = nums.reduce((t, n) => t + n, 0);
  if (a.fn === "sum") return Math.round(sum * 100) / 100;
  return nums.length ? Math.round((sum / nums.length) * 100) / 100 : 0;
}

/** Turn a date value into a bucket for grouping. */
export type DateBucket = "day" | "week" | "month" | "year" | "weekday";

export function bucketDate(v: unknown, b: DateBucket): string {
  const s = str(v);
  if (!s) return "";
  const d = new Date(s.length === 10 ? `${s}T12:00:00` : s);
  if (Number.isNaN(d.getTime())) return s;
  // Johannesburg local date
  const local = new Date(d.toLocaleString("en-US", { timeZone: "Africa/Johannesburg" }));
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = local.getFullYear();
  const m = pad(local.getMonth() + 1);
  const day = pad(local.getDate());
  if (b === "year") return String(y);
  if (b === "month") return `${y}-${m}`;
  if (b === "day") return `${y}-${m}-${day}`;
  if (b === "weekday") {
    return ["7 Sun", "1 Mon", "2 Tue", "3 Wed", "4 Thu", "5 Fri", "6 Sat"][local.getDay()];
  }
  const monday = new Date(local);
  monday.setDate(local.getDate() - ((local.getDay() + 6) % 7));
  return `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())} (wk)`;
}

export interface GroupSpec {
  field: string;
  bucket?: DateBucket;
}

export interface GroupResult {
  keys: string[];
  values: number[];
}

export function groupRows(rows: Row[], groups: GroupSpec[], aggs: Aggregate[]): GroupResult[] {
  const map = new Map<string, { keys: string[]; rows: Row[] }>();
  for (const r of rows) {
    const keys = groups.map((g) => {
      const v = g.bucket ? bucketDate(r[g.field], g.bucket) : str(r[g.field]);
      return v === "" ? "(blank)" : v;
    });
    const id = JSON.stringify(keys);
    const e = map.get(id);
    if (e) e.rows.push(r);
    else map.set(id, { keys, rows: [r] });
  }
  return [...map.values()].map((e) => ({ keys: e.keys, values: aggs.map((a) => computeAgg(e.rows, a)) }));
}

export function csvCell(v: unknown): string {
  const s = str(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
}

export function displayValue(v: unknown, type: FieldType): string {
  if (v === null || v === undefined || v === "") return "";
  if (type === "bool") return v ? "Yes" : "No";
  if (type === "date") {
    const s = String(v);
    const d = new Date(s.length === 10 ? `${s}T12:00:00` : s);
    if (Number.isNaN(d.getTime())) return s;
    const opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric", timeZone: "Africa/Johannesburg" };
    if (s.length > 10) Object.assign(opts, { hour: "2-digit", minute: "2-digit", hour12: false });
    return d.toLocaleString("en-ZA", opts);
  }
  if (type === "number") {
    const n = Number(v);
    return Number.isFinite(n) ? n.toLocaleString("en-ZA", { maximumFractionDigits: 2 }) : String(v);
  }
  return String(v);
}
