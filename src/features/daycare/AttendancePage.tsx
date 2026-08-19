import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
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

  // Day notes written by daycare staff, merged into the Notes column.
  const notesQ = useQuery({
    queryKey: ["daycare_day_notes", "range", tenantId, from, to, petId],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      let q = (supabase as any)
        .from("daycare_day_notes")
        .select("id, pet_id, note_date, body, office_flag, handled_at")
        .eq("tenant_id", tenantId as string)
        .gte("note_date", from)
        .lte("note_date", to)
        .order("created_at", { ascending: true });
      if (petId) q = q.eq("pet_id", petId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as { id: string; pet_id: string; note_date: string; body: string; office_flag: boolean; handled_at: string | null }[];
    },
  });

  const notesByKey = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const n of notesQ.data ?? []) {
      const key = `${n.pet_id}|${n.note_date}`;
      const list = m.get(key) ?? [];
      list.push(n.office_flag && !n.handled_at ? `⚑ ${n.body}` : n.body);
      m.set(key, list);
    }
    return m;
  }, [notesQ.data]);

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
                   <td className="px-5 py-3 text-xs text-muted-foreground max-w-[260px] whitespace-pre-wrap">
                     {[a.notes, ...(notesByKey.get(`${a.pet_id}|${a.attendance_date}`) ?? [])]
                       .filter(Boolean)
                       .join("\n") || "-"}
                   </td>
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