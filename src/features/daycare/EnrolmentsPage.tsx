import { useMemo, useState } from "react";
import { Plus, ArrowLeftRight, Pencil, Trash2, FileText } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import { useDaycareEnrolments, useDeleteEnrolment, WEEKDAY_LABEL, type DaycareEnrolment, type Weekday } from "./queries";
import { EnrolmentDrawer } from "./EnrolmentDrawer";
import { DaySwapDialog } from "./DaySwapDialog";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { NewQuoteDrawer } from "@/features/quotes/NewQuoteDrawer";
import { Can } from "@/components/auth/Can";
import { useColumnTable, type ColumnDef } from "@/components/table/useColumnTable";

const enrolmentColumns: ColumnDef<DaycareEnrolment>[] = [
  { key: "pet", label: "Pet", get: (r) => r.pet?.name ?? "" },
  { key: "owner", label: "Owner", get: (r) => r.customer?.full_name ?? "" },
  { key: "plan", label: "Plan", filter: "select", get: (r) => r.plan?.name ?? "No plan" },
  {
    key: "days", label: "Days",
    get: (r) => (r.selected_days ?? []).map((d) => WEEKDAY_LABEL[d as Weekday] ?? d).join(" "),
    sortValue: (r) => (r.selected_days ?? []).length,
  },
  { key: "start", label: "Start", get: (r) => r.start_date ?? "" },
  { key: "end", label: "End", get: (r) => r.end_date ?? "" },
  { key: "status", label: "Status", filter: "select", get: (r) => (r.active ? "Active" : "Inactive") },
];

export default function EnrolmentsPage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [showInactive, setShowInactive] = useState(false);
  const listQ = useDaycareEnrolments(tenantId, { activeOnly: !showInactive });
  const del = useDeleteEnrolment(tenantId as string);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<DaycareEnrolment | null>(null);
  const [swapEnrolment, setSwapEnrolment] = useState<DaycareEnrolment | null>(null);
  const [quoteOpen, setQuoteOpen] = useState(false);

  const rows = useMemo(() => listQ.data ?? [], [listQ.data]);
  const table = useColumnTable(rows, enrolmentColumns, "sk.daycare.enrolments", { key: "pet", asc: true });

  async function onDelete(r: DaycareEnrolment) {
    if (!(await confirm({ title: `Delete enrolment for ${r.pet?.name ?? "this pet"}?`, description: "Any auto-created draft invoice line will also be removed.", confirmLabel: "Delete", tone: "destructive" }))) return;
    try {
      await del.mutateAsync(r.id);
      toast.success("Enrolment deleted");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to delete");
    }
  }

  return (
    <>
      <AppHeader
        title="Daycare"
        subtitle="Ongoing enrolments and per-day swaps."
        tabs={[
          { label: "Board", onClick: () => navigate("/admin/daycare") },
          { label: "Enrolments", active: true },
          { label: "Attendance", onClick: () => navigate("/admin/daycare/attendance") },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
              Show inactive
            </label>
            <Can code="bookings.create">
              <button
                onClick={() => setQuoteOpen(true)}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-white px-3 text-sm font-semibold hover:bg-sk-surface-muted"
              >
                <FileText className="h-4 w-4" /> Quote a place
              </button>
            </Can>
            <button
              onClick={() => { setEditing(null); setDrawerOpen(true); }}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-sk-coral px-3 text-sm font-semibold text-white hover:bg-sk-coral-dark"
            >
              <Plus className="h-4 w-4" /> New enrolment
            </button>
          </div>
        }
      />
      <div className="flex-1 p-6">
        <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>Showing {table.rows.length} of {table.total}</span>
          {table.active && (
            <button onClick={table.clear} className="font-medium text-sk-coral-dark hover:underline">Clear filters</button>
          )}
        </div>
        <div className="sk-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-sk-surface-muted text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <tr>
                  {enrolmentColumns.map((c) => table.headerCell(c.key))}
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
                <tr>
                  {enrolmentColumns.map((c) => table.filterCell(c.key))}
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {table.rows.length === 0 && (
                  <tr><td colSpan={8} className="px-5 py-10 text-center text-muted-foreground">
                    {rows.length === 0 ? "No enrolments yet." : "No enrolments match these filters."}
                  </td></tr>
                )}
                {table.rows.map((r) => (
                  <tr key={r.id} className="hover:bg-sk-surface-muted/40">
                    <td className="px-5 py-3 font-medium">
                      {r.pet?.id ? (
                        <Link to={`/admin/pets/${r.pet.id}`} className="hover:text-sk-coral-dark hover:underline">
                          {r.pet.name ?? "-"}
                        </Link>
                      ) : (
                        r.pet?.name ?? "-"
                      )}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {r.customer?.id ? (
                        <Link to={`/admin/customers/${r.customer.id}`} className="hover:text-sk-coral-dark hover:underline">
                          {r.customer.full_name ?? ""}
                        </Link>
                      ) : (
                        r.customer?.full_name ?? ""
                      )}
                    </td>
                    <td className="px-5 py-3">{r.plan?.name ?? "-"}</td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(r.selected_days ?? []).map((d) => (
                          <span key={d} className="rounded bg-sk-turquoise-soft px-1.5 py-0.5 text-[10px] font-semibold text-sk-turquoise-dark">
                            {WEEKDAY_LABEL[d as Weekday] ?? d}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-3 tabular-nums">{r.start_date}</td>
                    <td className="px-5 py-3 tabular-nums">{r.end_date ?? "-"}</td>
                    <td className="px-5 py-3">
                      {r.active ? (
                        <span className="rounded-full bg-sk-green/10 px-2 py-0.5 text-xs font-medium text-sk-green">Active</span>
                      ) : (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Inactive</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="inline-flex gap-2">
                        <button onClick={() => setSwapEnrolment(r)}
                          className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs hover:bg-sk-surface-muted">
                          <ArrowLeftRight className="h-3.5 w-3.5" /> Swap a day
                        </button>
                        <button onClick={() => { setEditing(r); setDrawerOpen(true); }}
                          className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs hover:bg-sk-surface-muted">
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </button>
                        <button onClick={() => onDelete(r)} disabled={del.isPending}
                          className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-sk-coral-dark hover:bg-sk-coral-soft disabled:opacity-50">
                          <Trash2 className="h-3.5 w-3.5" /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <EnrolmentDrawer tenantId={tenantId as string} open={drawerOpen} onOpenChange={setDrawerOpen} editing={editing} />
      {quoteOpen && tenantId && (
        <NewQuoteDrawer tenantId={tenantId} initialService="daycare" onClose={() => setQuoteOpen(false)} />
      )}
      <DaySwapDialog tenantId={tenantId as string} enrolment={swapEnrolment} open={!!swapEnrolment} onOpenChange={(v) => !v && setSwapEnrolment(null)} />
    </>
  );
}