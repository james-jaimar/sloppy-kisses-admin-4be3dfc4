import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

export type CreditEntryType =
  | "overpayment"
  | "manual_adjustment"
  | "credit_note_unapplied"
  | "allocation"
  | "refund_out";

export interface CreditLedgerRow {
  id: string;
  tenant_id: string;
  customer_id: string;
  entry_date: string;
  entry_type: CreditEntryType;
  amount: number;
  currency: string;
  source_payment_id: string | null;
  source_invoice_id: string | null;
  source_credit_note_id: string | null;
  source_refund_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export function useCustomerCreditLedger(tenantId: string | null, customerId: string | null) {
  return useQuery({
    queryKey: ["customer_credit_ledger", tenantId, customerId],
    enabled: Boolean(tenantId && customerId),
    queryFn: async (): Promise<CreditLedgerRow[]> => {
      const { data, error } = await (supabase as any)
        .from("customer_credit_ledger")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("customer_id", customerId)
        .order("entry_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CreditLedgerRow[];
    },
  });
}

export function useCustomerCreditBalance(tenantId: string | null, customerId: string | null) {
  return useQuery({
    queryKey: ["customer_credit_balance", tenantId, customerId],
    enabled: Boolean(tenantId && customerId),
    queryFn: async (): Promise<number> => {
      const { data, error } = await (supabase as any)
        .from("customer_credit_balances")
        .select("balance")
        .eq("tenant_id", tenantId)
        .eq("customer_id", customerId)
        .maybeSingle();
      if (error) throw error;
      return Number((data as any)?.balance ?? 0);
    },
  });
}

export function useAllocateCustomerCredit(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      customer_id: string;
      invoice_id: string;
      amount: number;
      notes?: string | null;
    }) => {
      const { data, error } = await (supabase as any).rpc("allocate_customer_credit", {
        p_customer_id: input.customer_id,
        p_invoice_id: input.invoice_id,
        p_amount: input.amount,
        p_notes: input.notes ?? null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer_credit_ledger"] });
      qc.invalidateQueries({ queryKey: ["customer_credit_balance"] });
      qc.invalidateQueries({ queryKey: ["invoice"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["customer_aging"] });
    },
  });
}

export function useParkCustomerCredit(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      customer_id: string;
      amount: number;
      payment_id?: string | null;
      entry_date?: string | null;
      notes?: string | null;
    }) => {
      const { data, error } = await (supabase as any).rpc("park_customer_credit", {
        p_customer_id: input.customer_id,
        p_amount: input.amount,
        p_source_payment_id: input.payment_id ?? null,
        p_entry_date: input.entry_date ?? null,
        p_notes: input.notes ?? null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer_credit_ledger"] });
      qc.invalidateQueries({ queryKey: ["customer_credit_balance"] });
      qc.invalidateQueries({ queryKey: ["customer_aging"] });
    },
  });
}

export function useAdjustCustomerCredit(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { customer_id: string; amount: number; notes: string }) => {
      const { data, error } = await (supabase as any).rpc("adjust_customer_credit", {
        p_customer_id: input.customer_id,
        p_amount: input.amount,
        p_notes: input.notes,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer_credit_ledger"] });
      qc.invalidateQueries({ queryKey: ["customer_credit_balance"] });
      qc.invalidateQueries({ queryKey: ["customer_aging"] });
    },
  });
}

// -------- Reports --------

export interface AgingRow {
  tenant_id: string;
  customer_id: string;
  customer_name: string | null;
  customer_number: string | null;
  customer_email: string | null;
  current_bucket: number;
  days_1_30: number;
  days_31_60: number;
  days_61_90: number;
  days_over_90: number;
  total_due: number;
  credit_balance: number;
  net_due: number;
}

export function useAgingReport(tenantId: string | null) {
  return useQuery({
    queryKey: ["customer_aging", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<AgingRow[]> => {
      const { data, error } = await (supabase as any)
        .from("customer_aging")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("total_due", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        ...r,
        current_bucket: Number(r.current_bucket ?? 0),
        days_1_30: Number(r.days_1_30 ?? 0),
        days_31_60: Number(r.days_31_60 ?? 0),
        days_61_90: Number(r.days_61_90 ?? 0),
        days_over_90: Number(r.days_over_90 ?? 0),
        total_due: Number(r.total_due ?? 0),
        credit_balance: Number(r.credit_balance ?? 0),
        net_due: Number(r.net_due ?? 0),
      })) as AgingRow[];
    },
  });
}