import { useEffect, useState } from "react";
import { AlertTriangle, Clock, PawPrint, Sparkles, User } from "lucide-react";
import { Link } from "react-router-dom";
import { BookingStatusChip } from "@/features/bookings/statusMeta";
import { PaymentChip } from "@/features/shared/payments/paymentFlags";
import type { GroomingBoardCard } from "./queries";

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });
}

function elapsedMinutes(startIso: string): number {
  return Math.floor((Date.now() - new Date(startIso).getTime()) / 60000);
}

function Timer({ startIso, expectedMinutes }: { startIso: string; expectedMinutes: number | null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  void now;
  const mins = elapsedMinutes(startIso);
  const cap = expectedMinutes ?? 60;
  const tone =
    mins > cap + 15 ? "bg-destructive/10 text-destructive"
    : mins > cap ? "bg-sk-orange-soft text-sk-orange"
    : "bg-sk-turquoise-soft text-sk-turquoise-dark";
  return (
    <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold ${tone}`}>
      <Clock className="h-3 w-3" />
      {mins}m
    </span>
  );
}

export function GroomingCard({
  card,
  expectedMinutes,
  stayPlay,
  draggable,
  onDragStart,
}: {
  card: GroomingBoardCard;
  expectedMinutes: number | null;
  stayPlay?: boolean;
  draggable: boolean;
  onDragStart?: (e: React.DragEvent) => void;
}) {
  const pet = card.pets[0];
  const otherPets = card.pets.length - 1;
  const isMobile = card.service_type === "grooming_mobile";
  const hasResource = Boolean(card.resource);

  return (
    <Link
      to={`/admin/bookings/${card.id}`}
      state={{ from: "/admin/grooming" }}
      draggable={draggable}
      onDragStart={onDragStart}
      className="sk-card block cursor-grab space-y-2 p-3 transition-shadow hover:shadow-md active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            <PawPrint className="h-3.5 w-3.5 text-sk-coral" />
            <span className="truncate">{pet?.name ?? "Unnamed pet"}</span>
            {otherPets > 0 && <span className="text-xs text-muted-foreground">+{otherPets}</span>}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {pet?.breed || pet?.species || "—"} · {card.booking_number}
          </div>
        </div>
        <BookingStatusChip status={card.status} />
      </div>

      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <User className="h-3 w-3" />
        <span className="truncate">{card.customer?.full_name ?? "—"}</span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
          {fmtTime(card.start_at)}
        </span>
        {isMobile && (
          <span className="rounded bg-sk-turquoise-soft px-1.5 py-0.5 text-sk-turquoise-dark">Mobile</span>
        )}
        {!hasResource && (
          <span className="inline-flex items-center gap-1 rounded bg-sk-orange-soft px-1.5 py-0.5 text-sk-orange">
            <AlertTriangle className="h-3 w-3" /> Unassigned
          </span>
        )}
        {card.resource && (
          <span className="truncate rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
            {card.resource.name}
          </span>
        )}
        <PaymentChip bookingId={card.id} />
        {stayPlay && (
          <span className="inline-flex items-center gap-1 rounded bg-sk-coral-soft px-1.5 py-0.5 font-semibold text-sk-coral-dark">
            <Sparkles className="h-3 w-3" /> Stay &amp; Play
          </span>
        )}
        {card.details?.actual_start_at && !card.details?.actual_end_at && (
          <Timer startIso={card.details.actual_start_at} expectedMinutes={expectedMinutes} />
        )}
      </div>
    </Link>
  );
}