import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type PaymentRefund = {
  id: string;
  tenant_id: string;
  payment_id: string | null;
  invoice_id: string | null;
  credit_note_id: string | null;
  customer_id: string | null;
  amount: number;
  currency: string;
  refund_date: string;
  method: string | null;
  reference: string | null;
  status: "pending" | "processing" | "succeeded" | "failed" | "cancelled";
  notes: string | null;
  provider: string;
  provider_refund_id: string | null;
  provider_status: string | null;
  provider_error: string | null;
  created_at: string;
  updated_at: string;
};

export function useRefundsForInvoice(tenantId: string | null, invoiceId: string | null) {
  return useQuery({
    queryKey: ["refunds", "invoice", tenantId, invoiceId],
    enabled: Boolean(tenantId && invoiceId),
    queryFn: async (): Promise<PaymentRefund[]> => {
      const { data, error } = await (supabase as any)
        .from("payment_refunds")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("invoice_id", invoiceId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PaymentRefund[];
    },
  });
}

export function useRefundsForCreditNote(tenantId: string | null, creditNoteId: string | null) {
  return useQuery({
    queryKey: ["refunds", "credit_note", tenantId, creditNoteId],
    enabled: Boolean(tenantId && creditNoteId),
    queryFn: async (): Promise<PaymentRefund[]> => {
      const { data, error } = await (supabase as any)
        .from("payment_refunds")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("credit_note_id", creditNoteId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PaymentRefund[];
    },
  });
}

export function useRecordManualRefund(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      payment_id: string;
      amount: number;
      method?: Database["public"]["Enums"]["payment_method"] | null;
      reference?: string | null;
      credit_note_id?: string | null;
      notes?: string | null;
      refund_date?: string | null;
    }) => {
      const { data, error } = await (supabase as any).rpc("record_manual_refund", {
        p_payment_id: input.payment_id,
        p_amount: input.amount,
        p_method: input.method ?? null,
        p_reference: input.reference ?? null,
        p_credit_note_id: input.credit_note_id ?? null,
        p_notes: input.notes ?? null,
        p_refund_date: input.refund_date ?? null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["refunds"] });
      qc.invalidateQueries({ queryKey: ["invoice"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["credit_note"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
    },
  });
}

export function useVoidRefund(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (refund_id: string) => {
      const { error } = await (supabase as any).rpc("void_refund", { p_refund_id: refund_id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["refunds"] });
      qc.invalidateQueries({ queryKey: ["invoice"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["credit_note"] });
    },
  });
}

// -------- Payment providers (settings) --------

export type PaymentProviderRow = {
  id: string;
  tenant_id: string;
  provider: string;
  enabled: boolean;
  mode: "test" | "live";
  settings: Record<string, any>;
  webhook_secret_ref: string | null;
  updated_at: string;
};

export function usePaymentProviders(tenantId: string | null) {
  return useQuery({
    queryKey: ["payment_providers", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<PaymentProviderRow[]> => {
      const { data, error } = await (supabase as any)
        .from("payment_providers")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("provider");
      if (error) throw error;
      return (data ?? []) as PaymentProviderRow[];
    },
  });
}

export function useUpsertPaymentProvider(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<PaymentProviderRow> & { provider: string }) => {
      const { error } = await (supabase as any)
        .from("payment_providers")
        .upsert({ tenant_id: tenantId, ...input } as any, { onConflict: "tenant_id,provider" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payment_providers"] }),
  });
}