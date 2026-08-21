import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

export interface Product {
  id: string;
  tenant_id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  category_id: string | null;
  category: string | null;
  unit: string | null;
  cost_price: number | null;
  sell_price: number | null;
  vat_rate: number;
  reorder_level: number | null;
  sort_order: number;
  active: boolean;
  description: string | null;
  image_url: string | null;
}


export interface ProductCategory {
  id: string;
  tenant_id: string;
  name: string;
  sort_order: number;
  active: boolean;
}

export interface StockLocation {
  id: string;
  tenant_id: string;
  name: string;
  is_default: boolean;
  active: boolean;
  sort_order: number;
}

export type StockReason = "receive" | "sale" | "adjustment" | "wastage" | "return";

export interface StockMovement {
  id: string;
  tenant_id: string;
  product_id: string;
  location_id: string;
  qty_delta: number;
  reason: StockReason;
  ref_type: string | null;
  ref_id: string | null;
  notes: string | null;
  created_at: string;
}

export interface RetailSettings {
  tenant_id: string;
  default_vat_rate: number;
  allow_negative_stock: boolean;
  low_stock_notify_emails: string | null;
  till_name: string | null;
  receipt_footer: string | null;
  pos_location_id: string | null;
  walkin_customer_id: string | null;
}

// -------- Products --------

export function useProducts(tenantId: string | null | undefined, opts?: { activeOnly?: boolean; search?: string }) {
  return useQuery({
    queryKey: ["products", tenantId, opts?.activeOnly ?? false, opts?.search ?? ""],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<Product[]> => {
      let q = supabase.from("products").select("*").eq("tenant_id", tenantId as string)
        .order("sort_order", { ascending: true }).order("name", { ascending: true });
      if (opts?.activeOnly) q = q.eq("active", true);
      if (opts?.search && opts.search.trim()) {
        const s = `%${opts.search.trim()}%`;
        q = q.or(`name.ilike.${s},sku.ilike.${s},barcode.ilike.${s}`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any as Product[];
    },
  });
}

export function useProduct(id: string | undefined, tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["product", tenantId, id],
    enabled: Boolean(id && tenantId),
    queryFn: async (): Promise<Product | null> => {
      const { data, error } = await supabase.from("products").select("*")
        .eq("id", id as string).eq("tenant_id", tenantId as string).maybeSingle();
      if (error) throw error;
      return (data ?? null) as any;
    },
  });
}

export function useUpsertProduct(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Product> & { name: string }) => {
      const payload: any = {
        tenant_id: tenantId,
        name: input.name,
        sku: input.sku ?? null,
        barcode: input.barcode ?? null,
        category_id: input.category_id ?? null,
        unit: input.unit ?? null,
        cost_price: input.cost_price ?? null,
        sell_price: input.sell_price ?? null,
        vat_rate: input.vat_rate ?? 15,
        reorder_level: input.reorder_level ?? null,
        sort_order: input.sort_order ?? 0,
        active: input.active ?? true,
        description: input.description ?? null,
      };
      if (input.id) {
        const { error } = await supabase.from("products").update(payload).eq("id", input.id).eq("tenant_id", tenantId);
        if (error) throw error;
        return input.id;
      }
      const { data, error } = await supabase.from("products").insert(payload).select("id").single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["product"] });
      qc.invalidateQueries({ queryKey: ["stock_on_hand"] });
    },
  });
}

// -------- Categories --------

export function useProductCategories(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["product_categories", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<ProductCategory[]> => {
      const { data, error } = await supabase.from("product_categories" as any).select("*")
        .eq("tenant_id", tenantId as string).order("sort_order").order("name");
      if (error) throw error;
      return (data ?? []) as any;
    },
  });
}

export function useUpsertProductCategory(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<ProductCategory> & { name: string }) => {
      const payload: any = { tenant_id: tenantId, name: input.name, sort_order: input.sort_order ?? 0, active: input.active ?? true };
      if (input.id) {
        const { error } = await supabase.from("product_categories" as any).update(payload).eq("id", input.id).eq("tenant_id", tenantId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("product_categories" as any).insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["product_categories"] }),
  });
}

export function useDeleteProductCategory(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("product_categories" as any).delete().eq("id", id).eq("tenant_id", tenantId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["product_categories"] }),
  });
}

// -------- Locations --------

export function useStockLocations(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["stock_locations", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<StockLocation[]> => {
      const { data, error } = await supabase.from("stock_locations" as any).select("*")
        .eq("tenant_id", tenantId as string).order("sort_order").order("name");
      if (error) throw error;
      return (data ?? []) as any;
    },
  });
}

export function useDefaultLocation(tenantId: string | null | undefined) {
  const q = useStockLocations(tenantId);
  const locs = q.data ?? [];
  const def = locs.find((l) => l.is_default && l.active) ?? locs.find((l) => l.active) ?? null;
  return { ...q, defaultLocation: def };
}

export function useUpsertStockLocation(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<StockLocation> & { name: string }) => {
      const payload: any = {
        tenant_id: tenantId, name: input.name,
        is_default: input.is_default ?? false, active: input.active ?? true,
        sort_order: input.sort_order ?? 0,
      };
      if (input.id) {
        const { error } = await supabase.from("stock_locations" as any).update(payload).eq("id", input.id).eq("tenant_id", tenantId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("stock_locations" as any).insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["stock_locations"] }),
  });
}

export function useDeleteStockLocation(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("stock_locations" as any).delete().eq("id", id).eq("tenant_id", tenantId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["stock_locations"] }),
  });
}

// -------- Stock on hand + movements --------

export interface StockOnHandRow {
  product_id: string;
  location_id: string;
  qty_on_hand: number;
  last_movement_at: string | null;
}

export function useStockOnHand(tenantId: string | null | undefined, locationId?: string | null) {
  return useQuery({
    queryKey: ["stock_on_hand", tenantId, locationId ?? "all"],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<StockOnHandRow[]> => {
      let q = supabase.from("v_stock_on_hand" as any).select("product_id, location_id, qty_on_hand, last_movement_at")
        .eq("tenant_id", tenantId as string);
      if (locationId) q = q.eq("location_id", locationId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any;
    },
  });
}

export function useProductMovements(tenantId: string | null | undefined, productId: string | null | undefined) {
  return useQuery({
    queryKey: ["stock_movements", tenantId, productId],
    enabled: Boolean(tenantId && productId),
    queryFn: async (): Promise<StockMovement[]> => {
      const { data, error } = await supabase.from("stock_movements" as any).select("*")
        .eq("tenant_id", tenantId as string).eq("product_id", productId as string)
        .order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return (data ?? []) as any;
    },
  });
}

export function useCreateStockMovement(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      product_id: string; location_id: string; qty_delta: number; reason: StockReason;
      notes?: string | null; ref_type?: string | null; ref_id?: string | null;
    }) => {
      const { data: userRes } = await supabase.auth.getUser();
      const payload: any = {
        tenant_id: tenantId,
        product_id: input.product_id,
        location_id: input.location_id,
        qty_delta: input.qty_delta,
        reason: input.reason,
        notes: input.notes ?? null,
        ref_type: input.ref_type ?? null,
        ref_id: input.ref_id ?? null,
        created_by: userRes.user?.id ?? null,
      };
      const { data, error } = await supabase.from("stock_movements" as any).insert(payload).select("id").single();
      if (error) throw error;
      return (data as any).id as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock_on_hand"] });
      qc.invalidateQueries({ queryKey: ["stock_movements"] });
    },
  });
}

// -------- Retail settings --------

export function useRetailSettings(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["retail_settings", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<RetailSettings | null> => {
      const { data, error } = await supabase.from("retail_settings" as any).select("*")
        .eq("tenant_id", tenantId as string).maybeSingle();
      if (error) throw error;
      return (data ?? null) as any;
    },
  });
}

export function useUpdateRetailSettings(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<RetailSettings>) => {
      const { error } = await supabase.from("retail_settings" as any)
        .upsert({ tenant_id: tenantId, ...patch } as any, { onConflict: "tenant_id" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["retail_settings"] }),
  });
}

// -------- Quick sale --------

/** Create an invoice from a cart of products, deduct stock, and optionally record payment.
 *  Returns the new invoice id. */
export function useQuickSale(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      customer_id: string;
      location_id: string;
      lines: { product: Product; qty: number }[];
      payment?: { amount: number; method: string; reference?: string | null } | null;
      notes?: string | null;
    }) => {
      if (input.lines.length === 0) throw new Error("Cart is empty");

      // 1) invoice number
      const { data: num, error: numErr } = await supabase.rpc("next_invoice_number", { target_tenant_id: tenantId });
      if (numErr) throw numErr;

      // 2) create invoice as 'sent' (immediate over-the-counter sale)
      const today = new Date();
      const iso = (d: Date) => d.toISOString().slice(0, 10);
      const { data: inv, error: invErr } = await supabase.from("invoices").insert({
        tenant_id: tenantId,
        customer_id: input.customer_id,
        invoice_number: num as string,
        status: "sent",
        issue_date: iso(today),
        due_date: iso(today),
        notes: input.notes ?? "Retail sale",
      } as any).select("id").single();
      if (invErr) throw invErr;
      const invoiceId = inv.id as string;

      // 3) auth for created_by on movements
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes.user?.id ?? null;

      let subtotal = 0;
      let sort = 0;

      for (const l of input.lines) {
        const unit = Number(l.product.sell_price ?? 0);
        const line_total = Number((unit * l.qty).toFixed(2));
        subtotal += line_total;

        // stock movement
        const { data: mv, error: mvErr } = await supabase.from("stock_movements" as any).insert({
          tenant_id: tenantId,
          product_id: l.product.id,
          location_id: input.location_id,
          qty_delta: -Math.abs(l.qty),
          reason: "sale",
          ref_type: "invoice",
          ref_id: invoiceId,
          created_by: userId,
        } as any).select("id").single();
        if (mvErr) throw mvErr;

        // invoice line
        const { error: liErr } = await supabase.from("invoice_items").insert({
          tenant_id: tenantId,
          invoice_id: invoiceId,
          description: `${l.product.name}${l.product.sku ? ` (${l.product.sku})` : ""}`,
          quantity: l.qty,
          unit_price: unit,
          line_total,
          product_id: l.product.id,
          stock_movement_id: (mv as any).id,
          sort_order: sort++,
        } as any);
        if (liErr) throw liErr;
      }

      // 4) totals
      const { error: uErr } = await supabase.from("invoices").update({
        subtotal, total: subtotal, balance_due: subtotal, amount_paid: 0,
      } as any).eq("id", invoiceId).eq("tenant_id", tenantId);
      if (uErr) throw uErr;

      // 5) optional payment
      if (input.payment && input.payment.amount > 0) {
        const { error: pErr } = await supabase.from("payments").insert({
          tenant_id: tenantId,
          invoice_id: invoiceId,
          customer_id: input.customer_id,
          amount: input.payment.amount,
          payment_method: input.payment.method as any,
          payment_reference: input.payment.reference ?? null,
          paid_at: new Date().toISOString(),
          status: "received",
        } as any);
        if (pErr) throw pErr;

        const paid = input.payment.amount;
        const balance = Math.max(0, subtotal - paid);
        const status = paid >= subtotal ? "paid" : "part_paid";
        await supabase.from("invoices").update({
          amount_paid: paid, balance_due: balance, status,
        } as any).eq("id", invoiceId).eq("tenant_id", tenantId);
      }

      return invoiceId;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["stock_on_hand"] });
      qc.invalidateQueries({ queryKey: ["stock_movements"] });
    },
  });
}