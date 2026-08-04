import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

export type XeroSettings = {
  id: string;
  tenant_id: string;
  enabled: boolean;
  auto_push: boolean;
  xero_tenant_id: string | null;
  xero_tenant_name: string | null;
  default_sales_account: string;
  service_account_codes: Record<string, string>;
  default_tax_type: string;
  zero_rated_tax_type: string;
  line_amount_type: string;
  payment_accounts: Record<string, string>;
  last_test_at: string | null;
  last_test_result: string | null;
};

export type XeroLogRow = {
  id: string;
  entity_type: string;
  entity_id: string | null;
  entity_label: string | null;
  action: string;
  status: "success" | "error" | "skipped";
  xero_id: string | null;
  error_message: string | null;
  created_at: string;
};

async function invoke(body: Record<string, unknown>) {
  const { data, error } = await (supabase as any).functions.invoke("xero-sync", { body });
  if (error) {
    let detail = error.message;
    try { detail = (await (error as any).context?.text?.()) ?? detail; } catch { /* ignore */ }
    try { const parsed = JSON.parse(detail); detail = parsed.error ?? detail; } catch { /* ignore */ }
    throw new Error(detail);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export function useXeroSettings(tenantId: string | null) {
  return useQuery({
    queryKey: ["xero_settings", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<XeroSettings | null> => {
      const { data, error } = await (supabase as any)
        .from("xero_settings").select("*").eq("tenant_id", tenantId).maybeSingle();
      if (error) throw error;
      return data as XeroSettings | null;
    },
  });
}

export function useSaveXeroSettings(tenantId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<XeroSettings>) => {
      const { data, error } = await (supabase as any)
        .from("xero_settings")
        .upsert({ tenant_id: tenantId, ...patch }, { onConflict: "tenant_id" })
        .select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["xero_settings", tenantId] }),
  });
}

export function useXeroOrganisations(tenantId: string | null) {
  return useMutation({
    mutationFn: async () => {
      const res = await invoke({ action: "connections", tenant_id: tenantId });
      return (res?.connections ?? []) as Array<{ tenantId: string; tenantName: string; tenantType: string }>;
    },
  });
}

export function useXeroTest(tenantId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => await invoke({ action: "test", tenant_id: tenantId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["xero_settings", tenantId] }),
  });
}

export function useXeroPush(tenantId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { entity_type: "customer" | "invoice" | "payment" | "credit_note"; entity_ids: string[] }) =>
      await invoke({ action: "push", tenant_id: tenantId, ...input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["xero_log", tenantId] });
      qc.invalidateQueries({ queryKey: ["xero_backfill", tenantId] });
      qc.invalidateQueries({ queryKey: ["invoice"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["customer"] });
    },
  });
}

export function useXeroRunQueue(tenantId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => await invoke({ action: "run_queue", tenant_id: tenantId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["xero_log", tenantId] });
      qc.invalidateQueries({ queryKey: ["xero_queue", tenantId] });
    },
  });
}

export function useXeroLog(tenantId: string | null, filter?: { status?: string; entityType?: string }) {
  return useQuery({
    queryKey: ["xero_log", tenantId, filter?.status, filter?.entityType],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<XeroLogRow[]> => {
      let q = (supabase as any).from("xero_sync_log").select("*")
        .eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(200);
      if (filter?.status) q = q.eq("status", filter.status);
      if (filter?.entityType) q = q.eq("entity_type", filter.entityType);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as XeroLogRow[];
    },
  });
}

export function useXeroQueue(tenantId: string | null) {
  return useQuery({
    queryKey: ["xero_queue", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("xero_sync_queue").select("*")
        .eq("tenant_id", tenantId).in("status", ["pending", "failed"])
        .order("created_at", { ascending: true }).limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Customers / invoices still waiting to go across, for the bulk backfill. */
export function useXeroBackfillCounts(tenantId: string | null, fromDate: string) {
  return useQuery({
    queryKey: ["xero_backfill", tenantId, fromDate],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      const [cust, inv] = await Promise.all([
        (supabase as any).from("customers").select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId).is("xero_customer_id", null).neq("status", "archived"),
        (supabase as any).from("invoices").select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId).is("xero_invoice_id", null)
          .in("status", ["issued", "sent", "part_paid", "paid", "overdue"])
          .gte("issue_date", fromDate),
      ]);
      return { customers: cust.count ?? 0, invoices: inv.count ?? 0 };
    },
  });
}

export async function fetchBackfillIds(tenantId: string, kind: "customers" | "invoices", fromDate: string) {
  if (kind === "customers") {
    const { data, error } = await (supabase as any).from("customers").select("id")
      .eq("tenant_id", tenantId).is("xero_customer_id", null).neq("status", "archived").limit(500);
    if (error) throw error;
    return (data ?? []).map((r: any) => r.id as string);
  }
  const { data, error } = await (supabase as any).from("invoices").select("id")
    .eq("tenant_id", tenantId).is("xero_invoice_id", null)
    .in("status", ["issued", "sent", "part_paid", "paid", "overdue"])
    .gte("issue_date", fromDate).order("issue_date", { ascending: true }).limit(500);
  if (error) throw error;
  return (data ?? []).map((r: any) => r.id as string);
}
