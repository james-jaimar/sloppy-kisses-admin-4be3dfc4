import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { useCurrentCustomer } from "../../hooks";
import { WizardShell, Field, inputCls, selectCls, textareaCls } from "./WizardShell";
import { usePortalPets, useCustomerBookings } from "./wizardHooks";
import { dateToIso, useCreatePortalBooking } from "./useBookingSubmit";
import { useCustomerAddresses } from "@/features/customers/addressQueries";
import AddressFormDrawer from "@/features/customers/AddressFormDrawer";

export default function TransportRequestWizard() {
  const cust = useCurrentCustomer();
  const pets = usePortalPets(cust.data?.id);
  const bookings = useCustomerBookings(cust.data?.id);
  const submit = useCreatePortalBooking();

  const [petIds, setPetIds] = useState<string[]>([]);
  const [linkedBookingId, setLinkedBookingId] = useState("");
  const [direction, setDirection] = useState<"pickup" | "dropoff" | "round_trip">("round_trip");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("08:00");
  const [addressLine, setAddressLine] = useState(cust.data?.address_line_1 ?? "");
  const [suburb, setSuburb] = useState(cust.data?.suburb ?? "");
  const [accessNotes, setAccessNotes] = useState("");
  const [notes, setNotes] = useState("");

  const canSubmit = cust.data && petIds.length > 0 && date && addressLine && !submit.isPending;

  function togglePet(id: string) {
    setPetIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function onSubmit() {
    if (!cust.data) return;
    const startAt = dateToIso(date, time);
    if (!startAt) return;
    submit.mutate({
      serviceType: "pickup_dropoff",
      petIds,
      startAt,
      notes: [notes, accessNotes ? `Access: ${accessNotes}` : null].filter(Boolean).join("\n") || null,
      transport: {
        direction,
        pickup_address: addressLine || null,
        suburb: suburb || null,
      },
    });
  }

  if (cust.isLoading) return <div className="grid flex-1 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <WizardShell
      title="Book pick up / drop off"
      subtitle="Add transport to an existing booking, or book a standalone trip."
      footer={
        <button onClick={onSubmit} disabled={!canSubmit} className="rounded-lg bg-sk-coral px-5 py-2 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-50">
          {submit.isPending ? "Booking…" : "Confirm booking"}
        </button>
      }
    >
      <Field label="Which pets?">
        <div className="flex flex-wrap gap-2">
          {(pets.data ?? []).map((p: any) => {
            const active = petIds.includes(p.id);
            return (
              <button key={p.id} type="button" onClick={() => togglePet(p.id)}
                className={"rounded-full border px-3 py-1.5 text-sm " + (active ? "border-sk-coral bg-sk-coral-soft text-sk-coral-dark" : "border-border bg-white hover:bg-muted")}>
                {p.name}
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="Link to existing booking (optional)">
        <select value={linkedBookingId} onChange={(e) => setLinkedBookingId(e.target.value)} className={selectCls}>
          <option value="">Standalone transport</option>
          {(bookings.data ?? []).map((b: any) => (
            <option key={b.id} value={b.id}>{b.booking_number} · {b.service_type} · {new Date(b.start_at).toLocaleDateString()}</option>
          ))}
        </select>
      </Field>

      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Direction">
          <select value={direction} onChange={(e) => setDirection(e.target.value as any)} className={selectCls}>
            <option value="pickup">Pickup only</option>
            <option value="dropoff">Drop-off only</option>
            <option value="round_trip">Both ways</option>
          </select>
        </Field>
        <Field label="Preferred date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} /></Field>
        <Field label="Preferred time"><input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputCls} /></Field>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Address"><input value={addressLine} onChange={(e) => setAddressLine(e.target.value)} className={inputCls} /></Field>
        <Field label="Suburb"><input value={suburb} onChange={(e) => setSuburb(e.target.value)} className={inputCls} /></Field>
      </div>

      <Field label="Access / parking notes"><textarea rows={2} value={accessNotes} onChange={(e) => setAccessNotes(e.target.value)} className={textareaCls} /></Field>
      <Field label="Notes for our team"><textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={textareaCls} /></Field>
    </WizardShell>
  );
}