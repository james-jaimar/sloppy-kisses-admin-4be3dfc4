import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { AlarmClock, Clock, Hotel, PawPrint, Scissors } from "lucide-react";
import {
  fmtCollectTime, overdueMinutes, useStayPlayForDay, useUpdateStayPlaySession,
  type StayPlaySession,
} from "./stayPlayQueries";

function StatusPill({ s }: { s: StayPlaySession }) {
  const map: Record<string, string> = {
    awaiting: "bg-sk-surface-muted text-muted-foreground",
    in_care: "bg-sk-coral-soft text-sk-coral-dark",
    collected: "bg-sk-green/10 text-sk-green",
    no_show: "bg-sk-orange-soft text-sk-orange",
  };
  const label: Record<string, string> = {
    awaiting: "Awaiting", in_care: "In care", collected: "Collected", no_show: "Not collected",
  };
  return <span className={"rounded-full px-2 py-0.5 text-[11px] font-semibold " + map[s.status]}>{label[s.status]}</span>;
}

function Card({
  s, graceMinutes, tenantId, compact,
}: { s: StayPlaySession; graceMinutes: number; tenantId: string; compact?: boolean }) {
  const update = useUpdateStayPlaySession(tenantId);
  const [editing, setEditing] = useState(false);
  const late = overdueMinutes(s, graceMinutes);

  const timeValue = s.expected_collect_at
    ? new Date(s.expected_collect_at).toTimeString().slice(0, 5)
    : "";

  async function setStatus(status: StayPlaySession["status"]) {
    try {
      await update.mutateAsync({
        id: s.id,
        patch: {
          status,
          collected_at: status === "collected" ? new Date().toISOString() : null,
        } as any,
      });
      toast.success(status === "collected" ? "Marked collected" : "Updated");
    } catch (err: any) { toast.error(err?.message ?? "Couldn't update"); }
  }

  async function setTime(hhmm: string) {
    if (!hhmm) return;
    const [h, m] = hhmm.split(":").map(Number);
    const d = new Date(`${s.session_date}T00:00:00`);
    d.setHours(h, m, 0, 0);
    try {
      await update.mutateAsync({ id: s.id, patch: { expected_collect_at: d.toISOString() } as any });
      setEditing(false);
      toast.success("Collection time updated");
    } catch (err: any) { toast.error(err?.message ?? "Couldn't update"); }
  }

  return (
    <div
      className={
        "rounded-xl border bg-white p-3 " +
        (late ? "border-destructive/60 ring-1 ring-destructive/30" : "border-border")
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            <PawPrint className="h-3.5 w-3.5 text-sk-coral" />
            <span className="truncate">{s.pet?.name ?? "Pet"}</span>
          </div>
          <div className="truncate text-xs text-muted-foreground">{s.customer?.full_name ?? ""}</div>
        </div>
        <StatusPill s={s} />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="inline-flex items-center gap-1 rounded-full bg-sk-surface-muted px-2 py-0.5 font-medium">
          {s.origin === "hotel" ? <Hotel className="h-3 w-3" /> : <Scissors className="h-3 w-3" />}
          {s.origin === "hotel" ? "After hotel" : "After groom"}
        </span>
        {s.booking?.booking_number && (
          <Link to={`/admin/bookings/${s.booking_id}`} className="rounded-full bg-sk-surface-muted px-2 py-0.5 font-medium hover:bg-sk-coral-soft">
            {s.booking.booking_number}
          </Link>
        )}
        <span className={"inline-flex items-center gap-1 " + (late ? "font-semibold text-destructive" : "text-muted-foreground")}>
          {late ? <AlarmClock className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
          {late ? `Overdue ${late}m` : `Collect ${fmtCollectTime(s.expected_collect_at)}`}
        </span>
      </div>

      {editing ? (
        <div className="mt-2 flex items-center gap-2">
          <input
            type="time"
            defaultValue={timeValue}
            onBlur={(e) => setTime(e.target.value)}
            className="h-9 rounded-lg border border-border px-2 text-sm"
          />
          <button onClick={() => setEditing(false)} className="text-xs text-muted-foreground hover:underline">Cancel</button>
        </div>
      ) : (
        <div className={"mt-2 flex flex-wrap gap-1.5 " + (compact ? "text-sm" : "text-xs")}>
          {s.status !== "in_care" && s.status !== "collected" && (
            <button onClick={() => setStatus("in_care")} className="rounded-lg bg-sk-coral-soft px-3 py-1.5 font-semibold text-sk-coral-dark hover:bg-sk-coral-soft/80">
              In care
            </button>
          )}
          {s.status !== "collected" && (
            <button onClick={() => setStatus("collected")} className="rounded-lg bg-sk-coral px-3 py-1.5 font-semibold text-white hover:bg-sk-coral-dark">
              Collected
            </button>
          )}
          <button onClick={() => setEditing(true)} className="rounded-lg border border-border px-3 py-1.5 font-medium hover:bg-sk-surface-muted">
            Collection time
          </button>
          {s.status !== "collected" && s.status !== "no_show" && (
            <button onClick={() => setStatus("no_show")} className="rounded-lg border border-border px-3 py-1.5 font-medium text-sk-orange hover:bg-sk-orange-soft">
              Not collected
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function StayPlayLane({
  tenantId, day, graceMinutes = 15, compact,
}: { tenantId: string; day: Date; graceMinutes?: number; compact?: boolean }) {
  const q = useStayPlayForDay(tenantId, day);
  const rows = q.data ?? [];
  const overdue = useMemo(
    () => rows.filter((r) => overdueMinutes(r, graceMinutes) !== null),
    [rows, graceMinutes],
  );

  if (rows.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Stay &amp; Play · {rows.length}
        </h2>
        {overdue.length > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-1 text-[11px] font-semibold text-destructive">
            <AlarmClock className="h-3 w-3" /> {overdue.length} overdue collection{overdue.length === 1 ? "" : "s"}
          </span>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map((s) => (
          <Card key={s.id} s={s} graceMinutes={graceMinutes} tenantId={tenantId} compact={compact} />
        ))}
      </div>
    </div>
  );
}