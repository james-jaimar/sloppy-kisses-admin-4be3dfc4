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
          "id, invoice_number, status, issue_date, customer_id, subtotal, discount_total, tax_total, total, amount_paid, customers:customer_id(first_name, last_name)"
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
          [r.customers?.first_name, r.customers?.last_name].filter(Boolean).join(" ") || null,
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
          "id, invoice_number, issue_date, customer_id, customers:customer_id(first_name, last_name), invoice_items(vat_rate, vat_amount, line_total, discount_amount, quantity, unit_price)"
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
          [cust?.first_name, cust?.last_name].filter(Boolean).join(" ") || null;
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

/* ---------------- Data export (customers & pets for Xero matching) ------- */

export type CustomerExportRow = {
  sk_number: string | null;
  original_xero_name: string | null;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
  mobile: string | null;
  phone_alt: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  suburb: string | null;
  city: string | null;
  province: string | null;
  postcode: string | null;
  status: string | null;
  pet_count: number | null;
  date_added: string | null;
};

export type PetExportRow = {
  sp_number: string | null;
  pet_name: string | null;
  species: string | null;
  breed: string | null;
  size: string | null;
  date_of_birth: string | null;
  owner_sk_number: string | null;
  owner_name: string | null;
  owner_email: string | null;
  owner_mobile: string | null;
};

export function useCustomerExport(
  tenantId: string | null | undefined,
  activeOnly: boolean
) {
  return useQuery({
    enabled: !!tenantId && !!supabase,
    queryKey: ["reports", "export", "customers", tenantId, activeOnly],
      queryFn: async (): Promise<CustomerExportRow[]> => {
      // PostgREST caps each response at 1000 rows — page through until done.
      const pageSize = 1000;
      const rows: CustomerExportRow[] = [];
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await (supabase as any)
          .rpc("export_customers_for_xero", {
            p_tenant_id: tenantId,
            p_active_only: activeOnly,
          })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        const batch = (data ?? []) as CustomerExportRow[];
        rows.push(...batch);
        if (batch.length < pageSize) break;
      }
      return rows;
    },
  });
}

export function usePetExport(
  tenantId: string | null | undefined,
  activeOnly: boolean
) {
  return useQuery({
    enabled: !!tenantId && !!supabase,
    queryKey: ["reports", "export", "pets", tenantId, activeOnly],
      queryFn: async (): Promise<PetExportRow[]> => {
      const pageSize = 1000;
      const rows: PetExportRow[] = [];
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await (supabase as any)
          .rpc("export_pets_for_xero", {
            p_tenant_id: tenantId,
            p_active_only: activeOnly,
          })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        const batch = (data ?? []) as PetExportRow[];
        rows.push(...batch);
        if (batch.length < pageSize) break;
      }
      return rows;
    },
  });
}