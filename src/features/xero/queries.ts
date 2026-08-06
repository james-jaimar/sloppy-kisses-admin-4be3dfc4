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
    mutationFn: async () => {
      let processed = 0;
      let done = 0;
      let failed = 0;
      while (true) {
        const res = await invoke({ action: "run_queue", tenant_id: tenantId, limit: 5 });
        processed += res?.processed ?? 0;
        done += res?.done ?? 0;
        failed += res?.failed ?? 0;
        if ((res?.processed ?? 0) < 5 || (res?.done ?? 0) === 0) break;
      }
      return { processed, done, failed };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["xero_log", tenantId] });
      qc.invalidateQueries({ queryKey: ["xero_queue", tenantId] });
    },
  });
}

export type XeroTaxRate = { name: string; taxType: string; rate: number };

export function useXeroTaxRates(tenantId: string | null) {
  return useMutation({
    mutationFn: async () => {
      const res = await invoke({ action: "tax_rates", tenant_id: tenantId });
      return (res?.rates ?? []) as XeroTaxRate[];
    },
  });
}

export function useXeroPushItemCodes(tenantId: string | null) {
  return useMutation({
    mutationFn: async () => await invoke({ action: "push_item_codes", tenant_id: tenantId }),
  });
}

export type XeroBankAccount = { code: string; name: string; type: string };

export function useXeroBankAccounts(tenantId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["xero-bank-accounts", tenantId],
    enabled: !!tenantId && enabled,
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      const res = await invoke({ action: "bank_accounts", tenant_id: tenantId });
      return (res?.accounts ?? []) as XeroBankAccount[];
    },
  });
}

export type XeroAccount = {
  code: string;
  name: string;
  type: string;
  accountClass: string;
  paymentsEnabled: boolean;
};

export function useXeroAccounts(tenantId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["xero-accounts", tenantId],
    enabled: !!tenantId && enabled,
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      const res = await invoke({ action: "accounts", tenant_id: tenantId });
      return (res?.accounts ?? []) as XeroAccount[];
    },
  });
}

export type XeroStagedContact = {
  id: string;
  xero_contact_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  account_number: string | null;
  matched_customer_id: string | null;
  match_type: string | null;
  match_state: "unmatched" | "suggested" | "review" | "linked" | "ignored";
};

export function useXeroStagedContacts(tenantId: string | null, state: string, search: string) {
  return useQuery({
    queryKey: ["xero_contacts", tenantId, state, search],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<XeroStagedContact[]> => {
      let q = (supabase as any).from("xero_contacts_staging")
        .select("*").eq("tenant_id", tenantId).order("name", { ascending: true }).limit(300);
      if (state !== "all") q = q.eq("match_state", state);
      if (search.trim()) q = q.or(`name.ilike.%${search.trim()}%,email.ilike.%${search.trim()}%,account_number.ilike.%${search.trim()}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as XeroStagedContact[];
    },
  });
}

export function useXeroContactCounts(tenantId: string | null) {
  return useQuery({
    queryKey: ["xero_contact_counts", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      const states = ["unmatched", "suggested", "review", "linked", "ignored"] as const;
      const out: Record<string, number> = {};
      await Promise.all(states.map(async (st) => {
        const { count } = await (supabase as any).from("xero_contacts_staging")
          .select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("match_state", st);
        out[st] = count ?? 0;
      }));
      return out;
    },
  });
}

export function useXeroPullContacts(tenantId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    // The edge worker only handles a few Xero pages per call (memory limits),
    // so loop here until it reports there is nothing left.
    mutationFn: async (onProgress?: (msg: string) => void) => {
      let page: number | null = 1;
      let pulled = 0;
      while (page) {
        const res: any = await invoke({ action: "pull_contacts", tenant_id: tenantId, page });
        pulled += res.pulled ?? 0;
        page = res.next_page ?? null;
        onProgress?.(`${pulled} contacts pulled…`);
      }
      let cursor: string | null = null;
      let matched = 0;
      do {
        const res: any = await invoke({ action: "match_contacts", tenant_id: tenantId, cursor });
        matched += res.matched ?? 0;
        cursor = res.next_cursor ?? null;
        onProgress?.(`${pulled} pulled · ${matched} matched…`);
      } while (cursor);
      return { pulled, matched };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["xero_contacts", tenantId] });
      qc.invalidateQueries({ queryKey: ["xero_contact_counts", tenantId] });
    },
  });
}

export function useXeroLinkContacts(tenantId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    // The worker only links 50 per call (150s idle timeout), so chunk here.
    mutationFn: async (stagingIds: string[]) => {
      let linked = 0;
      for (let i = 0; i < stagingIds.length; i += 50) {
        const res: any = await invoke({
          action: "link_contacts", tenant_id: tenantId, staging_ids: stagingIds.slice(i, i + 50),
        });
        linked += res?.linked ?? 0;
      }
      return { linked };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["xero_contacts", tenantId] });
      qc.invalidateQueries({ queryKey: ["xero_contact_counts", tenantId] });
      qc.invalidateQueries({ queryKey: ["xero_backfill", tenantId] });
    },
  });
}

/** Manually point a staged Xero contact at a specific SK customer. */
export type XeroReconcileReport = {
  xero_contacts: number; matched_account_number: number; matched_email: number;
  matched_name: number; matched_phone: number; suggested: number; review: number;
  linked: number; ignored: number; xero_only: number;
  sk_customers: number; sk_linked: number; sk_only: number; sk_without_email: number;
};

/** Read-only three-way picture of Xero vs SK before anything is committed. */
export function useXeroReconcileReport(tenantId: string | null) {
  return useQuery({
    queryKey: ["xero_reconcile", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<XeroReconcileReport> =>
      await invoke({ action: "reconcile_report", tenant_id: tenantId }),
  });
}

/** Create SK customers from Xero-only contacts (chunked; pushes SK numbers back). */
export function useXeroImportContacts(tenantId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (stagingIds: string[]) => {
      let imported = 0, relinked = 0, skipped = 0;
      const errors: Array<{ id: string; error: string }> = [];
      for (let i = 0; i < stagingIds.length; i += 40) {
        const res: any = await invoke({
          action: "import_contacts", tenant_id: tenantId, staging_ids: stagingIds.slice(i, i + 40),
        });
        imported += res?.imported ?? 0;
        relinked += res?.relinked ?? 0;
        skipped += res?.skipped ?? 0;
        errors.push(...(res?.errors ?? []));
      }
      return { imported, relinked, skipped, errors };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["xero_contacts", tenantId] });
      qc.invalidateQueries({ queryKey: ["xero_contact_counts", tenantId] });
      qc.invalidateQueries({ queryKey: ["xero_reconcile", tenantId] });
      qc.invalidateQueries({ queryKey: ["customers"] });
    },
  });
}

/** Park contacts we never want to link or import. */
export function useXeroIgnoreContacts(tenantId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (stagingIds: string[]) => {
      let ignored = 0;
      for (let i = 0; i < stagingIds.length; i += 500) {
        const res: any = await invoke({
          action: "ignore_contacts", tenant_id: tenantId, staging_ids: stagingIds.slice(i, i + 500),
        });
        ignored += res?.ignored ?? 0;
      }
      return { ignored };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["xero_contacts", tenantId] });
      qc.invalidateQueries({ queryKey: ["xero_contact_counts", tenantId] });
      qc.invalidateQueries({ queryKey: ["xero_reconcile", tenantId] });
    },
  });
}

/** Danger zone: wipe all billing data and Xero links before going live. */
export function useXeroResetBilling(tenantId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc("xero_reset_billing_data", { target_tenant_id: tenantId });
      if (error) throw error;
      return data as Record<string, number>;
    },
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useSetContactMatch(tenantId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; customerId: string | null; state?: string }) => {
      const { error } = await (supabase as any).from("xero_contacts_staging")
        .update({
          matched_customer_id: input.customerId,
          match_type: input.customerId ? "manual" : null,
          match_state: input.state ?? (input.customerId ? "suggested" : "unmatched"),
        })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["xero_contacts", tenantId] });
      qc.invalidateQueries({ queryKey: ["xero_contact_counts", tenantId] });
    },
  });
}

export type BillingItemCode = {
  id: string;
  tenant_id: string;
  kind: string;
  ref_key: string;
  label: string;
  code: string;
  active: boolean;
};

export function useBillingItemCodes(tenantId: string | null) {
  return useQuery({
    queryKey: ["billing_item_codes", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<BillingItemCode[]> => {
      const { data, error } = await (supabase as any).from("billing_item_codes")
        .select("*").eq("tenant_id", tenantId).order("kind").order("label");
      if (error) throw error;
      return (data ?? []) as BillingItemCode[];
    },
  });
}

export function useSaveBillingItemCode(tenantId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Partial<BillingItemCode>) => {
      const { error } = await (supabase as any).from("billing_item_codes")
        .upsert({ tenant_id: tenantId, ...row }, { onConflict: "tenant_id,kind,ref_key" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["billing_item_codes", tenantId] }),
  });
}

export function useDeleteBillingItemCode(tenantId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("billing_item_codes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["billing_item_codes", tenantId] }),
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
      const [cust, linked, inv] = await Promise.all([
        (supabase as any).from("customers").select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId).is("xero_customer_id", null).neq("status", "archived"),
        (supabase as any).from("customers").select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId).not("xero_customer_id", "is", null).neq("status", "archived"),
        (supabase as any).from("invoices").select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId).is("xero_invoice_id", null)
          .in("status", ["issued", "sent", "part_paid", "paid", "overdue"])
          .gte("issue_date", fromDate),
      ]);
      return {
        customers: cust.count ?? 0,
        linkedCustomers: linked.count ?? 0,
        invoices: inv.count ?? 0,
      };
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
