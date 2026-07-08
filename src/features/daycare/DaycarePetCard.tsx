import { useState } from "react";
import { CheckCircle2, LogOut, XCircle } from "lucide-react";
import { toast } from "sonner";
import { AttendanceRow, AttendanceStatus, useUpsertAttendance } from "./queries";

interface Props {
  tenantId: string;
  attendanceDate: string;
  pet_id: string;
  customer_id: string;
  pet_name: string;
  customer_name: string;
  plan_name?: string | null;
  badge?: string;
  attendance?: AttendanceRow | null;
  mode: "expected" | "checked_in";
}

export function DaycarePetCard(p: Props) {
  const upsert = useUpsertAttendance(p.tenantId);
  const [busy, setBusy] = useState(false);

  async function setStatus(status: AttendanceStatus) {
    setBusy(true);
    try {
      const nowIso = new Date().toISOString();
      await upsert.mutateAsync({
        id: p.attendance?.id,
        pet_id: p.pet_id,
        customer_id: p.customer_id,
        attendance_date: p.attendanceDate,
        status,
        expected: p.mode === "expected",
        checked_in_at:
          status === "checked_in" ? nowIso : p.attendance?.checked_in_at ?? null,
        checked_out_at: status === "checked_out" ? nowIso : p.attendance?.checked_out_at ?? null,
        notes: p.attendance?.notes ?? null,
      });
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to update");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sk-card flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">{p.pet_name}</div>
          <div className="text-xs text-muted-foreground">{p.customer_name}</div>
        </div>
        {p.badge && (
          <span className="rounded-full bg-sk-turquoise-soft px-2 py-0.5 text-[10px] font-medium text-sk-turquoise-dark">
            {p.badge}
          </span>
        )}
      </div>
      {p.plan_name && (
        <div className="text-xs text-muted-foreground">Plan: {p.plan_name}</div>
      )}
      {p.attendance?.checked_in_at && (
        <div className="text-[11px] text-muted-foreground">
          In: {new Date(p.attendance.checked_in_at).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}
          {p.attendance.checked_out_at && ` · Out: ${new Date(p.attendance.checked_out_at).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}`}
        </div>
      )}
      <div className="flex flex-wrap gap-2 pt-1">
        {p.mode === "expected" && (
          <>
            <button
              disabled={busy}
              onClick={() => setStatus("checked_in")}
              className="inline-flex items-center gap-1 rounded-lg bg-sk-green px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Check in
            </button>
            <button
              disabled={busy}
              onClick={() => setStatus("not_arrived")}
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-medium hover:bg-sk-surface-muted disabled:opacity-50"
            >
              <XCircle className="h-3.5 w-3.5" /> No-show
            </button>
          </>
        )}
        {p.mode === "checked_in" && (
          <button
            disabled={busy}
            onClick={() => setStatus("checked_out")}
            className="inline-flex items-center gap-1 rounded-lg bg-sk-coral px-3 py-1.5 text-xs font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-50"
          >
            <LogOut className="h-3.5 w-3.5" /> Check out
          </button>
        )}
      </div>
    </div>
  );
}