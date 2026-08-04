import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

export interface QuoteRow {
  id: string;
  tenant_id: string;
  customer_id: string;
  estimate_number: string | null;
  status: string;
  issue_date: string | null;
  expiry_date: string | null;
  subtotal: number;
  total: number;
  notes: string | null;
  service_type: string | null;
  start_at: string | null;
  end_at: string | null;
  accommodation_type: string | null;
  pet_ids: string[] | null;
  booking_id: string | null;
  sent_at: string | null;
  accepted_at: string | null;
  declined_at: string | null;
  customer?: { id: string; full_name: string | null; email: string | null } | null;
}

export interface QuoteItemRow {
  id: string;
  estimate_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  sort_order: number;
}

export function useQuotes(tenantId: string | null | undefined, status?: string) {
  return useQuery({
    queryKey: ["estimates", tenantId, status ?? "all"],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<QuoteRow[]> => {
      let q = supabase
        .from("estimates" as any)
        .select("*, customer:customers(id, full_name, email)")
        .eq("tenant_id", tenantId as string)
        .order("created_at", { ascending: false })
        .limit(500);
      if (status && status !== "all") q = q.eq("status", status);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as QuoteRow[];
    },
  });
}

export function useQuote(id: string | null | undefined) {
  return useQuery({
    queryKey: ["estimate", id],
    enabled: Boolean(id),
    queryFn: async (): Promise<QuoteRow | null> => {
      const { data, error } = await supabase
        .from("estimates" as any)
        .select("*, customer:customers(id, full_name, email)")
        .eq("id", id as string)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as QuoteRow | null;
    },
  });
}

export function useQuoteItems(estimateId: string | null | undefined) {
  return useQuery({
    queryKey: ["estimate_items", estimateId],
    enabled: Boolean(estimateId),
    queryFn: async (): Promise<QuoteItemRow[]> => {
      const { data, error } = await supabase
        .from("estimate_items" as any)
        .select("*")
        .eq("estimate_id", estimateId as string)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as unknown as QuoteItemRow[];
    },
  });
}

export interface NewQuoteInput {
  customer_id: string;
  service_type: string;
  start_at: string | null;
  end_at: string | null;
  accommodation_type: string | null;
  pet_ids: string[];
  notes: string | null;
  items: { description: string; quantity: number; unit_price: number }[];
}

export function useCreateQuote(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewQuoteInput): Promise<string> => {
      const { data: num, error: numErr } = await supabase.rpc("next_estimate_number" as any, {
        p_tenant_id: tenantId,
      });
      if (numErr) throw numErr;

      const subtotal = input.items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
      const { data, error } = await supabase
        .from("estimates" as any)
        .insert({
          tenant_id: tenantId,
          customer_id: input.customer_id,
          estimate_number: num,
          status: "draft",
          issue_date: new Date().toISOString().slice(0, 10),
          service_type: input.service_type,
          start_at: input.start_at,
          end_at: input.end_at,
          accommodation_type: input.accommodation_type,
          pet_ids: input.pet_ids,
          notes: input.notes,
          subtotal,
          total: subtotal,
        } as any)
        .select("id")
        .single();
      if (error) throw error;
      const id = (data as any).id as string;

      if (input.items.length > 0) {
        const rows = input.items.map((i, idx) => ({
          tenant_id: tenantId,
          estimate_id: id,
          description: i.description,
          quantity: i.quantity,
          unit_price: i.unit_price,
          line_total: Number((i.quantity * i.unit_price).toFixed(2)),
          sort_order: idx,
        }));
        const { error: itemErr } = await supabase.from("estimate_items" as any).insert(rows as any);
        if (itemErr) throw itemErr;
      }
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["estimates"] }),
  });
}

export function useUpdateQuoteStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "sent" | "cancelled" | "draft" }) => {
      const patch: Record<string, any> = { status, updated_at: new Date().toISOString() };
      if (status === "sent") patch.sent_at = new Date().toISOString();
      if (status === "cancelled") patch.declined_at = new Date().toISOString();
      const { error } = await supabase.from("estimates" as any).update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["estimates"] });
      qc.invalidateQueries({ queryKey: ["estimate", v.id] });
    },
  });
}

/** Accepts the quote and creates the real booking (deposit invoice follows automatically). */
export function useAcceptQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<string> => {
      const { data, error } = await supabase.rpc("accept_estimate" as any, { p_estimate_id: id });
      if (error) throw error;
      return data as unknown as string;
    },
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["estimates"] });
      qc.invalidateQueries({ queryKey: ["estimate", id] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}
