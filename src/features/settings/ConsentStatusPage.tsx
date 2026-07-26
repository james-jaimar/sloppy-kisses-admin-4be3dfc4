import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Search, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { supabase } from "@/lib/supabase/client";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";

type CustomerRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
  consent_prompted_at: string | null;
  portal_access_enabled: boolean | null;
};

type Bucket = "complete" | "grace" | "overdue" | "not_prompted";

function daysBetween(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export default function ConsentStatusPage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const [search, setSearch] = useState("");
  const [bucketFilter, setBucketFilter] = useState<Bucket | "all">("all");

  const policy = useQuery({
    queryKey: ["policy_settings_grace", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("policy_settings")
        .select("consent_grace_days")
        .eq("tenant_id", tenantId!)
        .maybeSingle();
      return Number((data as any)?.consent_grace_days ?? 30);
    },
  });
  const graceDays = policy.data ?? 30;

  const customers = useQuery({
    queryKey: ["consent_status_customers", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, first_name, last_name, full_name, email, consent_prompted_at, portal_access_enabled")
        .eq("tenant_id", tenantId!)
        .eq("portal_access_enabled", true)
        .order("full_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CustomerRow[];
    },
  });

  const versions = useQuery({
    queryKey: ["consent_current_versions", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_terms_versions")
        .select("id")
        .eq("tenant_id", tenantId!)
        .eq("is_current", true);
      if (error) throw error;
      return (data ?? []).map((r: { id: string }) => r.id);
    },
  });

  const consents = useQuery({
    queryKey: ["consents_all", tenantId, versions.data?.join(",")],
    enabled: !!tenantId && !!versions.data && versions.data.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_consents")
        .select("customer_id, version_id")
        .eq("tenant_id", tenantId!)
        .in("version_id", versions.data!);
      if (error) throw error;
      const map = new Map<string, Set<string>>();
      (data ?? []).forEach((r: any) => {
        if (!map.has(r.customer_id)) map.set(r.customer_id, new Set());
        map.get(r.customer_id)!.add(r.version_id);
      });
      return map;
    },
  });

  const rows = useMemo(() => {
    const list = customers.data ?? [];
    const versionCount = versions.data?.length ?? 0;
    return list.map((c) => {
      const accepted = consents.data?.get(c.id)?.size ?? 0;
      const complete = versionCount > 0 && accepted >= versionCount;
      const elapsed = daysBetween(c.consent_prompted_at);
      let bucket: Bucket;
      if (complete) bucket = "complete";
      else if (!c.consent_prompted_at) bucket = "not_prompted";
      else if ((elapsed ?? 0) < graceDays) bucket = "grace";
      else bucket = "overdue";
      const remaining = c.consent_prompted_at ? graceDays - (elapsed ?? 0) : graceDays;
      return { ...c, bucket, accepted, versionCount, remaining };
    });
  }, [customers.data, consents.data, versions.data, graceDays]);

  const counts = useMemo(() => {
    const c = { complete: 0, grace: 0, overdue: 0, not_prompted: 0 };
    rows.forEach((r) => (c[r.bucket] += 1));
    return c;
  }, [rows]);

  const filtered = rows.filter((r) => {
    if (bucketFilter !== "all" && r.bucket !== bucketFilter) return false;
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (r.full_name ?? "").toLowerCase().includes(q) || (r.email ?? "").toLowerCase().includes(q);
  });

  const chip = (b: Bucket) => {
    const map: Record<Bucket, { label: string; cls: string; icon: any }> = {
      complete: { label: "Complete", cls: "bg-sk-green-soft text-sk-green", icon: CheckCircle2 },
      grace: { label: "In grace", cls: "bg-sk-turquoise-soft text-sk-turquoise-dark", icon: Clock },
      overdue: { label: "Overdue", cls: "bg-sk-coral-soft text-sk-coral-dark", icon: AlertTriangle },
      not_prompted: { label: "Not started", cls: "bg-muted text-muted-foreground", icon: Clock },
    };
    const M = map[b];
    return (
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${M.cls}`}>
        <M.icon className="h-3 w-3" /> {M.label}
      </span>
    );
  };

  const isLoading = customers.isLoading || versions.isLoading || consents.isLoading;

  return (
    <>
      <AppHeader title="Registration status" subtitle={`Grace period: ${graceDays} days (Settings → Policies)`} />
      <div className="flex-1 space-y-4 p-4 md:p-6">
        <div className="grid gap-3 sm:grid-cols-4">
          {(
            [
              { b: "complete", label: "Complete" },
              { b: "grace", label: "In grace" },
              { b: "overdue", label: "Overdue" },
              { b: "not_prompted", label: "Not started" },
            ] as const
          ).map((x) => (
            <button
              key={x.b}
              onClick={() => setBucketFilter((prev) => (prev === x.b ? "all" : x.b))}
              className={`sk-card p-4 text-left transition-colors ${bucketFilter === x.b ? "ring-2 ring-sk-coral/60" : ""}`}
            >
              <div className="sk-stat-label">{x.label}</div>
              <div className="sk-stat-value mt-1">{counts[x.b]}</div>
            </button>
          ))}
        </div>

        <div className="sk-card">
          <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or email…"
                className="h-9 w-full rounded-md border border-border pl-9 pr-3 text-sm"
              />
            </div>
            <div className="text-xs text-muted-foreground">
              {filtered.length} customer{filtered.length === 1 ? "" : "s"}
              {bucketFilter !== "all" && ` · filter: ${bucketFilter}`}
            </div>
          </div>

          {isLoading ? (
            <div className="p-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">No customers match.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-sk-surface-muted text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left">Customer</th>
                    <th className="px-4 py-2 text-left">Email</th>
                    <th className="px-4 py-2 text-left">Status</th>
                    <th className="px-4 py-2 text-left">Signed</th>
                    <th className="px-4 py-2 text-left">Grace left</th>
                    <th className="px-4 py-2 text-left">First prompted</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((r) => (
                    <tr key={r.id} className="hover:bg-sk-surface-muted">
                      <td className="px-4 py-2">
                        <Link className="font-medium text-sk-coral-dark hover:underline" to={`/admin/customers/${r.id}`}>
                          {r.full_name || `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() || "—"}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">{r.email ?? "—"}</td>
                      <td className="px-4 py-2">{chip(r.bucket)}</td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">{r.accepted} / {r.versionCount}</td>
                      <td className="px-4 py-2 text-xs">
                        {r.bucket === "complete" ? "—"
                          : r.bucket === "grace" ? `${r.remaining} day${r.remaining === 1 ? "" : "s"}`
                          : r.bucket === "overdue" ? <span className="text-sk-coral-dark">expired</span>
                          : `${graceDays} days (when prompted)`}
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">
                        {r.consent_prompted_at ? new Date(r.consent_prompted_at).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}