import { Link } from "react-router-dom";
import { AlertTriangle, Clock, MapPin, PawPrint, User } from "lucide-react";
import { BookingStatusChip } from "@/features/bookings/statusMeta";
import { PaymentChip } from "@/features/shared/payments/paymentFlags";
import type { VanStop } from "./queries";

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });
}

function gapMinutes(prevEndIso: string | null, nextStartIso: string): number | null {
  if (!prevEndIso) return null;
  return Math.round((new Date(nextStartIso).getTime() - new Date(prevEndIso).getTime()) / 60000);
}

export function VanTimeline({
  stops,
  minGap,
  maxGap,
}: {
  stops: VanStop[];
  minGap: number;
  maxGap: number;
}) {
  if (!stops.length) {
    return (
      <div className="sk-card grid place-items-center p-12 text-sm text-muted-foreground">
        No stops scheduled for this van on this day.
      </div>
    );
  }
  return (
    <ol className="space-y-3">
      {stops.map((s, i) => {
        const prev = i > 0 ? stops[i - 1] : null;
        const gap = prev ? gapMinutes(prev.end_at ?? prev.start_at, s.start_at) : null;
        const gapTone =
          gap == null ? null :
          gap < minGap ? "warn-tight" :
          gap > maxGap ? "warn-loose" : "ok";
        return (
          <li key={s.id} className="space-y-2">
            {gap != null && (
              <div className={
                gapTone === "warn-tight" ? "flex items-center gap-2 pl-4 text-[11px] font-medium text-destructive"
                : gapTone === "warn-loose" ? "flex items-center gap-2 pl-4 text-[11px] font-medium text-sk-orange"
                : "flex items-center gap-2 pl-4 text-[11px] text-muted-foreground"
              }>
                {(gapTone === "warn-tight" || gapTone === "warn-loose") && <AlertTriangle className="h-3 w-3" />}
                <Clock className="h-3 w-3" />
                {gap >= 0 ? `${gap} min gap` : `overlap ${Math.abs(gap)} min`}
                {gapTone === "warn-tight" && ` — under ${minGap} min minimum`}
                {gapTone === "warn-loose" && ` — over ${maxGap} min maximum`}
              </div>
            )}
            <StopCard stop={s} />
          </li>
        );
      })}
    </ol>
  );
}

function StopCard({ stop }: { stop: VanStop }) {
  const pet = stop.pets[0];
  const otherPets = stop.pets.length - 1;
  const suburb = stop.customer?.suburb;
  const mins = stop.package?.expected_minutes ?? null;
  return (
    <Link
      to={`/admin/bookings/${stop.id}`}
      state={{ from: "/admin/mobile-vans" }}
      className="sk-card block p-4 transition-shadow hover:shadow-md"
    >
      <div className="flex items-start gap-4">
        <div className="w-16 text-right">
          <div className="text-sm font-semibold tabular-nums">{fmtTime(stop.start_at)}</div>
          {stop.end_at && (
            <div className="text-[11px] text-muted-foreground tabular-nums">→ {fmtTime(stop.end_at)}</div>
          )}
        </div>
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-sm font-semibold">
                <PawPrint className="h-3.5 w-3.5 text-sk-coral" />
                <span className="truncate">{pet?.name ?? "Unnamed pet"}</span>
                {otherPets > 0 && <span className="text-xs text-muted-foreground">+{otherPets}</span>}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {pet?.breed || pet?.species || "—"} · {stop.booking_number}
              </div>
            </div>
            <BookingStatusChip status={stop.status} />
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <User className="h-3 w-3" />
            <span className="truncate">{stop.customer?.full_name ?? "—"}</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            {suburb && (
              <span className="inline-flex items-center gap-1 rounded bg-sk-turquoise-soft px-1.5 py-0.5 text-sk-turquoise-dark">
                <MapPin className="h-3 w-3" /> {suburb}
              </span>
            )}
            {stop.package && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                {stop.package.name}
              </span>
            )}
            <PaymentChip bookingId={stop.id} />
            {mins != null && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                {mins} min
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}