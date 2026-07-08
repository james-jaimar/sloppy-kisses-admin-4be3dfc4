import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import { useAttendanceForRange, useTenantPetsWithOwners } from "./queries";

function isoDate(d: Date) {
  const y = d.getFullYear(); const m = String(d.getMonth()+1).padStart(2,"0"); const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
function addDays(d: Date, n: number) { const c = new Date(d); c.setDate(c.getDate()+n); return c; }

export default function AttendancePage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const navigate = useNavigate();
  const [from, setFrom] = useState(isoDate(addDays(new Date(), -14)));
  const [to, setTo] = useState(isoDate(new Date()));
  const [petId, setPetId] = useState<string>("");

  const petsQ = useTenantPetsWithOwners(tenantId);
  const attQ = useAttendanceForRange(tenantId, from, to, petId || null);
  const rows = useMemo(() => attQ.data ?? [], [attQ.data]);

  return (
    <>
      <AppHeader
        title="Daycare"
        subtitle="Attendance history."
        tabs={[
          { label: "Board", onClick: () => navigate("/admin/daycare") },
          { label: "Enrolments", onClick: () => navigate("/admin/daycare/enrolments") },
          { label: "Attendance", active: true },
        ]}
      />
      <div className="flex-1 space-y-4 p-6">
        <div className="sk-card flex flex-wrap items-end gap-3 p-4">
          <label className="text-xs">
            <div className="mb-1 font-semibold uppercase tracking-wide text-muted-foreground">From</div>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="h-9 rounded-lg border border-border bg-white px-3 text-sm" />
          </label>
          <label className="text-xs">
            <div className="mb-1 font-semibold uppercase tracking-wide text-muted-foreground">To</div>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="h-9 rounded-lg border border-border bg-white px-3 text-sm" />
          </label>
          <label className="text-xs flex-1 min-w-[220px]">
            <div className="mb-1 font-semibold uppercase tracking-wide text-muted-foreground">Pet</div>
            <select value={petId} onChange={(e) => setPetId(e.target.value)}
              className="h-9 w-full rounded-lg border border-border bg-white px-3 text-sm">
              <option value="">All pets</option>
              {(petsQ.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.name} - {p.customer?.full_name ?? ""}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="sk-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-sk-surface-muted text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Pet</th>
                  <th className="px-5 py-3">Owner</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Checked in</th>
                  <th className="px-5 py-3">Checked out</th>
                  <th className="px-5 py-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.length === 0 && (
                  <tr><td colSpan={7} className="px-5 py-10 text-center text-muted-foreground">No attendance records in this range.</td></tr>
                )}
                {rows.map((a) => (
                  <tr key={a.id}>
                    <td className="px-5 py-3 tabular-nums">{a.attendance_date}</td>
                    <td className="px-5 py-3 font-medium">{a.pet?.name ?? "-"}</td>
                    <td className="px-5 py-3 text-muted-foreground">{a.customer?.full_name ?? ""}</td>
                    <td className="px-5 py-3 capitalize">{a.status.replace("_"," ")}</td>
                    <td className="px-5 py-3 tabular-nums">{a.checked_in_at ? new Date(a.checked_in_at).toLocaleTimeString("en-ZA",{hour:"2-digit",minute:"2-digit"}) : "-"}</td>
                    <td className="px-5 py-3 tabular-nums">{a.checked_out_at ? new Date(a.checked_out_at).toLocaleTimeString("en-ZA",{hour:"2-digit",minute:"2-digit"}) : "-"}</td>
                    <td className="px-5 py-3 text-xs text-muted-foreground truncate max-w-[220px]">{a.notes ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}