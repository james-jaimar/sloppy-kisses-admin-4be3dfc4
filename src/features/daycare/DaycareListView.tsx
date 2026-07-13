import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, LogOut, XCircle } from "lucide-react";
import { toast } from "sonner";
import { AttendanceRow, AttendanceStatus, ExpectedItem, useUpsertAttendance } from "./queries";

interface Props {
  tenantId: string;
  attendanceDate: string;
  expectedItems: ExpectedItem[];
  attendance: AttendanceRow[];
}

type Row = {
  key: string;
  pet_id: string;
  customer_id: string;
  pet_name: string;
  customer_name: string;
  plan_name: string | null;
  status: AttendanceStatus | "expected";
  attendance: AttendanceRow | null;
  badge?: string;
  mode: "expected" | "checked_in" | "history";
};

const STATUS_META: Record<string, { label: string; className: string }> = {
  expected: { label: "Expected", className: "bg-muted text-muted-foreground" },
  checked_in: { label: "Checked in", className: "bg-sk-green-soft text-sk-green" },
  checked_out: { label: "Checked out", className: "bg-sk-turquoise-soft text-sk-turquoise-dark" },
  not_arrived: { label: "No-show", className: "bg-sk-orange-soft text-sk-orange" },
  walk_in: { label: "Walk-in", className: "bg-sk-coral-soft text-sk-coral-dark" },
};

const STATUS_ORDER: Record<string, number> = {
  checked_in: 0, expected: 1, walk_in: 2, checked_out: 3, not_arrived: 4,
};

export function DaycareListView({ tenantId, attendanceDate, expectedItems, attendance }: Props) {
  const upsert = useUpsertAttendance(tenantId);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const rows: Row[] = useMemo(() => {
    const attByPet = new Map(attendance.map((a) => [a.pet_id, a]));
    const expectedPetIds = new Set(expectedItems.map((it) => it.pet_id));
    const result: Row[] = [];

    for (const it of expectedItems) {
      const a = attByPet.get(it.pet_id) ?? null;
      const status: AttendanceStatus | "expected" = a?.status ?? "expected";
      const mode: Row["mode"] = a?.status === "checked_in" ? "checked_in" : "expected";
      result.push({
        key: it.key,
        pet_id: it.pet_id,
        customer_id: it.customer_id,
        pet_name: it.pet_name,
        customer_name: it.customer_name,
        plan_name: it.plan_name,
        status,
        attendance: a,
        badge: it.source === "swap-in" ? "Swap-in" : undefined,
        mode,
      });
    }

    // Walk-ins / attendance rows not in expected list
    for (const a of attendance) {
      if (expectedPetIds.has(a.pet_id)) continue;
      const isCheckedIn = a.status === "checked_in";
      result.push({
        key: a.id,
        pet_id: a.pet_id,
        customer_id: a.customer_id,
        pet_name: a.pet?.name ?? "Unknown",
        customer_name: a.customer?.full_name ?? "",
        plan_name: null,
        status: a.status,
        attendance: a,
        badge: "Walk-in",
        mode: isCheckedIn ? "checked_in" : "history",
      });
    }

    result.sort((x, y) => {
      const sx = STATUS_ORDER[x.status] ?? 99;
      const sy = STATUS_ORDER[y.status] ?? 99;
      if (sx !== sy) return sx - sy;
      return x.pet_name.localeCompare(y.pet_name);
    });

    return result;
  }, [expectedItems, attendance]);

  async function setStatus(row: Row, status: AttendanceStatus) {
    setBusyKey(row.key);
    try {
      const nowIso = new Date().toISOString();
      await upsert.mutateAsync({
        id: row.attendance?.id,
        pet_id: row.pet_id,
        customer_id: row.customer_id,
        attendance_date: attendanceDate,
        status,
        expected: row.mode !== "history",
        checked_in_at:
          status === "checked_in" ? nowIso : row.attendance?.checked_in_at ?? null,
        checked_out_at:
          status === "checked_out" ? nowIso : row.attendance?.checked_out_at ?? null,
        notes: row.attendance?.notes ?? null,
      });
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to update");
    } finally {
      setBusyKey(null);
    }
  }

  if (rows.length === 0) {
    return (
      <div className="sk-card p-8 text-center text-sm text-muted-foreground">
        Nothing scheduled or checked in for this day.
      </div>
    );
  }

  const fmtTime = (iso: string | null) =>
    iso ? new Date(iso).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" }) : "—";

  return (
    <div className="sk-card overflow-hidden">
      <div className="sk-scroll-x">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-sk-surface-muted text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Pet</th>
              <th className="px-4 py-3 text-left font-medium">Owner</th>
              <th className="px-4 py-3 text-left font-medium hidden md:table-cell">Plan</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium hidden sm:table-cell">In / Out</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => {
              const meta = STATUS_META[r.status] ?? STATUS_META.expected;
              const busy = busyKey === r.key;
              return (
                <tr key={r.key} className="hover:bg-sk-surface-muted/60">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/admin/pets/${r.pet_id}`}
                        className="font-semibold text-foreground hover:text-sk-coral-dark hover:underline underline-offset-2"
                      >
                        {r.pet_name}
                      </Link>
                      {r.badge && (
                        <span className="rounded-full bg-sk-turquoise-soft px-2 py-0.5 text-[10px] font-medium text-sk-turquoise-dark">
                          {r.badge}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      to={`/admin/customers/${r.customer_id}`}
                      className="text-muted-foreground hover:text-sk-coral-dark hover:underline underline-offset-2"
                    >
                      {r.customer_name || "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">
                    {r.plan_name || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.className}`}>
                      {meta.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell text-xs text-muted-foreground whitespace-nowrap">
                    {fmtTime(r.attendance?.checked_in_at ?? null)} · {fmtTime(r.attendance?.checked_out_at ?? null)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {r.mode === "expected" && (
                        <>
                          <button
                            disabled={busy}
                            onClick={() => setStatus(r, "checked_in")}
                            className="inline-flex items-center gap-1 rounded-lg bg-sk-green px-2.5 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Check in</span>
                          </button>
                          <button
                            disabled={busy}
                            onClick={() => setStatus(r, "not_arrived")}
                            className="inline-flex items-center gap-1 rounded-lg border border-border bg-white px-2.5 py-1.5 text-xs font-medium hover:bg-sk-surface-muted disabled:opacity-50"
                          >
                            <XCircle className="h-3.5 w-3.5" /> <span className="hidden sm:inline">No-show</span>
                          </button>
                        </>
                      )}
                      {r.mode === "checked_in" && (
                        <button
                          disabled={busy}
                          onClick={() => setStatus(r, "checked_out")}
                          className="inline-flex items-center gap-1 rounded-lg bg-sk-coral px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-50"
                        >
                          <LogOut className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Check out</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}