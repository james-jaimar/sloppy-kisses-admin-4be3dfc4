import { useMemo } from "react";
import { toast } from "sonner";
import { AlertTriangle, MapPin, PlayCircle, CheckCheck, XCircle, Truck } from "lucide-react";
import type { BookingStatus } from "@/features/bookings/queries";
import { useUpdateVanBookingStatus, type MobileVanResource, type VanStop } from "./queries";

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });
}

export function RouteSummary({
  tenantId, van, stops, minGap, maxGap,
}: {
  tenantId: string | null;
  van: MobileVanResource | null;
  stops: VanStop[];
  minGap: number;
  maxGap: number;
}) {
  const updateStatus = useUpdateVanBookingStatus(tenantId ?? "");

  const totals = useMemo(() => {
    const minutes = stops.reduce((sum, s) => sum + (s.package?.expected_minutes ?? 0), 0);
    const first = stops[0]?.start_at ?? null;
    const last = stops[stops.length - 1]?.end_at ?? stops[stops.length - 1]?.start_at ?? null;
    const suburbs = Array.from(new Set(stops.map((s) => s.customer?.suburb).filter(Boolean))) as string[];
    return { minutes, first, last, suburbs };
  }, [stops]);

  const gapWarnings = useMemo(() => {
    const out: { i: number; kind: "tight" | "loose"; minutes: number; a: VanStop; b: VanStop }[] = [];
    for (let i = 1; i < stops.length; i++) {
      const a = stops[i - 1];
      const b = stops[i];
      const prevEnd = a.end_at ?? a.start_at;
      if (!prevEnd) continue;
      const gap = Math.round((new Date(b.start_at).getTime() - new Date(prevEnd).getTime()) / 60000);
      if (gap < minGap) out.push({ i, kind: "tight", minutes: gap, a, b });
      else if (gap > maxGap) out.push({ i, kind: "loose", minutes: gap, a, b });
    }
    return out;
  }, [stops, minGap, maxGap]);

  async function setStatus(s: VanStop, status: BookingStatus, verb: string) {
    try {
      await updateStatus.mutateAsync({ bookingId: s.id, status });
      toast.success(`${s.pets[0]?.name ?? "Pet"} — ${verb}`);
    } catch (err: any) {
      toast.error(err?.message ?? `Failed to ${verb.toLowerCase()}`);
    }
  }

  return (
    <div className="space-y-4">
      <div className="sk-card p-5">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-sk-turquoise-soft text-sk-turquoise-dark">
            <Truck className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="truncate text-sm font-semibold">{van?.name ?? "No van selected"}</div>
            <div className="text-xs text-muted-foreground">
              {stops.length} stop{stops.length === 1 ? "" : "s"} · {totals.minutes} min grooming
              {van?.home_suburb && ` · from ${van.home_suburb}`}
            </div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg bg-muted px-3 py-2">
            <div className="text-muted-foreground">First stop</div>
            <div className="font-semibold tabular-nums">{fmtTime(totals.first)}</div>
          </div>
          <div className="rounded-lg bg-muted px-3 py-2">
            <div className="text-muted-foreground">Last stop</div>
            <div className="font-semibold tabular-nums">{fmtTime(totals.last)}</div>
          </div>
        </div>
        {totals.suburbs.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px]">
            <MapPin className="h-3 w-3 text-muted-foreground" />
            {totals.suburbs.map((s) => (
              <span key={s} className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">{s}</span>
            ))}
          </div>
        )}
      </div>

      <div className="sk-card">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-semibold">
          <AlertTriangle className="h-4 w-4" />
          Travel gaps
        </div>
        {gapWarnings.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-muted-foreground">All gaps within {minGap}–{maxGap} min.</div>
        ) : (
          <ul className="divide-y divide-border">
            {gapWarnings.map((w) => (
              <li key={w.i} className="px-4 py-2.5 text-xs">
                <div className={w.kind === "tight" ? "font-semibold text-destructive" : "font-semibold text-sk-orange"}>
                  {w.minutes} min {w.kind === "tight" ? "(too tight)" : "(too loose)"}
                </div>
                <div className="text-muted-foreground truncate">
                  {w.a.pets[0]?.name ?? "?"} → {w.b.pets[0]?.name ?? "?"}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="sk-card">
        <div className="border-b border-border px-4 py-3 text-sm font-semibold">Quick actions</div>
        {stops.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-muted-foreground">No stops to action.</div>
        ) : (
          <ul className="divide-y divide-border">
            {stops.map((s) => (
              <li key={s.id} className="flex items-center gap-2 px-4 py-2.5 text-xs">
                <div className="w-12 shrink-0 tabular-nums text-muted-foreground">{fmtTime(s.start_at)}</div>
                <div className="flex-1 truncate">{s.pets[0]?.name ?? "?"}</div>
                <button
                  title="Start"
                  disabled={updateStatus.isPending}
                  onClick={() => setStatus(s, "in_progress", "started")}
                  className="grid h-7 w-7 place-items-center rounded-md bg-sk-coral text-white hover:bg-sk-coral/90 disabled:opacity-50"
                >
                  <PlayCircle className="h-3.5 w-3.5" />
                </button>
                <button
                  title="Completed"
                  disabled={updateStatus.isPending}
                  onClick={() => setStatus(s, "completed", "completed")}
                  className="grid h-7 w-7 place-items-center rounded-md bg-sk-green text-white hover:bg-sk-green/90 disabled:opacity-50"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                </button>
                <button
                  title="No show"
                  disabled={updateStatus.isPending}
                  onClick={() => setStatus(s, "no_show", "marked no-show")}
                  className="grid h-7 w-7 place-items-center rounded-md border border-border bg-white text-destructive hover:bg-muted disabled:opacity-50"
                >
                  <XCircle className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}