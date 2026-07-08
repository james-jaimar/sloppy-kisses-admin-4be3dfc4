import { useMemo } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCheck, MapPin, PlayCircle, Truck, XCircle } from "lucide-react";
import type { BookingStatus } from "@/features/bookings/queries";
import { useUpdateTransportStatus, type TransportLeg, type TransportVehicle } from "./queries";

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });
}

export function TransportSummary({
  tenantId, vehicle, legs, minGap, maxGap,
}: {
  tenantId: string | null;
  vehicle: TransportVehicle | null;
  legs: TransportLeg[];
  minGap: number;
  maxGap: number;
}) {
  const updateStatus = useUpdateTransportStatus(tenantId ?? "");

  const totals = useMemo(() => {
    const first = legs[0]?.start_at ?? null;
    const last = legs[legs.length - 1]?.end_at ?? legs[legs.length - 1]?.start_at ?? null;
    const suburbs = Array.from(new Set(legs.map((l) => l.details?.suburb ?? l.customer?.suburb).filter(Boolean))) as string[];
    return { first, last, suburbs };
  }, [legs]);

  const gapWarnings = useMemo(() => {
    const out: { i: number; kind: "tight" | "loose"; minutes: number; a: TransportLeg; b: TransportLeg }[] = [];
    for (let i = 1; i < legs.length; i++) {
      const a = legs[i - 1];
      const b = legs[i];
      const prevEnd = a.end_at ?? a.start_at;
      if (!prevEnd) continue;
      const gap = Math.round((new Date(b.start_at).getTime() - new Date(prevEnd).getTime()) / 60000);
      if (gap < minGap) out.push({ i, kind: "tight", minutes: gap, a, b });
      else if (gap > maxGap) out.push({ i, kind: "loose", minutes: gap, a, b });
    }
    return out;
  }, [legs, minGap, maxGap]);

  async function setStatus(l: TransportLeg, status: BookingStatus, verb: string) {
    try {
      await updateStatus.mutateAsync({ bookingId: l.id, status });
      toast.success(`${l.pets[0]?.name ?? "Pet"} — ${verb}`);
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
            <div className="truncate text-sm font-semibold">{vehicle?.name ?? "No vehicle selected"}</div>
            <div className="text-xs text-muted-foreground">
              {legs.length} leg{legs.length === 1 ? "" : "s"}
              {vehicle?.home_suburb && ` · from ${vehicle.home_suburb}`}
            </div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg bg-muted px-3 py-2">
            <div className="text-muted-foreground">First leg</div>
            <div className="font-semibold tabular-nums">{fmtTime(totals.first)}</div>
          </div>
          <div className="rounded-lg bg-muted px-3 py-2">
            <div className="text-muted-foreground">Last leg</div>
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
          Leg gaps
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
        {legs.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-muted-foreground">No legs to action.</div>
        ) : (
          <ul className="divide-y divide-border">
            {legs.map((l) => (
              <li key={l.id} className="flex items-center gap-2 px-4 py-2.5 text-xs">
                <div className="w-12 shrink-0 tabular-nums text-muted-foreground">{fmtTime(l.start_at)}</div>
                <div className="flex-1 truncate">{l.pets[0]?.name ?? "?"}</div>
                <button
                  title="En route"
                  disabled={updateStatus.isPending}
                  onClick={() => setStatus(l, "in_progress", "en route")}
                  className="grid h-7 w-7 place-items-center rounded-md bg-sk-coral text-white hover:bg-sk-coral/90 disabled:opacity-50"
                >
                  <PlayCircle className="h-3.5 w-3.5" />
                </button>
                <button
                  title="Delivered"
                  disabled={updateStatus.isPending}
                  onClick={() => setStatus(l, "completed", "delivered")}
                  className="grid h-7 w-7 place-items-center rounded-md bg-sk-green text-white hover:bg-sk-green/90 disabled:opacity-50"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                </button>
                <button
                  title="No show"
                  disabled={updateStatus.isPending}
                  onClick={() => setStatus(l, "no_show", "marked no-show")}
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