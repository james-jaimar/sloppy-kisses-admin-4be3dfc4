import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type RevenueRow = {
  invoice_id: string;
  invoice_number: string | null;
  status: string;
  issue_date: string | null;
  customer_id: string | null;
  customer_name: string | null;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  total: number;
  amount_paid: number;
};

export function useRevenueInvoices(
  tenantId: string | null | undefined,
  from: string,
  to: string
) {
  return useQuery({
    enabled: !!tenantId && !!supabase,
    queryKey: ["reports", "revenue", tenantId, from, to],
    queryFn: async (): Promise<RevenueRow[]> => {
      const { data, error } = await supabase!
        .from("invoices")
        .select(
          "id, invoice_number, status, issue_date, customer_id, subtotal, discount_total, tax_total, total, amount_paid, customers:customer_id(display_name, first_name, last_name)"
        )
        .eq("tenant_id", tenantId!)
        .gte("issue_date", from)
        .lte("issue_date", to)
        .not("status", "in", "(draft,cancelled)")
        .order("issue_date", { ascending: true })
        .limit(5000);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        invoice_id: r.id,
        invoice_number: r.invoice_number,
        status: r.status,
        issue_date: r.issue_date,
        customer_id: r.customer_id,
        customer_name:
          r.customers?.display_name ??
          [r.customers?.first_name, r.customers?.last_name].filter(Boolean).join(" ") ??
          null,
        subtotal: Number(r.subtotal ?? 0),
        discount_total: Number(r.discount_total ?? 0),
        tax_total: Number(r.tax_total ?? 0),
        total: Number(r.total ?? 0),
        amount_paid: Number(r.amount_paid ?? 0),
      }));
    },
  });
}

export type VatLine = {
  invoice_id: string;
  invoice_number: string | null;
  issue_date: string | null;
  customer_name: string | null;
  net: number;
  vat: number;
  gross: number;
  vat_rate: number;
};

/** Aggregates invoice_items to per-invoice VAT band totals for a period. */
export function useVatLines(
  tenantId: string | null | undefined,
  from: string,
  to: string
) {
  return useQuery({
    enabled: !!tenantId && !!supabase,
    queryKey: ["reports", "vat", tenantId, from, to],
    queryFn: async (): Promise<VatLine[]> => {
      const { data, error } = await supabase!
        .from("invoices")
        .select(
          "id, invoice_number, issue_date, customer_id, customers:customer_id(display_name, first_name, last_name), invoice_items(vat_rate, vat_amount, line_total, discount_amount, quantity, unit_price)"
        )
        .eq("tenant_id", tenantId!)
        .gte("issue_date", from)
        .lte("issue_date", to)
        .not("status", "in", "(draft,cancelled)")
        .limit(5000);
      if (error) throw error;
      const rows: VatLine[] = [];
      for (const inv of data ?? []) {
        const items = ((inv as any).invoice_items ?? []) as any[];
        // group by vat rate per invoice
        const buckets = new Map<number, { net: number; vat: number }>();
        for (const it of items) {
          const rate = Number(it.vat_rate ?? 0);
          const vat = Number(it.vat_amount ?? 0);
          const line = Number(it.line_total ?? 0);
          const net = line - vat;
          const b = buckets.get(rate) ?? { net: 0, vat: 0 };
          b.net += net;
          b.vat += vat;
          buckets.set(rate, b);
        }
        const cust: any = (inv as any).customers;
        const name =
          cust?.display_name ??
          [cust?.first_name, cust?.last_name].filter(Boolean).join(" ") ??
          null;
        for (const [rate, b] of buckets) {
          rows.push({
            invoice_id: (inv as any).id,
            invoice_number: (inv as any).invoice_number,
            issue_date: (inv as any).issue_date,
            customer_name: name,
            vat_rate: rate,
            net: b.net,
            vat: b.vat,
            gross: b.net + b.vat,
          });
        }
      }
      return rows;
    },
  });
}

/** Bi-monthly SARS VAT periods (Category A: Jan/Mar/May/... — we default to
 *  simple 2-month buckets starting from Jan of the current year). */
export function vatPeriods(year: number, category: "A" | "B" = "A") {
  // Category A: JAN-FEB, MAR-APR, MAY-JUN, JUL-AUG, SEP-OCT, NOV-DEC
  // Category B: FEB-MAR, APR-MAY, JUN-JUL, AUG-SEP, OCT-NOV, DEC-JAN
  const offset = category === "A" ? 0 : 1;
  const periods: { label: string; from: string; to: string }[] = [];
  for (let i = 0; i < 6; i++) {
    const startMonth = i * 2 + offset;
    const start = new Date(Date.UTC(year, startMonth, 1));
    const end = new Date(Date.UTC(year, startMonth + 2, 0));
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const monthName = (d: Date) =>
      d.toLocaleString("en-ZA", { month: "short", timeZone: "UTC" });
    periods.push({
      label: `${monthName(start)}–${monthName(end)} ${end.getUTCFullYear()}`,
      from: iso(start),
      to: iso(end),
    });
  }
  return periods;
}