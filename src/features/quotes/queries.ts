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
  extras: QuoteExtras | null;
  hold_until: string | null;
  customer?: { id: string; full_name: string | null; email: string | null } | null;
}

/** Everything the quote carries over to the booking when it is accepted. */
export interface QuoteExtras {
  check_in_window?: string | null;
  check_out_window?: string | null;
  notes?: string | null;
  surcharges?: { surcharge_id: string; quantity: number }[];
  pets?: { pet_id: string; name?: string | null; grooming_required?: boolean; grooming_notes?: string | null }[];
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
  expiry_date?: string | null;
  extras?: QuoteExtras | null;
}

export interface HotelStayLine {
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

/** Prices a hotel stay with the same rules the booking invoice uses. */
export function useHotelStayLines(params: {
  tenantId: string | null | undefined;
  species: "dog" | "cat";
  accommodationType: string | null;
  start: string | null;
  end: string | null;
  petCount: number;
}) {
  const { tenantId, species, accommodationType, start, end, petCount } = params;
  return useQuery({
    queryKey: ["hotel_stay_lines", tenantId, species, accommodationType, start, end, petCount],
    enabled: Boolean(tenantId && accommodationType && start && end && end > start),
    queryFn: async (): Promise<HotelStayLine[]> => {
      const { data, error } = await supabase.rpc("hotel_stay_lines" as any, {
        p_tenant_id: tenantId,
        p_species: species,
        p_accommodation_type: accommodationType,
        p_start: start,
        p_end: end,
        p_pet_count: Math.max(1, petCount),
      });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        description: r.description,
        quantity: Number(r.quantity),
        unit_price: Number(r.unit_price),
        line_total: Number(r.line_total),
      }));
    },
    retry: false,
  });
}

/** Quote validity window configured in Hotel workflow settings (defaults to 14 days). */
export function useQuoteValidityDays(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["quote_validity_days", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase
        .from("hotel_workflow_settings" as any)
        .select("quote_validity_days")
        .eq("tenant_id", tenantId as string)
        .maybeSingle();
      if (error) throw error;
      return Number((data as any)?.quote_validity_days ?? 14) || 14;
    },
  });
}

export function isQuoteExpired(q: Pick<QuoteRow, "status" | "expiry_date">): boolean {
  if (!q.expiry_date) return false;
  if (q.status === "accepted" || q.status === "cancelled") return false;
  return q.expiry_date < new Date().toISOString().slice(0, 10);
}

/** Downloads the quote PDF. */
export async function downloadQuotePdf(quoteId: string, filename: string) {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) throw new Error("Not signed in");
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-quote-pdf`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
    },
    body: JSON.stringify({ quote_id: quoteId }),
  });
  if (!res.ok) {
    let msg = `Failed (${res.status})`;
    try { const j = await res.json(); msg = j.error || msg; } catch { /* noop */ }
    throw new Error(msg);
  }
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

/** Emails the quote PDF to the customer. */
export function useSendQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke("send-quote-email", {
        body: { quote_id: id },
      });
      if (error) {
        // invoke() masks server errors as "non-2xx status code" — read the body.
        let detail = error.message;
        const ctx = (error as any)?.context;
        if (ctx?.text) {
          try {
            const raw = await ctx.text();
            detail = (() => { try { return JSON.parse(raw)?.error ?? raw; } catch { return raw; } })() || detail;
          } catch { /* keep original message */ }
        }
        throw new Error(detail);
      }
      if ((data as any)?.ok === false) throw new Error((data as any)?.error ?? "Could not send the quote");
      return data;
    },
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["estimates"] });
      qc.invalidateQueries({ queryKey: ["estimate", id] });
    },
  });
}

export function useCreateQuote(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewQuoteInput): Promise<string> => {
      const { data: num, error: numErr } = await supabase.rpc("next_estimate_number" as any, {
        target_tenant_id: tenantId,
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
          expiry_date: input.expiry_date ?? null,
          extras: (input.extras ?? null) as any,
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
    mutationFn: async ({
      id, status, validityDays,
    }: { id: string; status: "sent" | "cancelled" | "draft"; validityDays?: number }) => {
      const patch: Record<string, any> = { status, updated_at: new Date().toISOString() };
      if (status === "sent") {
        const now = new Date();
        patch.sent_at = now.toISOString();
        // The hold on the dates starts the moment the quote is sent.
        const days = validityDays && validityDays > 0 ? validityDays : 14;
        const until = new Date(now.getTime() + days * 86400000).toISOString().slice(0, 10);
        patch.hold_until = until;
        patch.expiry_date = until;
      }
      if (status === "cancelled") patch.declined_at = new Date().toISOString();
      const { error } = await supabase.from("estimates" as any).update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["estimates"] });
      qc.invalidateQueries({ queryKey: ["estimate", v.id] });
      qc.invalidateQueries({ queryKey: ["hotel_pencilled"] });
    },
  });
}

export interface PencilledDay { day: string; accommodation_type: string; pets: number }

/** Pets pencilled in by unaccepted, still-held quotes for each night in the range. */
export function usePencilledDays(params: {
  tenantId: string | null | undefined;
  start: string | null;
  end: string | null;
  excludeEstimateId?: string | null;
}) {
  const { tenantId, start, end, excludeEstimateId } = params;
  return useQuery({
    queryKey: ["hotel_pencilled", tenantId, start, end, excludeEstimateId ?? null],
    enabled: Boolean(tenantId && start && end && end > start),
    queryFn: async (): Promise<PencilledDay[]> => {
      const { data, error } = await supabase.rpc("hotel_pencilled_by_day" as any, {
        p_tenant_id: tenantId,
        p_start: start,
        p_end: end,
        p_exclude_estimate_id: excludeEstimateId ?? null,
      });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        day: r.day,
        accommodation_type: r.accommodation_type,
        pets: Number(r.pets),
      }));
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
