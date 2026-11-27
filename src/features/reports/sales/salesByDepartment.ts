/** Pure sales-by-department rules shared by the report screen, CSV and PDF. */
export type Department = "grooming_inhouse" | "grooming_mobile" | "hotel" | "daycare" | "transport" | "retail" | "other";

export const DEPARTMENTS: { key: Department; label: string }[] = [
  { key: "grooming_inhouse", label: "Grooming (parlour)" },
  { key: "grooming_mobile", label: "Grooming (mobile vans)" },
  { key: "hotel", label: "Hotel & Cattery" },
  { key: "daycare", label: "Daycare" },
  { key: "transport", label: "Transport" },
  { key: "retail", label: "Retail shop / till" },
  { key: "other", label: "Other" },
];

export function departmentForService(service: string | null | undefined): Department | null {
  switch (service) {
    case "grooming_inhouse": return "grooming_inhouse";
    case "grooming_mobile": return "grooming_mobile";
    case "hotel_dog": case "hotel_cat": return "hotel";
    case "daycare": case "daycare_assessment": return "daycare";
    case "pickup_dropoff": return "transport";
    default: return null;
  }
}

function fromDescription(d: string): Department | null {
  const s = d.toLowerCase();
  if (s.includes("mobile travel") || s.includes("travel fee")) return "grooming_mobile";
  if (s.includes("daycare") || s.includes("day care")) return "daycare";
  if (s.includes("pickup") || s.includes("pick-up") || s.includes("drop-off") || s.includes("transport")) return "transport";
  if (s.includes("hotel") || s.includes("cattery") || s.includes("cabana") || s.includes("night")) return "hotel";
  if (s.startsWith("grooming")) return "grooming_inhouse";
  return null;
}

export interface SalesLine {
  description: string | null;
  line_total: number; // VAT-inclusive
  vat_amount: number;
  quantity: number;
  product_id: string | null;
  stock_movement_id: string | null;
  booking_service: string | null; // service of the line's own booking
  service_date?: string | null; // local (Johannesburg) day of the line's own booking
}
export interface SalesInvoice {
  id: string;
  invoice_number: string | null;
  issue_date: string;
  customer_name?: string | null;
  booking_service: string | null; // invoice-level booking
  service_date?: string | null; // local day of the invoice-level booking
  lines: SalesLine[];
}
export interface SalesCredit { id: string; credit_note_number?: string | null; issue_date: string; total: number; invoice: SalesInvoice | null; }

export function classifyLine(line: SalesLine, inv: SalesInvoice): Department {
  if (line.product_id || line.stock_movement_id) return "retail";
  const own = departmentForService(line.booking_service);
  if (own) return own;
  const invDept = departmentForService(inv.booking_service);
  if (invDept) return invDept;
  const linked = [...new Set(inv.lines.map((l) => departmentForService(l.booking_service)).filter(Boolean))];
  if (linked.length === 1) return linked[0] as Department;
  const byText = line.description ? fromDescription(line.description) : null;
  if (byText) return byText;
  // Till sales are the only invoices with no booking anywhere.
  if (linked.length === 0) return "retail";
  return "other";
}

export interface DeptTotals { count: number; net: number; vat: number; gross: number; credits: number; creditVat: number; }
const empty = (): DeptTotals => ({ count: 0, net: 0, vat: 0, gross: 0, credits: 0, creditVat: 0 });
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Split an invoice's gross and VAT by department. */
export function invoiceSplit(inv: SalesInvoice) {
  const m = new Map<Department, { gross: number; vat: number; count: number }>();
  for (const l of inv.lines) {
    const d = classifyLine(l, inv);
    const b = m.get(d) ?? { gross: 0, vat: 0, count: 0 };
    b.gross += Number(l.line_total) || 0; b.vat += Number(l.vat_amount) || 0; b.count += Number(l.quantity) || 1;
    m.set(d, b);
  }
  return m;
}

export interface SalesReport {
  byDept: Record<Department, DeptTotals>;
  byDay: Map<string, Record<Department, number>>; // net-of-credit gross per day
  totals: DeptTotals;
}

export type DateBasis = "service" | "invoice";
export interface ReportOptions { basis?: DateBasis; from?: string; to?: string; }

/** Service date of a line: its own booking, else the invoice's booking, else the invoice date (till sales). */
export const lineServiceDate = (l: SalesLine, inv: SalesInvoice) => l.service_date || inv.service_date || inv.issue_date;

/** Credits net against the department of the invoice they reverse, in proportion to that invoice's lines. */
export function buildSalesReport(invoices: SalesInvoice[], credits: SalesCredit[], opts: ReportOptions = {}): SalesReport {
  const service = opts.basis === "service";
  const inRange = (d: string) => (!opts.from || d >= opts.from) && (!opts.to || d <= opts.to);
  const byDept = Object.fromEntries(DEPARTMENTS.map((d) => [d.key, empty()])) as Record<Department, DeptTotals>;
  const byDay = new Map<string, Record<Department, number>>();
  const day = (d: string) => {
    let row = byDay.get(d);
    if (!row) { row = Object.fromEntries(DEPARTMENTS.map((x) => [x.key, 0])) as Record<Department, number>; byDay.set(d, row); }
    return row;
  };
  if (!service) {
    for (const inv of invoices) {
      for (const [d, b] of invoiceSplit(inv)) {
        const t = byDept[d];
        t.gross += b.gross; t.vat += b.vat; t.net += b.gross - b.vat; t.count += b.count;
        day(inv.issue_date)[d] += b.gross;
      }
    }
    for (const cn of credits) {
      const amount = Number(cn.total) || 0;
      const split = cn.invoice ? invoiceSplit(cn.invoice) : new Map();
      const base = [...split.values()].reduce((a, b) => a + b.gross, 0);
      const parts: [Department, number, number][] = base > 0
        ? [...split.entries()].map(([d, b]) => [d, amount * (b.gross / base), b.gross ? b.vat / b.gross : 0])
        : [["other", amount, 15 / 115]];
      for (const [d, gross, vatRatio] of parts) {
        byDept[d].credits += gross; byDept[d].creditVat += gross * vatRatio;
        day(cn.issue_date)[d] -= gross;
      }
    }
  } else {
    // Service date: each line counts on the day the service happens; credits reverse those same days.
    for (const inv of invoices) {
      for (const l of inv.lines) {
        const sd = lineServiceDate(l, inv); if (!inRange(sd)) continue;
        const d = classifyLine(l, inv); const t = byDept[d];
        const g = Number(l.line_total) || 0, v = Number(l.vat_amount) || 0;
        t.gross += g; t.vat += v; t.net += g - v; t.count += Number(l.quantity) || 1;
        day(sd)[d] += g;
      }
    }
    for (const cn of credits) {
      const amount = Number(cn.total) || 0;
      const inv = cn.invoice;
      const base = inv ? inv.lines.reduce((a, l) => a + (Number(l.line_total) || 0), 0) : 0;
      if (!inv || base <= 0) {
        if (!inRange(cn.issue_date)) continue;
        byDept.other.credits += amount; byDept.other.creditVat += amount * 15 / 115; day(cn.issue_date).other -= amount;
        continue;
      }
      for (const l of inv.lines) {
        const sd = lineServiceDate(l, inv); if (!inRange(sd)) continue;
        const g = Number(l.line_total) || 0; if (!g) continue;
        const d = classifyLine(l, inv); const part = amount * (g / base);
        byDept[d].credits += part; byDept[d].creditVat += part * ((Number(l.vat_amount) || 0) / g);
        day(sd)[d] -= part;
      }
    }
  }
  const totals = empty();
  for (const d of DEPARTMENTS) {
    const t = byDept[d.key];
    for (const k of Object.keys(t) as (keyof DeptTotals)[]) { t[k] = r2(t[k]); totals[k] = r2(totals[k] + t[k]); }
  }
  return { byDept, byDay, totals };
}

/** Net takings after credits for a department. */
export const takings = (t: DeptTotals) => ({ gross: r2(t.gross - t.credits), vat: r2(t.vat - t.creditVat), net: r2(t.net - (t.credits - t.creditVat)) });

export interface SalesItemRow { date: string; kind: "sale" | "credit"; reference: string; customer: string; description: string; quantity: number; net: number; vat: number; gross: number; }

/** Individual sale lines (and credit-note deductions) for one department, using the same date and department rules as the totals. */
export function salesLineItems(invoices: SalesInvoice[], credits: SalesCredit[], dept: Department, opts: ReportOptions = {}): SalesItemRow[] {
  const service = opts.basis === "service";
  const inRange = (d: string) => (!opts.from || d >= opts.from) && (!opts.to || d <= opts.to);
  const rows: SalesItemRow[] = [];
  for (const inv of invoices) for (const l of inv.lines) {
    if (classifyLine(l, inv) !== dept) continue;
    const date = service ? lineServiceDate(l, inv) : inv.issue_date;
    if (service && !inRange(date)) continue;
    const g = Number(l.line_total) || 0, v = Number(l.vat_amount) || 0;
    rows.push({ date, kind: "sale", reference: inv.invoice_number ?? "", customer: inv.customer_name ?? "", description: l.description ?? "", quantity: Number(l.quantity) || 1, net: r2(g - v), vat: r2(v), gross: r2(g) });
  }
  for (const cn of credits) {
    const amount = Number(cn.total) || 0; const inv = cn.invoice;
    const base = inv ? inv.lines.reduce((a, l) => a + (Number(l.line_total) || 0), 0) : 0;
    const byDate = new Map<string, { g: number; v: number }>();
    if (!inv || base <= 0) {
      if (dept !== "other" || !inRange(cn.issue_date)) continue;
      byDate.set(cn.issue_date, { g: amount, v: amount * 15 / 115 });
    } else for (const l of inv.lines) {
      const g = Number(l.line_total) || 0; if (!g || classifyLine(l, inv) !== dept) continue;
      const date = service ? lineServiceDate(l, inv) : cn.issue_date;
      if (service && !inRange(date)) continue;
      const part = amount * (g / base); const b = byDate.get(date) ?? { g: 0, v: 0 };
      b.g += part; b.v += part * ((Number(l.vat_amount) || 0) / g); byDate.set(date, b);
    }
    for (const [date, b] of byDate) rows.push({ date, kind: "credit", reference: cn.credit_note_number ?? "", customer: inv?.customer_name ?? "", description: `Credit note${inv?.invoice_number ? ` against ${inv.invoice_number}` : ""}`, quantity: 0, net: -r2(b.g - b.v), vat: -r2(b.v), gross: -r2(b.g) });
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date) || a.reference.localeCompare(b.reference));
}

export interface SalesItemGroup { key: string; date: string; kind: "sale" | "credit"; reference: string; customer: string; summary: string; lines: SalesItemRow[]; net: number; vat: number; gross: number; }

/** One row per invoice (or credit note) per day; the first line names the main service, later lines are counted as extras. */
export function groupSalesItems(rows: SalesItemRow[]): SalesItemGroup[] {
  const map = new Map<string, SalesItemGroup>();
  for (const r of rows) {
    const key = `${r.kind}|${r.reference}|${r.date}`;
    let g = map.get(key);
    if (!g) { g = { key, date: r.date, kind: r.kind, reference: r.reference, customer: r.customer, summary: "", lines: [], net: 0, vat: 0, gross: 0 }; map.set(key, g); }
    g.lines.push(r); g.net = r2(g.net + r.net); g.vat = r2(g.vat + r.vat); g.gross = r2(g.gross + r.gross);
  }
  for (const g of map.values()) {
    const more = g.lines.length - 1;
    g.summary = (g.lines[0].description || "—") + (more > 0 ? ` (+${more} more)` : "");
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date) || a.reference.localeCompare(b.reference));
}
