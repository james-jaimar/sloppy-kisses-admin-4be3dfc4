import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import type { Product } from "@/features/shop/queries";

export const POS_SALE_TAG = "Retail sale";

export interface PosLine {
  product: Product;
  qty: number;
  /** Optional per-line unit price override (used for manual price edits). */
  unit_price?: number;
}

export interface PosTender {
  method: string;
  amount: number;
  reference?: string | null;
  /** Cash only: how much the customer handed over (change = tendered - amount). */
  tendered?: number | null;
}

export interface ParkedSale {
  id: string;
  tenant_id: string;
  label: string | null;
  customer_id: string | null;
  cart: PosLine[];
  total: number;
  created_at: string;
}

export function lineUnitPrice(l: PosLine): number {
  return Number(l.unit_price ?? l.product.sell_price ?? 0);
}

export function lineTotal(l: PosLine): number {
  return Number((lineUnitPrice(l) * l.qty).toFixed(2));
}

export function cartTotal(lines: PosLine[]): number {
  return Number(lines.reduce((s, l) => s + lineTotal(l), 0).toFixed(2));
}

/** VAT portion of a VAT-inclusive amount. */
export function vatPortion(lines: PosLine[]): number {
  const v = lines.reduce((s, l) => {
    const rate = Number(l.product.vat_rate ?? 0);
    if (!rate) return s;
    const t = lineTotal(l);
    return s + t - t / (1 + rate / 100);
  }, 0);
  return Number(v.toFixed(2));
}

// -------- Parked sales --------

export function useParkedSales(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["pos_parked_sales", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<ParkedSale[]> => {
      const { data, error } = await supabase
        .from("pos_parked_sales" as any)
        .select("*")
        .eq("tenant_id", tenantId as string)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any;
    },
  });
}

export function useParkSale(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { label?: string | null; customer_id?: string | null; cart: PosLine[] }) => {
      const { data: userRes } = await supabase.auth.getUser();
      const { error } = await supabase.from("pos_parked_sales" as any).insert({
        tenant_id: tenantId,
        label: input.label ?? null,
        customer_id: input.customer_id ?? null,
        cart: input.cart as any,
        total: cartTotal(input.cart),
        created_by: userRes.user?.id ?? null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pos_parked_sales"] }),
  });
}

export function useDeleteParkedSale(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pos_parked_sales" as any).delete().eq("id", id).eq("tenant_id", tenantId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pos_parked_sales"] }),
  });
}

// -------- Walk-in customer --------

/** Finds (or creates) the tenant's walk-in customer used for anonymous cash sales. */
export function useEnsureWalkInCustomer(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<string> => {
      const { data: rs } = await supabase
        .from("retail_settings" as any)
        .select("walkin_customer_id")
        .eq("tenant_id", tenantId)
        .maybeSingle();
      const existing = (rs as any)?.walkin_customer_id as string | null | undefined;
      if (existing) return existing;

      const { data: found } = await supabase
        .from("customers")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("full_name", "Walk-in customer")
        .limit(1)
        .maybeSingle();

      let id = (found as any)?.id as string | undefined;
      if (!id) {
        const { data: created, error } = await supabase
          .from("customers")
          .insert({ tenant_id: tenantId, full_name: "Walk-in customer", notify_email: false } as any)
          .select("id")
          .single();
        if (error) throw error;
        id = created.id as string;
      }
      await supabase
        .from("retail_settings" as any)
        .upsert({ tenant_id: tenantId, walkin_customer_id: id } as any, { onConflict: "tenant_id" });
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["retail_settings"] }),
  });
}

// -------- The sale --------

export interface PosSaleResult {
  invoice_id: string;
  invoice_number: string;
  total: number;
  paid: number;
  change: number;
}

/**
 * Rings up a till sale: draft invoice -> lines + stock movements -> issue -> tenders.
 * The invoice must be created as a draft because line items are locked once an
 * invoice is issued; the status is flipped after all lines land.
 */
export function usePosSale(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      customer_id: string;
      location_id: string;
      lines: PosLine[];
      tenders: PosTender[];
      discount?: number;
      till_name?: string | null;
      notes?: string | null;
    }): Promise<PosSaleResult> => {
      if (input.lines.length === 0) throw new Error("Cart is empty");

      const { data: num, error: numErr } = await supabase.rpc("next_invoice_number", { target_tenant_id: tenantId });
      if (numErr) throw numErr;

      const iso = (d: Date) => d.toISOString().slice(0, 10);
      const today = new Date();

      const { data: inv, error: invErr } = await supabase
        .from("invoices")
        .insert({
          tenant_id: tenantId,
          customer_id: input.customer_id,
          invoice_number: num as string,
          status: "draft",
          issue_date: iso(today),
          due_date: iso(today),
          notes: input.notes ?? `${POS_SALE_TAG}${input.till_name ? ` · ${input.till_name}` : ""}`,
        } as any)
        .select("id")
        .single();
      if (invErr) throw invErr;
      const invoiceId = inv.id as string;

      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes.user?.id ?? null;

      let sort = 0;
      for (const l of input.lines) {
        const unit = lineUnitPrice(l);
        const total = lineTotal(l);

        const { data: mv, error: mvErr } = await supabase
          .from("stock_movements" as any)
          .insert({
            tenant_id: tenantId,
            product_id: l.product.id,
            location_id: input.location_id,
            // negative qty on the line = a return, which puts stock back
            qty_delta: -l.qty,
            reason: l.qty < 0 ? "return" : "sale",
            ref_type: "invoice",
            ref_id: invoiceId,
            created_by: userId,
          } as any)
          .select("id")
          .single();
        if (mvErr) throw mvErr;

        const { error: liErr } = await supabase.from("invoice_items").insert({
          tenant_id: tenantId,
          invoice_id: invoiceId,
          description: `${l.product.name}${l.product.sku ? ` (${l.product.sku})` : ""}`,
          quantity: l.qty,
          unit_price: unit,
          line_total: total,
          product_id: l.product.id,
          stock_movement_id: (mv as any).id,
          sort_order: sort++,
        } as any);
        if (liErr) throw liErr;
      }

      if (input.discount && input.discount > 0) {
        const { error: dErr } = await supabase.from("invoice_items").insert({
          tenant_id: tenantId,
          invoice_id: invoiceId,
          description: "Discount",
          quantity: 1,
          unit_price: -Math.abs(input.discount),
          line_total: -Math.abs(input.discount),
          sort_order: sort++,
        } as any);
        if (dErr) throw dErr;
      }

      // Issue the invoice (locks lines, recomputes totals via triggers)
      const { error: sErr } = await supabase
        .from("invoices")
        .update({ status: "sent" } as any)
        .eq("id", invoiceId)
        .eq("tenant_id", tenantId);
      if (sErr) throw sErr;

      let paid = 0;
      let change = 0;
      for (const t of input.tenders) {
        if (!t.amount) continue;
        const { error: pErr } = await supabase.from("payments").insert({
          tenant_id: tenantId,
          invoice_id: invoiceId,
          customer_id: input.customer_id,
          amount: t.amount,
          payment_method: t.method as any,
          payment_reference: t.reference ?? null,
          paid_at: new Date().toISOString(),
          status: "received",
        } as any);
        if (pErr) throw pErr;
        paid += Number(t.amount);
        if (t.tendered != null) change += Math.max(0, Number(t.tendered) - Number(t.amount));
      }

      const { data: fresh } = await supabase
        .from("invoices")
        .select("total, invoice_number")
        .eq("id", invoiceId)
        .maybeSingle();

      return {
        invoice_id: invoiceId,
        invoice_number: (fresh as any)?.invoice_number ?? (num as string),
        total: Number((fresh as any)?.total ?? 0),
        paid: Number(paid.toFixed(2)),
        change: Number(change.toFixed(2)),
      };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["stock_on_hand"] });
      qc.invalidateQueries({ queryKey: ["stock_movements"] });
      qc.invalidateQueries({ queryKey: ["pos_recent_sales"] });
      qc.invalidateQueries({ queryKey: ["pos_today"] });
    },
  });
}

// -------- Recent sales + today at the till --------

export interface RecentSale {
  id: string;
  invoice_number: string;
  total: number;
  amount_paid: number;
  status: string;
  created_at: string;
  customer_id: string | null;
}

export function useRecentSales(tenantId: string | null | undefined, limit = 20) {
  return useQuery({
    queryKey: ["pos_recent_sales", tenantId, limit],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<RecentSale[]> => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, invoice_number, total, amount_paid, status, created_at, customer_id")
        .eq("tenant_id", tenantId as string)
        .ilike("notes", `${POS_SALE_TAG}%`)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as any;
    },
  });
}

export interface TillDaySummary {
  count: number;
  total: number;
  byMethod: { method: string; amount: number }[];
}

export function useTodayAtTheTill(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["pos_today", tenantId],
    enabled: Boolean(tenantId),
    refetchInterval: 60_000,
    queryFn: async (): Promise<TillDaySummary> => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const { data: invs, error } = await supabase
        .from("invoices")
        .select("id, total")
        .eq("tenant_id", tenantId as string)
        .ilike("notes", `${POS_SALE_TAG}%`)
        .gte("created_at", start.toISOString());
      if (error) throw error;
      const ids = (invs ?? []).map((i: any) => i.id);
      let byMethod: { method: string; amount: number }[] = [];
      if (ids.length) {
        const { data: pays } = await supabase
          .from("payments")
          .select("amount, payment_method")
          .in("invoice_id", ids);
        const m = new Map<string, number>();
        (pays ?? []).forEach((p: any) => {
          m.set(p.payment_method, (m.get(p.payment_method) ?? 0) + Number(p.amount ?? 0));
        });
        byMethod = [...m.entries()].map(([method, amount]) => ({ method, amount }));
      }
      return {
        count: (invs ?? []).length,
        total: (invs ?? []).reduce((s: number, i: any) => s + Number(i.total ?? 0), 0),
        byMethod,
      };
    },
  });
}
