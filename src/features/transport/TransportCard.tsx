import { Link } from "react-router-dom";
import { MapPin, PawPrint, StickyNote, User, KeyRound } from "lucide-react";
import { BookingStatusChip } from "@/features/bookings/statusMeta";
import type { TransportLeg } from "./queries";

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });
}

export function TransportCard({ leg }: { leg: TransportLeg }) {
  const pet = leg.pets[0];
  const others = leg.pets.length - 1;
  const dir = leg.details?.direction;
  const isPickup = dir === "pickup" || dir === "round_trip";
  const address = isPickup
    ? (leg.details?.pickup_address ?? leg.customer?.home_address)
    : (leg.details?.dropoff_address ?? leg.customer?.home_address);
  const suburb = leg.details?.suburb ?? leg.customer?.suburb ?? null;

  return (
    <Link
      to={`/admin/bookings/${leg.id}`}
      state={{ from: "/admin/pickup-dropoff" }}
      className="sk-card block p-3 space-y-2 transition-shadow hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            <PawPrint className="h-3.5 w-3.5 text-sk-coral" />
            <span className="truncate">{pet?.name ?? "Unnamed pet"}</span>
            {others > 0 && <span className="text-xs text-muted-foreground">+{others}</span>}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {pet?.breed || pet?.species || "—"} · {leg.booking_number}
          </div>
        </div>
        <BookingStatusChip status={leg.status} />
      </div>

      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <User className="h-3 w-3" />
        <span className="truncate">{leg.customer?.full_name ?? "—"}</span>
      </div>

      {address && (
        <div className="flex items-start gap-1.5 text-xs">
          <MapPin className="mt-0.5 h-3 w-3 text-sk-turquoise-dark" />
          <span className="line-clamp-2">{address}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
          {fmtTime(leg.start_at)}
        </span>
        {suburb && (
          <span className="rounded bg-sk-turquoise-soft px-1.5 py-0.5 text-sk-turquoise-dark">{suburb}</span>
        )}
        {dir === "round_trip" && (
          <span className="rounded bg-sk-orange-soft px-1.5 py-0.5 text-sk-orange">Round trip</span>
        )}
        {leg.details?.gate_code && (
          <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
            <KeyRound className="h-3 w-3" /> {leg.details.gate_code}
          </span>
        )}
      </div>

      {leg.details?.driver_notes && (
        <div className="flex items-start gap-1.5 rounded bg-muted/50 px-2 py-1 text-[11px] text-muted-foreground">
          <StickyNote className="mt-0.5 h-3 w-3" />
          <span className="line-clamp-2">{leg.details.driver_notes}</span>
        </div>
      )}
    </Link>
  );
}