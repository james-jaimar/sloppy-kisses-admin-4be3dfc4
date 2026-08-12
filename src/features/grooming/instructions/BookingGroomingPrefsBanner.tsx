import { useState } from "react";
import { AlertTriangle, Check, PawPrint, Scissors } from "lucide-react";
import { useGroomingPrefsStates } from "./prefsQueries";
import { BookingGroomingPrefsDialog } from "./BookingGroomingPrefsDialog";

/** Prefs status banner for a single grooming booking (booking detail / work mode). */
export function BookingGroomingPrefsBanner({
  tenantId,
  bookingId,
  petId,
  petName,
  customerId,
}: {
  tenantId: string | null;
  bookingId: string;
  petId: string | null;
  petName?: string | null;
  customerId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const prefs = useGroomingPrefsStates([{ id: bookingId, petIds: petId ? [petId] : [] }]);
  if (prefs.isLoading) return null;
  const state = prefs.forBooking(bookingId, petId ? [petId] : []);

  const meta =
    state === "missing"
      ? {
          Icon: AlertTriangle,
          cls: "border-sk-orange bg-sk-orange-soft text-sk-orange",
          title: "Grooming preferences not set",
          sub: "Nobody has told us how this groom should be done. Capture it before the appointment.",
          cta: "Set preferences",
        }
      : state === "from_pet"
        ? {
            Icon: PawPrint,
            cls: "border-border bg-sk-surface-muted",
            title: "Using the pet's profile preferences",
            sub: "No booking-specific instructions yet — confirm with the owner if anything changes.",
            cta: "Review preferences",
          }
        : {
            Icon: Check,
            cls: "border-sk-green/40 bg-sk-green-soft text-sk-green",
            title: "Grooming preferences set",
            sub: "The groomer has instructions for this appointment.",
            cta: "View / edit",
          };

  return (
    <>
      {open && (
        <BookingGroomingPrefsDialog
          open
          tenantId={tenantId}
          bookingId={bookingId}
          petId={petId}
          petName={petName}
          customerId={customerId}
          onClose={() => setOpen(false)}
        />
      )}
      <div className={`sk-card flex items-start gap-3 border p-4 text-sm ${meta.cls}`}>
        <meta.Icon className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="flex-1">
          <div className="font-semibold">{meta.title}</div>
          <div className="text-xs opacity-90">{meta.sub}</div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-white px-3 text-xs font-semibold text-foreground hover:bg-white/80"
        >
          <Scissors className="h-3.5 w-3.5" /> {meta.cta}
        </button>
      </div>
    </>
  );
}
