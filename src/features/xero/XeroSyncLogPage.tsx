import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2, CheckCircle2, XCircle, MinusCircle } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import { useXeroLog } from "./queries";

const CHIP = {
  success: { icon: CheckCircle2, cls: "bg-sk-green/15 text-sk-green" },
  error: { icon: XCircle, cls: "bg-destructive/10 text-destructive" },
  skipped: { icon: MinusCircle, cls: "bg-muted text-muted-foreground" },
} as const;

export default function XeroSyncLogPage() {
  const { tenant } = useCurrentTenant();
  const [status, setStatus] = useState<string>("");
  const [entityType, setEntityType] = useState<string>("");
  const q = useXeroLog(tenant?.id ?? null, { status: status || undefined, entityType: entityType || undefined });

  return (
    <>
      <AppHeader
        title="Xero sync log"
        subtitle="Every push to Xero, with the exact error when one fails."
        actions={
          <Link to="/admin/settings/xero" className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-white px-3 text-sm font-medium hover:bg-muted">
            <ArrowLeft className="h-4 w-4" /> Xero settings
          </Link>
        }
      />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap gap-2">
          <select value={entityType} onChange={(e) => setEntityType(e.target.value)}
            className="h-10 rounded-xl border border-border bg-white px-3 text-sm">
            <option value="">All records</option>
            <option value="customer">Customers</option>
            <option value="invoice">Invoices</option>
            <option value="payment">Payments</option>
            <option value="credit_note">Credit notes</option>
            <option value="system">System</option>
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)}
            className="h-10 rounded-xl border border-border bg-white px-3 text-sm">
            <option value="">All outcomes</option>
            <option value="success">Succeeded</option>
            <option value="error">Failed</option>
            <option value="skipped">Skipped</option>
          </select>
        </div>

        {q.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : !q.data?.length ? (
          <div className="sk-card p-10 text-center text-sm text-muted-foreground">Nothing pushed to Xero yet.</div>
        ) : (
          <div className="sk-card overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr className="text-left">
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">Record</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Outcome</th>
                  <th className="px-4 py-3">Detail</th>
                </tr>
              </thead>
              <tbody>
                {q.data.map((r) => {
                  const chip = CHIP[r.status] ?? CHIP.skipped;
                  const Icon = chip.icon;
                  return (
                    <tr key={r.id} className="border-t border-border align-top">
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {new Date(r.created_at).toLocaleString("en-ZA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{r.entity_label ?? r.entity_type}</div>
                        <div className="text-xs text-muted-foreground">{r.entity_type}</div>
                      </td>
                      <td className="px-4 py-3">{r.action}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase ${chip.cls}`}>
                          <Icon className="h-3.5 w-3.5" /> {r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {r.error_message ? <span className="text-destructive">{r.error_message}</span> : r.xero_id ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
