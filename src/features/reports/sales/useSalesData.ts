import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { SalesCredit, SalesInvoice } from "./salesByDepartment";

const INV_SELECT = "id, invoice_number, issue_date, booking_id, invoice_items(description, line_total, vat_amount, quantity, product_id, stock_movement_id, booking_id)";

async function pageAll<T>(build: (from: number, to: number) => any): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

async function serviceMap(tenantId: string, ids: string[]) {
  const m: Record<string, string> = {};
  const uniq = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < uniq.length; i += 200) {
    const { data, error } = await supabase.from("bookings").select("id, service_type").eq("tenant_id", tenantId).in("id", uniq.slice(i, i + 200));
    if (error) throw error;
    for (const b of data ?? []) m[b.id] = b.service_type as string;
  }
  return m;
}

function shape(raw: any, svc: Record<string, string>): SalesInvoice {
  return {
    id: raw.id, invoice_number: raw.invoice_number, issue_date: raw.issue_date,
    booking_service: raw.booking_id ? svc[raw.booking_id] ?? null : null,
    lines: (raw.invoice_items ?? []).map((l: any) => ({
      description: l.description, line_total: Number(l.line_total ?? 0), vat_amount: Number(l.vat_amount ?? 0),
      quantity: Number(l.quantity ?? 1), product_id: l.product_id, stock_movement_id: l.stock_movement_id,
      booking_service: l.booking_id ? svc[l.booking_id] ?? null : null,
    })),
  };
}

/** Issued invoices (by invoice date) and issued credit notes in the range, with source invoices for credit allocation. */
export function useSalesData(tenantId: string | null | undefined, from: string, to: string) {
  return useQuery({
    enabled: !!tenantId,
    queryKey: ["reports", "sales-by-department", tenantId, from, to],
    queryFn: async () => {
      const invs = await pageAll<any>((a, b) => supabase.from("invoices").select(INV_SELECT)
        .eq("tenant_id", tenantId!).gte("issue_date", from).lte("issue_date", to)
        .not("status", "in", "(draft,cancelled)").order("issue_date").range(a, b));
      const cns = await pageAll<any>((a, b) => supabase.from("credit_notes").select("id, issue_date, total, invoice_id")
        .eq("tenant_id", tenantId!).gte("issue_date", from).lte("issue_date", to)
        .in("status", ["issued", "applied"]).order("issue_date").range(a, b));
      const have = new Set(invs.map((i) => i.id));
      const missing = [...new Set(cns.map((c) => c.invoice_id).filter((id) => id && !have.has(id)))];
      const extra: any[] = [];
      for (let i = 0; i < missing.length; i += 200) {
        const { data, error } = await supabase.from("invoices").select(INV_SELECT).eq("tenant_id", tenantId!).in("id", missing.slice(i, i + 200));
        if (error) throw error;
        extra.push(...(data ?? []));
      }
      const all = [...invs, ...extra];
      const svc = await serviceMap(tenantId!, all.flatMap((i) => [i.booking_id, ...(i.invoice_items ?? []).map((l: any) => l.booking_id)]));
      const byId = new Map(all.map((i) => [i.id, shape(i, svc)]));
      const invoices: SalesInvoice[] = invs.map((i) => byId.get(i.id)!);
      const credits: SalesCredit[] = cns.map((c) => ({ id: c.id, issue_date: c.issue_date, total: Number(c.total ?? 0), invoice: c.invoice_id ? byId.get(c.invoice_id) ?? null : null }));
      return { invoices, credits };
    },
  });
}
