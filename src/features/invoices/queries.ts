import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type InvoiceRow = Database["public"]["Tables"]["invoices"]["Row"];
type ItemRow = Database["public"]["Tables"]["invoice_items"]["Row"];
type PaymentRow = Database["public"]["Tables"]["payments"]["Row"];

export interface InvoiceListItem extends InvoiceRow {
  customer: { id: string; full_name: string | null; customer_number: string | null } | null;
}

export interface InvoiceDetail extends InvoiceRow {
  customer: { id: string; full_name: string | null; email: string | null; mobile: string | null; customer_number: string | null } | null;
  items: ItemRow[];
  payments: PaymentRow[];
}

export function useInvoices(tenantId: string | null | undefined, opts?: { status?: string; customerId?: string; from?: string; to?: string; unpaidOnly?: boolean }) {
  return useQuery({
    queryKey: ["invoices", tenantId, opts],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<InvoiceListItem[]> => {
      let q = supabase
        .from("invoices")
        .select("*, customer:customers(id, full_name, customer_number)")
        .eq("tenant_id", tenantId as string)
        .order("created_at", { ascending: false });
      if (opts?.status) q = q.eq("status", opts.status as any);
      if (opts?.customerId) q = q.eq("customer_id", opts.customerId);
      if (opts?.from) q = q.gte("issue_date", opts.from);
      if (opts?.to) q = q.lte("issue_date", opts.to);
      const { data, error } = await q;
      if (error) throw error;
      let rows = (data ?? []) as any as InvoiceListItem[];
      if (opts?.unpaidOnly) {
        rows = rows.filter((r) => Number(r.total) > Number(r.amount_paid) && r.status !== "cancelled" && r.status !== "draft");
      }
      return rows;
    },
  });
}

export function useInvoice(id: string | undefined, tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["invoice", tenantId, id],
    enabled: Boolean(id && tenantId),
    queryFn: async (): Promise<InvoiceDetail | null> => {
      const invP = supabase
        .from("invoices")
        .select("*, customer:customers(id, full_name, email, mobile, customer_number)")
        .eq("id", id as string)
        .eq("tenant_id", tenantId as string)
        .maybeSingle();
      const itemsP = supabase
        .from("invoice_items")
        .select("*")
        .eq("invoice_id", id as string)
        .eq("tenant_id", tenantId as string)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      const paymentsP = supabase
        .from("payments")
        .select("*")
        .eq("invoice_id", id as string)
        .eq("tenant_id", tenantId as string)
        .order("paid_at", { ascending: false });
      const [invR, itemsR, paymentsR] = await Promise.all([invP, itemsP, paymentsP]);
      if (invR.error) throw invR.error;
      if (itemsR.error) throw itemsR.error;
      if (paymentsR.error) throw paymentsR.error;
      if (!invR.data) return null;
      return { ...(invR.data as any), items: itemsR.data ?? [], payments: paymentsR.data ?? [] };
    },
  });
}

/** Recompute subtotal/total/amount_paid/balance and persist. Simple sum(line_total) = subtotal = total for now. */
async function recomputeInvoiceTotals(invoiceId: string, tenantId: string) {
  const [{ data: items, error: iErr }, { data: pays, error: pErr }] = await Promise.all([
    supabase.from("invoice_items").select("line_total").eq("invoice_id", invoiceId).eq("tenant_id", tenantId),
    supabase.from("payments").select("amount").eq("invoice_id", invoiceId).eq("tenant_id", tenantId),
  ]);
  if (iErr) throw iErr;
  if (pErr) throw pErr;
  const subtotal = (items ?? []).reduce((s, r) => s + Number(r.line_total ?? 0), 0);
  const total = subtotal;
  const paid = (pays ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);
  const balance = Math.max(0, total - paid);
  // status transitions
  const { data: inv } = await supabase.from("invoices").select("status, due_date").eq("id", invoiceId).maybeSingle();
  let nextStatus = inv?.status ?? "draft";
  if (nextStatus !== "draft" && nextStatus !== "cancelled") {
    if (total > 0 && paid >= total) nextStatus = "paid";
    else if (paid > 0) nextStatus = "part_paid";
    else if (inv?.due_date && inv.due_date < new Date().toISOString().slice(0, 10)) nextStatus = "overdue";
  }
  const { error } = await supabase
    .from("invoices")
    .update({ subtotal, total, amount_paid: paid, balance_due: balance, status: nextStatus })
    .eq("id", invoiceId)
    .eq("tenant_id", tenantId);
  if (error) throw error;
}

export function useCreateInvoice(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { customer_id: string; notes?: string | null; due_date?: string | null }) => {
      // Reserve invoice number via RPC
      const { data: num, error: numErr } = await supabase.rpc("next_invoice_number", { target_tenant_id: tenantId });
      if (numErr) throw numErr;
      const { data, error } = await supabase
        .from("invoices")
        .insert({
          tenant_id: tenantId,
          customer_id: input.customer_id,
          invoice_number: num as string,
          status: "draft",
          notes: input.notes ?? null,
          due_date: input.due_date ?? null,
        } as any)
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invoices"] }),
  });
}

export function useIssueInvoice(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, due_days }: { id: string; due_days: number }) => {
      const today = new Date();
      const due = new Date(today); due.setDate(due.getDate() + due_days);
      const iso = (d: Date) => d.toISOString().slice(0, 10);
      await recomputeInvoiceTotals(id, tenantId);
      const { error } = await supabase
        .from("invoices")
        .update({ status: "sent", issue_date: iso(today), due_date: iso(due) } as any)
        .eq("id", id).eq("tenant_id", tenantId);
      if (error) throw error;
      await recomputeInvoiceTotals(id, tenantId);
    },
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: ["invoice", tenantId, v.id] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}

export function useVoidInvoice(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("invoices").update({ status: "cancelled" } as any)
        .eq("id", id).eq("tenant_id", tenantId);
      if (error) throw error;
    },
    onSuccess: (_r, id) => {
      qc.invalidateQueries({ queryKey: ["invoice", tenantId, id] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}

export function useUpdateInvoice(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<InvoiceRow> }) => {
      const { error } = await supabase.from("invoices").update(patch as any).eq("id", id).eq("tenant_id", tenantId);
      if (error) throw error;
    },
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: ["invoice", tenantId, v.id] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}

export function useUpsertInvoiceItem(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      invoice_id: string;
      description: string;
      quantity: number;
      unit_price: number;
      booking_id?: string | null;
      sort_order?: number;
    }) => {
      const line_total = Number((input.quantity * input.unit_price).toFixed(2));
      if (input.id) {
        const { error } = await supabase.from("invoice_items")
          .update({
            description: input.description, quantity: input.quantity,
            unit_price: input.unit_price, line_total,
            booking_id: input.booking_id ?? null,
            sort_order: input.sort_order ?? 0,
          } as any)
          .eq("id", input.id).eq("tenant_id", tenantId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("invoice_items").insert({
          tenant_id: tenantId,
          invoice_id: input.invoice_id,
          description: input.description,
          quantity: input.quantity,
          unit_price: input.unit_price,
          line_total,
          booking_id: input.booking_id ?? null,
          sort_order: input.sort_order ?? 0,
        } as any);
        if (error) throw error;
      }
      await recomputeInvoiceTotals(input.invoice_id, tenantId);
    },
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: ["invoice", tenantId, v.invoice_id] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}

export function useDeleteInvoiceItem(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, invoice_id }: { id: string; invoice_id: string }) => {
      const { error } = await supabase.from("invoice_items").delete().eq("id", id).eq("tenant_id", tenantId);
      if (error) throw error;
      await recomputeInvoiceTotals(invoice_id, tenantId);
    },
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: ["invoice", tenantId, v.invoice_id] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}

export function useRecordPayment(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      invoice_id: string;
      customer_id: string;
      amount: number;
      payment_method: Database["public"]["Enums"]["payment_method"];
      payment_reference?: string | null;
      paid_at?: string | null;
      notes?: string | null;
    }) => {
      const { error } = await supabase.from("payments").insert({
        tenant_id: tenantId,
        invoice_id: input.invoice_id,
        customer_id: input.customer_id,
        amount: input.amount,
        payment_method: input.payment_method,
        payment_reference: input.payment_reference ?? null,
        paid_at: input.paid_at ?? new Date().toISOString(),
        notes: input.notes ?? null,
        status: "received",
      } as any);
      if (error) throw error;
      await recomputeInvoiceTotals(input.invoice_id, tenantId);
    },
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: ["invoice", tenantId, v.invoice_id] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
    },
  });
}

export function useAllPayments(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["payments", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("*, customer:customers(id, full_name), invoice:invoices(id, invoice_number)")
        .eq("tenant_id", tenantId as string)
        .order("paid_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });
}

// -------- Settings --------

export function useInvoicingSettings(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["invoicing_settings", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      const { data, error } = await supabase.from("invoicing_settings").select("*").eq("tenant_id", tenantId as string).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useUpdateInvoicingSettings(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<Database["public"]["Tables"]["invoicing_settings"]["Row"]>) => {
      const { error } = await supabase.from("invoicing_settings").upsert({ tenant_id: tenantId, ...patch } as any, { onConflict: "tenant_id" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invoicing_settings"] }),
  });
}

export function usePaymentMethods(tenantId: string | null | undefined, opts?: { activeOnly?: boolean }) {
  return useQuery({
    queryKey: ["payment_methods", tenantId, opts?.activeOnly ?? false],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      let q = supabase.from("payment_methods").select("*").eq("tenant_id", tenantId as string).order("sort_order", { ascending: true });
      if (opts?.activeOnly) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUpsertPaymentMethod(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id?: string; code: string; label: string; is_active: boolean; sort_order: number }) => {
      if (input.id) {
        const { error } = await supabase.from("payment_methods").update({
          label: input.label, is_active: input.is_active, sort_order: input.sort_order,
        } as any).eq("id", input.id).eq("tenant_id", tenantId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("payment_methods").insert({
          tenant_id: tenantId, code: input.code, label: input.label,
          is_active: input.is_active, sort_order: input.sort_order,
        } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payment_methods"] }),
  });
}

export function useDeletePaymentMethod(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("payment_methods").delete().eq("id", id).eq("tenant_id", tenantId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payment_methods"] }),
  });
}

// -------- Booking helpers --------

/** Un-invoiced completed bookings for a customer, for pre-fill on invoice create. */
export function useUninvoicedBookings(tenantId: string | null | undefined, customerId: string | null | undefined) {
  return useQuery({
    queryKey: ["uninvoiced_bookings", tenantId, customerId],
    enabled: Boolean(tenantId && customerId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("id, booking_number, service_type, start_at, status")
        .eq("tenant_id", tenantId as string)
        .eq("customer_id", customerId as string)
        .is("invoice_id", null)
        .in("status", ["completed", "confirmed"])
        .order("start_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useBookingInvoice(tenantId: string | null | undefined, bookingId: string | null | undefined) {
  return useQuery({
    queryKey: ["booking_invoice", tenantId, bookingId],
    enabled: Boolean(tenantId && bookingId),
    queryFn: async () => {
      const { data: b, error: bErr } = await supabase
        .from("bookings").select("invoice_id, status").eq("id", bookingId as string).maybeSingle();
      if (bErr) throw bErr;
      if (!b?.invoice_id) return { booking: b, invoice: null as any };
      const { data: inv, error } = await supabase.from("invoices")
        .select("id, invoice_number, status, total, amount_paid, balance_due, issue_date, due_date")
        .eq("id", b.invoice_id).maybeSingle();
      if (error) throw error;
      return { booking: b, invoice: inv };
    },
  });
}

/** Attach a booking to an invoice: update bookings.invoice_id (idempotent). */
export function useLinkBookingToInvoice(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ booking_id, invoice_id }: { booking_id: string; invoice_id: string | null }) => {
      const { error } = await supabase.from("bookings").update({ invoice_id } as any)
        .eq("id", booking_id).eq("tenant_id", tenantId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["booking_invoice"] });
      qc.invalidateQueries({ queryKey: ["uninvoiced_bookings"] });
    },
  });
}