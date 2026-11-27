import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { DateBasis, SalesCredit, SalesInvoice } from "./salesByDepartment";

const localDay = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

const INV_SELECT = "id, invoice_number, issue_date, status, booking_id, customer:customers(full_name), invoice_items(description, line_total, vat_amount, quantity, product_id, stock_movement_id, booking_id)";

async function pageAll<T>(build: (from: number, to: number) => any): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

type Svc = Record<string, { service: string; day: string | null }>;
async function serviceMap(tenantId: string, ids: string[]) {
  const m: Svc = {};
  const uniq = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < uniq.length; i += 200) {
    const { data, error } = await supabase.from("bookings").select("id, service_type, start_at").eq("tenant_id", tenantId).in("id", uniq.slice(i, i + 200));
    if (error) throw error;
    for (const b of data ?? []) m[b.id] = { service: b.service_type as string, day: b.start_at ? localDay(b.start_at as string) : null };
  }
  return m;
}

function shape(raw: any, svc: Svc): SalesInvoice {
  return {
    id: raw.id, invoice_number: raw.invoice_number, issue_date: raw.issue_date, customer_name: raw.customer?.full_name ?? null,
    booking_service: raw.booking_id ? svc[raw.booking_id]?.service ?? null : null,
    service_date: raw.booking_id ? svc[raw.booking_id]?.day ?? null : null,
    lines: (raw.invoice_items ?? []).map((l: any) => ({
      description: l.description, line_total: Number(l.line_total ?? 0), vat_amount: Number(l.vat_amount ?? 0),
      quantity: Number(l.quantity ?? 1), product_id: l.product_id, stock_movement_id: l.stock_movement_id,
      booking_service: l.booking_id ? svc[l.booking_id]?.service ?? null : null,
      service_date: l.booking_id ? svc[l.booking_id]?.day ?? null : null,
    })),
  };
}

const ISSUED = "(draft,cancelled)";

async function byIds(tenantId: string, ids: string[]) {
  const out: any[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase.from("invoices").select(INV_SELECT).eq("tenant_id", tenantId).in("id", ids.slice(i, i + 200));
    if (error) throw error;
    out.push(...(data ?? []));
  }
  return out;
}

/**
 * Invoice basis: issued invoices and credit notes dated in the range.
 * Service basis: issued invoices with any line whose booking happens in the range (plus till sales issued in the range),
 * and every credit note against those invoices; the report keeps only lines on in-range service days.
 */
export function useSalesData(tenantId: string | null | undefined, from: string, to: string, basis: DateBasis = "service") {
  return useQuery({
    enabled: !!tenantId,
    queryKey: ["reports", "sales-by-department", tenantId, from, to, basis],
    queryFn: async () => {
      const t = tenantId!;
      let invs = await pageAll<any>((a, b) => supabase.from("invoices").select(INV_SELECT)
        .eq("tenant_id", t).gte("issue_date", from).lte("issue_date", to)
        .not("status", "in", ISSUED).order("issue_date").range(a, b));
      let cns: any[];
      if (basis === "service") {
        const bks = await pageAll<any>((a, b) => supabase.from("bookings").select("id")
          .eq("tenant_id", t).gte("start_at", `${from}T00:00:00+02:00`).lte("start_at", `${to}T23:59:59.999+02:00`).range(a, b));
        const bIds = bks.map((b) => b.id as string);
        const invIds = new Set<string>();
        for (let i = 0; i < bIds.length; i += 200) {
          const chunk = bIds.slice(i, i + 200);
          const [h, l] = await Promise.all([
            supabase.from("invoices").select("id").eq("tenant_id", t).in("booking_id", chunk),
            supabase.from("invoice_items").select("invoice_id").in("booking_id", chunk),
          ]);
          if (h.error) throw h.error; if (l.error) throw l.error;
          for (const r of h.data ?? []) invIds.add(r.id as string);
          for (const r of l.data ?? []) if (r.invoice_id) invIds.add(r.invoice_id as string);
        }
        const have = new Set(invs.map((i) => i.id));
        const more = (await byIds(t, [...invIds].filter((id) => !have.has(id)))).filter((i: any) => i.status !== "draft" && i.status !== "cancelled");
        invs = [...invs, ...more];
        const ids = invs.map((i) => i.id as string);
        cns = [];
        for (let i = 0; i < ids.length; i += 200) {
          const { data, error } = await supabase.from("credit_notes").select("id, credit_note_number, issue_date, total, invoice_id")
            .eq("tenant_id", t).in("invoice_id", ids.slice(i, i + 200)).in("status", ["issued", "applied"]);
          if (error) throw error;
          cns.push(...(data ?? []));
        }
      } else {
        cns = await pageAll<any>((a, b) => supabase.from("credit_notes").select("id, credit_note_number, issue_date, total, invoice_id")
          .eq("tenant_id", t).gte("issue_date", from).lte("issue_date", to)
          .in("status", ["issued", "applied"]).order("issue_date").range(a, b));
      }
      const have = new Set(invs.map((i) => i.id));
      const extra = await byIds(t, [...new Set(cns.map((c) => c.invoice_id).filter((id) => id && !have.has(id)))]);
      const all = [...invs, ...extra];
      const svc = await serviceMap(t, all.flatMap((i) => [i.booking_id, ...(i.invoice_items ?? []).map((l: any) => l.booking_id)]));
      const byId = new Map(all.map((i) => [i.id, shape(i, svc)]));
      const invoices: SalesInvoice[] = invs.map((i) => byId.get(i.id)!);
      const credits: SalesCredit[] = cns.map((c) => ({ id: c.id, credit_note_number: c.credit_note_number, issue_date: c.issue_date, total: Number(c.total ?? 0), invoice: c.invoice_id ? byId.get(c.invoice_id) ?? null : null }));
      return { invoices, credits };
    },
  });
}
