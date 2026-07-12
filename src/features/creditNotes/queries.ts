import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

// Types not yet regenerated in supabase/types.ts — use local shapes.
export type CreditNoteStatus = "draft" | "issued" | "applied" | "cancelled";

export interface CreditNoteRow {
  id: string;
  tenant_id: string;
  credit_note_number: string;
  customer_id: string;
  invoice_id: string | null;
  status: CreditNoteStatus;
  issue_date: string | null;
  subtotal: number;
  total: number;
  amount_applied: number;
  balance: number;
  reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreditNoteItemRow {
  id: string;
  tenant_id: string;
  credit_note_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  sort_order: number;
  created_at: string;
}

export interface CreditNoteApplicationRow {
  id: string;
  tenant_id: string;
  credit_note_id: string;
  invoice_id: string;
  amount: number;
  applied_at: string;
  applied_by: string | null;
  created_at: string;
}

export interface CreditNoteListItem extends CreditNoteRow {
  customer: { id: string; full_name: string | null; customer_number: string | null } | null;
  invoice: { id: string; invoice_number: string } | null;
}

export interface CreditNoteDetail extends CreditNoteRow {
  customer: { id: string; full_name: string | null; email: string | null; mobile: string | null; customer_number: string | null } | null;
  invoice: { id: string; invoice_number: string; total: number; balance_due: number; status: string } | null;
  items: CreditNoteItemRow[];
  applications: (CreditNoteApplicationRow & { invoice: { id: string; invoice_number: string } | null })[];
}

const db = () => supabase as any;

export function useCreditNotes(tenantId: string | null | undefined, opts?: { customerId?: string; status?: CreditNoteStatus }) {
  return useQuery({
    queryKey: ["credit_notes", tenantId, opts],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<CreditNoteListItem[]> => {
      let q = db()
        .from("credit_notes")
        .select("*, customer:customers(id, full_name, customer_number), invoice:invoices(id, invoice_number)")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });
      if (opts?.customerId) q = q.eq("customer_id", opts.customerId);
      if (opts?.status) q = q.eq("status", opts.status);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as CreditNoteListItem[];
    },
  });
}

export function useCreditNote(id: string | undefined, tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["credit_note", tenantId, id],
    enabled: Boolean(id && tenantId),
    queryFn: async (): Promise<CreditNoteDetail | null> => {
      const cnP = db().from("credit_notes")
        .select("*, customer:customers(id, full_name, email, mobile, customer_number), invoice:invoices(id, invoice_number, total, balance_due, status)")
        .eq("id", id).eq("tenant_id", tenantId).maybeSingle();
      const itemsP = db().from("credit_note_items")
        .select("*").eq("credit_note_id", id).eq("tenant_id", tenantId)
        .order("sort_order").order("created_at");
      const appsP = db().from("credit_note_applications")
        .select("*, invoice:invoices(id, invoice_number)")
        .eq("credit_note_id", id).eq("tenant_id", tenantId)
        .order("applied_at", { ascending: false });
      const [cnR, itemsR, appsR] = await Promise.all([cnP, itemsP, appsP]);
      if (cnR.error) throw cnR.error;
      if (itemsR.error) throw itemsR.error;
      if (appsR.error) throw appsR.error;
      if (!cnR.data) return null;
      return { ...(cnR.data as any), items: itemsR.data ?? [], applications: appsR.data ?? [] };
    },
  });
}

/** All credit notes attached to an invoice, or applied to it. */
export function useCreditNotesForInvoice(tenantId: string | null | undefined, invoiceId: string | null | undefined) {
  return useQuery({
    queryKey: ["credit_notes_for_invoice", tenantId, invoiceId],
    enabled: Boolean(tenantId && invoiceId),
    queryFn: async () => {
      // CNs where invoice_id = this one
      const linkedP = db().from("credit_notes")
        .select("id, credit_note_number, status, total, amount_applied, balance, issue_date")
        .eq("tenant_id", tenantId).eq("invoice_id", invoiceId);
      // Applications to this invoice
      const appsP = db().from("credit_note_applications")
        .select("id, amount, applied_at, credit_note:credit_notes(id, credit_note_number, status)")
        .eq("tenant_id", tenantId).eq("invoice_id", invoiceId)
        .order("applied_at", { ascending: false });
      const [linkedR, appsR] = await Promise.all([linkedP, appsP]);
      if (linkedR.error) throw linkedR.error;
      if (appsR.error) throw appsR.error;
      const totalApplied = (appsR.data ?? []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
      return { linked: linkedR.data ?? [], applications: appsR.data ?? [], totalApplied };
    },
  });
}

/** Open (unpaid) invoices for a customer — used by Apply-to-invoice picker. */
export function useOpenInvoicesForCustomer(tenantId: string | null | undefined, customerId: string | null | undefined) {
  return useQuery({
    queryKey: ["open_invoices_for_customer", tenantId, customerId],
    enabled: Boolean(tenantId && customerId),
    queryFn: async () => {
      const { data, error } = await db().from("invoices")
        .select("id, invoice_number, total, balance_due, status, issue_date")
        .eq("tenant_id", tenantId).eq("customer_id", customerId)
        .not("status", "in", "(draft,cancelled)")
        .gt("balance_due", 0)
        .order("issue_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateCreditNote(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      customer_id: string;
      invoice_id?: string | null;
      reason?: string | null;
      notes?: string | null;
      items: { description: string; quantity: number; unit_price: number }[];
    }) => {
      const { data: num, error: numErr } = await db().rpc("next_credit_note_number", { target_tenant_id: tenantId });
      if (numErr) throw numErr;
      const { data: cn, error } = await db().from("credit_notes").insert({
        tenant_id: tenantId,
        credit_note_number: num,
        customer_id: input.customer_id,
        invoice_id: input.invoice_id ?? null,
        status: "draft",
        reason: input.reason ?? null,
        notes: input.notes ?? null,
      }).select("id").single();
      if (error) throw error;
      const cnId = cn.id as string;
      if (input.items.length > 0) {
        const rows = input.items.map((it, i) => ({
          tenant_id: tenantId,
          credit_note_id: cnId,
          description: it.description,
          quantity: it.quantity,
          unit_price: it.unit_price,
          sort_order: i,
        }));
        const { error: iErr } = await db().from("credit_note_items").insert(rows);
        if (iErr) throw iErr;
      }
      return cnId;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["credit_notes"] }),
  });
}

export function useUpsertCreditNoteItem(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      credit_note_id: string;
      description: string;
      quantity: number;
      unit_price: number;
      sort_order?: number;
    }) => {
      if (input.id) {
        const { error } = await db().from("credit_note_items").update({
          description: input.description,
          quantity: input.quantity,
          unit_price: input.unit_price,
          sort_order: input.sort_order ?? 0,
        }).eq("id", input.id).eq("tenant_id", tenantId);
        if (error) throw error;
      } else {
        const { error } = await db().from("credit_note_items").insert({
          tenant_id: tenantId,
          credit_note_id: input.credit_note_id,
          description: input.description,
          quantity: input.quantity,
          unit_price: input.unit_price,
          sort_order: input.sort_order ?? 0,
        });
        if (error) throw error;
      }
    },
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: ["credit_note", tenantId, v.credit_note_id] });
      qc.invalidateQueries({ queryKey: ["credit_notes"] });
    },
  });
}

export function useDeleteCreditNoteItem(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, credit_note_id }: { id: string; credit_note_id: string }) => {
      const { error } = await db().from("credit_note_items").delete().eq("id", id).eq("tenant_id", tenantId);
      if (error) throw error;
      return credit_note_id;
    },
    onSuccess: (credit_note_id) => {
      qc.invalidateQueries({ queryKey: ["credit_note", tenantId, credit_note_id] });
      qc.invalidateQueries({ queryKey: ["credit_notes"] });
    },
  });
}

export function useIssueCreditNote(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const today = new Date().toISOString().slice(0, 10);
      const { error } = await db().from("credit_notes")
        .update({ status: "issued", issue_date: today })
        .eq("id", id).eq("tenant_id", tenantId);
      if (error) throw error;
    },
    onSuccess: (_r, id) => {
      qc.invalidateQueries({ queryKey: ["credit_note", tenantId, id] });
      qc.invalidateQueries({ queryKey: ["credit_notes"] });
    },
  });
}

export function useVoidCreditNote(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db().from("credit_notes")
        .update({ status: "cancelled" })
        .eq("id", id).eq("tenant_id", tenantId);
      if (error) throw error;
    },
    onSuccess: (_r, id) => {
      qc.invalidateQueries({ queryKey: ["credit_note", tenantId, id] });
      qc.invalidateQueries({ queryKey: ["credit_notes"] });
    },
  });
}

export function useApplyCreditNote(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { credit_note_id: string; invoice_id: string; amount: number }) => {
      const { error } = await db().rpc("apply_credit_note", {
        p_credit_note_id: input.credit_note_id,
        p_invoice_id: input.invoice_id,
        p_amount: input.amount,
      });
      if (error) throw error;
    },
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: ["credit_note", tenantId, v.credit_note_id] });
      qc.invalidateQueries({ queryKey: ["credit_notes"] });
      qc.invalidateQueries({ queryKey: ["invoice", tenantId, v.invoice_id] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["credit_notes_for_invoice", tenantId, v.invoice_id] });
    },
  });
}

export function useReverseCreditNoteApplication(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, credit_note_id, invoice_id }: { id: string; credit_note_id: string; invoice_id: string }) => {
      const { error } = await db().from("credit_note_applications").delete()
        .eq("id", id).eq("tenant_id", tenantId);
      if (error) throw error;
      return { credit_note_id, invoice_id };
    },
    onSuccess: ({ credit_note_id, invoice_id }) => {
      qc.invalidateQueries({ queryKey: ["credit_note", tenantId, credit_note_id] });
      qc.invalidateQueries({ queryKey: ["credit_notes"] });
      qc.invalidateQueries({ queryKey: ["invoice", tenantId, invoice_id] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["credit_notes_for_invoice", tenantId, invoice_id] });
    },
  });
}