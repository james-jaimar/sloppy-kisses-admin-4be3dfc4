import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Ban, CheckCircle2, DownloadCloud, Link2, Loader2, Search, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant, useCurrentUser } from "@/lib/tenant/TenantContext";
import { supabase } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";
import {
  useXeroContactCounts, useXeroLinkContacts, useXeroPullContacts, useXeroStagedContacts, useSetContactMatch,
  useXeroImportContacts, useXeroIgnoreContacts, useXeroReconcileReport,
} from "./queries";

const STATES: { key: string; label: string; hint: string }[] = [
  { key: "suggested", label: "Ready to link", hint: "Matched on account number or email." },
  { key: "review", label: "Needs a look", hint: "Matched on name or phone only — check before linking." },
  { key: "unmatched", label: "Xero only", hint: "In Xero but not in Sloppy Kisses — import them as new customers, or ignore them." },
  { key: "linked", label: "Linked", hint: "Already connected to an SK customer." },
  { key: "ignored", label: "Ignored", hint: "Parked — these will not be linked or imported." },
  { key: "all", label: "All", hint: "" },
];

function useCustomerLookup(tenantId: string | null, ids: string[]) {
  const key = ids.slice().sort().join(",");
  return useQuery({
    queryKey: ["xero_match_customers", tenantId, key],
    enabled: Boolean(tenantId) && ids.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("customers")
        .select("id, customer_number, full_name, email").in("id", ids);
      if (error) throw error;
      const map: Record<string, any> = {};
      for (const c of data ?? []) map[c.id] = c;
      return map;
    },
  });
}

export default function XeroCustomersPage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const { hasPermission, profile } = useCurrentUser();
  const canManage = profile?.user_type === "platform" || hasPermission("settings.xero.manage");

  const [state, setState] = useState("suggested");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const counts = useXeroContactCounts(tenantId);
  const listQ = useXeroStagedContacts(tenantId, state, search);
  const pull = useXeroPullContacts(tenantId);
  const link = useXeroLinkContacts(tenantId);
  const setMatch = useSetContactMatch(tenantId);
  const importContacts = useXeroImportContacts(tenantId);
  const ignoreContacts = useXeroIgnoreContacts(tenantId);
  const report = useXeroReconcileReport(tenantId);

  const rows = listQ.data ?? [];
  const matchedIds = useMemo(
    () => Array.from(new Set(rows.map((r) => r.matched_customer_id).filter(Boolean) as string[])),
    [rows],
  );
  const customers = useCustomerLookup(tenantId, matchedIds);

  const selectedIds = Object.keys(selected).filter((k) => selected[k]);

  async function onPull() {
    try {
      const r = await pull.mutateAsync(undefined);
      toast.success(`${r.pulled} Xero contacts pulled · ${r.matched} matched automatically`);
    } catch (e: any) { toast.error(e?.message ?? "Could not pull contacts from Xero"); }
  }

  async function onLink(ids: string[]) {
    if (!ids.length) return;
    try {
      const r = await link.mutateAsync(ids);
      setSelected({});
      counts.refetch();
      toast.success(`${r.linked} customers linked to Xero`);
    } catch (e: any) { toast.error(e?.message ?? "Linking failed"); }
  }

  async function onImport(ids: string[]) {
    if (!ids.length) return;
    try {
      const r = await importContacts.mutateAsync(ids);
      setSelected({});
      counts.refetch();
      toast.success(
        `${r.imported} new customers created · ${r.relinked} matched to existing${r.skipped ? ` · ${r.skipped} skipped` : ""}`,
      );
      if (r.errors.length) toast.error(`${r.errors.length} failed — check the sync log`);
    } catch (e: any) { toast.error(e?.message ?? "Import failed"); }
  }

  async function onIgnore(ids: string[]) {
    if (!ids.length) return;
    try {
      const r = await ignoreContacts.mutateAsync(ids);
      setSelected({});
      counts.refetch();
      toast.success(`${r.ignored} contacts ignored`);
    } catch (e: any) { toast.error(e?.message ?? "Could not ignore those contacts"); }
  }

  return (
    <>
      <AppHeader
        title="Xero customers"
        subtitle="Match the contacts already in Xero to Sloppy Kisses customers so nothing gets duplicated."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={onPull} disabled={!canManage || pull.isPending}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-sk-coral px-3 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-50">
              {pull.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <DownloadCloud className="h-4 w-4" />}
              Pull contacts from Xero
            </button>
            <Link to="/admin/settings/xero" className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-white px-3 text-sm font-medium hover:bg-muted">
              <ArrowLeft className="h-4 w-4" /> Xero settings
            </Link>
          </div>
        }
      />

      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <div className="sk-card p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">Reconciliation</h2>
              <p className="text-xs text-muted-foreground">Where the two systems agree — and where they don't. Nothing is changed by this view.</p>
            </div>
            <button onClick={() => report.refetch()} className="rounded-lg border border-border px-2 py-1 text-xs font-medium hover:bg-muted">
              Refresh
            </button>
          </div>
          {report.isLoading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Working it out…
            </div>
          ) : report.error ? (
            <p className="mt-3 text-xs text-destructive">{(report.error as Error).message}</p>
          ) : report.data ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: "Contacts in Xero", value: report.data.xero_contacts, hint: `${report.data.linked} linked · ${report.data.ignored} ignored` },
                { label: "SK customers", value: report.data.sk_customers, hint: `${report.data.sk_linked} linked to Xero` },
                { label: "In Xero only", value: report.data.xero_only, hint: "Import as new SK customers" },
                { label: "In SK only", value: report.data.sk_only, hint: `${report.data.sk_without_email} have no email` },
                { label: "Matched on account no.", value: report.data.matched_account_number, hint: "Strongest match" },
                { label: "Matched on email", value: report.data.matched_email, hint: "Safe to link" },
                { label: "Matched on name", value: report.data.matched_name, hint: "Check before linking" },
                { label: "Matched on phone", value: report.data.matched_phone, hint: "Check before linking" },
              ].map((c) => (
                <div key={c.label} className="rounded-xl border border-border bg-sk-surface-muted p-3">
                  <div className="text-xs text-muted-foreground">{c.label}</div>
                  <div className="text-xl font-semibold">{c.value.toLocaleString()}</div>
                  <div className="text-[11px] text-muted-foreground">{c.hint}</div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="sk-card p-4">
          <div className="flex flex-wrap gap-2">
            {STATES.map((s) => (
              <button key={s.key} onClick={() => { setState(s.key); setSelected({}); }}
                className={`rounded-full px-3 py-1.5 text-sm font-medium ${state === s.key ? "bg-sk-coral text-white" : "border border-border bg-white hover:bg-muted"}`}>
                {s.label}
                {s.key !== "all" && <span className="ml-1.5 opacity-70">{counts.data?.[s.key] ?? 0}</span>}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{STATES.find((s) => s.key === state)?.hint}</p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[14rem]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, email or account number"
                className="h-10 w-full rounded-xl border border-border bg-white pl-9 pr-3 text-sm" />
            </div>
            <button onClick={() => onLink(selectedIds)} disabled={!canManage || !selectedIds.length || link.isPending}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-white px-3 text-sm font-semibold disabled:opacity-50">
              {link.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              Link selected ({selectedIds.length})
            </button>
            <button onClick={() => onIgnore(selectedIds)} disabled={!canManage || !selectedIds.length || ignoreContacts.isPending}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-white px-3 text-sm font-medium text-muted-foreground disabled:opacity-50">
              {ignoreContacts.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
              Ignore
            </button>
            {state === "unmatched" && (
              <button onClick={() => onImport(selectedIds.length ? selectedIds : rows.map((r) => r.id))}
                disabled={!canManage || !rows.length || importContacts.isPending}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-sk-coral px-3 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-50">
                {importContacts.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                Import {selectedIds.length ? `selected (${selectedIds.length})` : "all shown"} as customers
              </button>
            )}
            {state === "suggested" && (
              <button onClick={() => onLink(rows.filter((r) => r.matched_customer_id).map((r) => r.id))}
                disabled={!canManage || !rows.length || link.isPending}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-sk-coral px-3 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-50">
                <CheckCircle2 className="h-4 w-4" /> Link all shown
              </button>
            )}
          </div>
        </div>

        <div className="sk-card overflow-hidden">
          {listQ.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : !rows.length ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Nothing here. Pull contacts from Xero to get started.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[46rem] text-sm">
                <thead className="bg-sk-surface-muted text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="w-10 p-3"></th>
                    <th className="p-3 text-left">Xero contact</th>
                    <th className="p-3 text-left">Account no.</th>
                    <th className="p-3 text-left">Matched SK customer</th>
                    <th className="p-3 text-left">Matched on</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const c = r.matched_customer_id ? customers.data?.[r.matched_customer_id] : null;
                    return (
                      <tr key={r.id} className="border-t border-border">
                        <td className="p-3">
                          <input type="checkbox" checked={!!selected[r.id]} disabled={r.match_state === "linked"}
                            onChange={(e) => setSelected({ ...selected, [r.id]: e.target.checked })} />
                        </td>
                        <td className="p-3">
                          <div className="font-medium">{r.name ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">{r.email ?? r.phone ?? "no contact details"}</div>
                        </td>
                        <td className="p-3 text-xs">{r.account_number ?? "—"}</td>
                        <td className="p-3">
                          {c ? (
                            <>
                              <div className="font-medium">{c.full_name}</div>
                              <div className="text-xs text-muted-foreground">{c.customer_number} · {c.email ?? "no email"}</div>
                            </>
                          ) : <span className="text-xs text-muted-foreground">No match</span>}
                        </td>
                        <td className="p-3 text-xs capitalize">{r.match_type?.replace("_", " ") ?? "—"}</td>
                        <td className="p-3 text-right">
                          {r.match_state === "linked" ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                              <CheckCircle2 className="h-4 w-4" /> Linked
                            </span>
                          ) : (
                            <div className="flex justify-end gap-2">
                              {r.matched_customer_id && (
                                <button onClick={() => onLink([r.id])} disabled={!canManage}
                                  className="rounded-lg border border-border px-2 py-1 text-xs font-semibold hover:bg-muted disabled:opacity-50">
                                  Link
                                </button>
                              )}
                              {r.matched_customer_id && (
                                <button onClick={() => setMatch.mutate({ id: r.id, customerId: null })} disabled={!canManage}
                                  className="rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-50">
                                  Clear
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}