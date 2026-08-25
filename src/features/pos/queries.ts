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
        const { data: number, error: numErr } = await supabase
          .rpc("next_customer_number" as any, { target_tenant_id: tenantId } as any);
        if (numErr) throw numErr;
        const { data: created, error } = await supabase
          .from("customers")
          .insert({
            tenant_id: tenantId,
            customer_number: number as any,
            full_name: "Walk-in customer",
            notify_email: false,
          } as any)
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

/** Rings up a till sale atomically through the permission-scoped database RPC. */
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
      const { data, error } = await supabase.rpc("complete_pos_sale", {
        p_tenant_id: tenantId,
        p_customer_id: input.customer_id,
        p_location_id: input.location_id,
        p_lines: input.lines.map((line) => ({
          product_id: line.product.id,
          qty: line.qty,
          unit_price: lineUnitPrice(line),
        })),
        p_tenders: input.tenders.map((tender) => ({
          method: tender.method,
          amount: tender.amount,
          reference: tender.reference ?? null,
          tendered: tender.tendered ?? null,
        })),
        p_discount: input.discount ?? 0,
        p_till_name: input.till_name ?? null,
        p_notes: input.notes ?? null,
      });
      if (error) throw error;

      const result = data?.[0];
      if (!result) throw new Error("The till did not return a receipt");

      return {
        invoice_id: result.invoice_id,
        invoice_number: result.invoice_number,
        total: Number(result.total),
        paid: Number(result.paid),
        change: Number(result.change),
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
