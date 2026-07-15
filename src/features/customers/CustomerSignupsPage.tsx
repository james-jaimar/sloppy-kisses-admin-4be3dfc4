import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Loader2, Inbox } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { supabase } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/tenant/TenantContext";
import { useHasPermission } from "@/lib/permissions/permissions";

type PendingCustomer = {
  id: string;
  tenant_id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  mobile: string | null;
  created_at: string;
};

export default function CustomerSignupsPage() {
  const { activeTenantId } = useCurrentUser();
  const canManage = useHasPermission("customers.portal.manage");
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["customer_signups_pending", activeTenantId],
    enabled: !!activeTenantId,
    queryFn: async (): Promise<PendingCustomer[]> => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, tenant_id, full_name, first_name, last_name, email, mobile, created_at")
        .eq("tenant_id", activeTenantId as string)
        .eq("signup_status", "pending_review")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PendingCustomer[];
    },
  });

  const decide = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "approve" | "reject" }) => {
      const patch = action === "approve"
        ? { signup_status: "active", portal_access_enabled: true }
        : { signup_status: "disabled", portal_access_enabled: false };
      const { error } = await supabase.from("customers").update(patch as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.action === "approve" ? "Customer approved" : "Signup rejected");
      qc.invalidateQueries({ queryKey: ["customer_signups_pending"] });
      qc.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  if (!canManage) {
    return (
      <>
        <AppHeader title="Customer signups" />
        <div className="p-6 text-sm text-muted-foreground">You need the "Manage customer portal access" permission to review signups.</div>
      </>
    );
  }

  const rows = q.data ?? [];

  return (
    <>
      <AppHeader title="Customer signups" subtitle={`${rows.length} awaiting review`} />
      <div className="flex-1 space-y-4 p-6">
        {q.isLoading ? (
          <div className="grid place-items-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <div className="sk-card grid place-items-center gap-2 p-10 text-center text-sm text-muted-foreground">
            <Inbox className="h-6 w-6 text-muted-foreground" />
            No pending signups. New customer self-signups will appear here for approval.
          </div>
        ) : (
          <div className="sk-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left">Customer</th>
                  <th className="px-4 py-2 text-left">Email</th>
                  <th className="px-4 py-2 text-left">Mobile</th>
                  <th className="px-4 py-2 text-left">Signed up</th>
                  <th className="px-4 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-t border-border">
                    <td className="px-4 py-2 font-medium">
                      <Link to={`/admin/customers/${c.id}`} className="hover:underline">
                        {c.full_name || `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{c.email ?? "—"}</td>
                    <td className="px-4 py-2 text-muted-foreground">{c.mobile ?? "—"}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{new Date(c.created_at).toLocaleString()}</td>
                    <td className="px-4 py-2">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => decide.mutate({ id: c.id, action: "approve" })}
                          disabled={decide.isPending}
                          className="inline-flex h-8 items-center gap-1 rounded-lg bg-sk-green px-3 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Reject and disable portal access for ${c.full_name ?? c.email}?`)) {
                              decide.mutate({ id: c.id, action: "reject" });
                            }
                          }}
                          disabled={decide.isPending}
                          className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
                        >
                          <XCircle className="h-3.5 w-3.5" /> Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}