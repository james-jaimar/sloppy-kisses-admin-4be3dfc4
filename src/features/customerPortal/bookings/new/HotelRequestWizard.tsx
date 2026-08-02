import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useCurrentCustomer } from "../../hooks";
import { WizardShell, Field, inputCls, selectCls, textareaCls } from "./WizardShell";
import { usePortalPets, useResources } from "./wizardHooks";
import { dateToIso, useCreatePortalBooking } from "./useBookingSubmit";

export default function HotelRequestWizard() {
  const cust = useCurrentCustomer();
  const pets = usePortalPets(cust.data?.id);
  const rooms = useResources(cust.data?.tenant_id, ["hotel_area", "cattery_area"]);
  const submit = useCreatePortalBooking();

  const [petIds, setPetIds] = useState<string[]>([]);
  const [checkInDate, setCheckInDate] = useState("");
  const [checkInTime, setCheckInTime] = useState("09:00");
  const [checkOutDate, setCheckOutDate] = useState("");
  const [checkOutTime, setCheckOutTime] = useState("10:00");
  const [roomPref, setRoomPref] = useState("");
  const [dietMeds, setDietMeds] = useState("");
  const [notes, setNotes] = useState("");

  const selectedPets = useMemo(
    () => (pets.data ?? []).filter((p: any) => petIds.includes(p.id)),
    [pets.data, petIds],
  );

  const isCat = selectedPets.some((p) => (p.species ?? "").toLowerCase().includes("cat"));
  const serviceType = isCat && selectedPets.every((p) => (p.species ?? "").toLowerCase().includes("cat")) ? "hotel_cat" : "hotel_dog";

  const canSubmit = cust.data && petIds.length > 0 && checkInDate && checkOutDate && !submit.isPending;

  function togglePet(id: string) {
    setPetIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function onSubmit() {
    if (!cust.data) return;
    const startAt = dateToIso(checkInDate, checkInTime);
    if (!startAt) return;
    submit.mutate({
      serviceType: serviceType as any,
      petIds,
      startAt,
      endAt: dateToIso(checkOutDate, checkOutTime),
      notes,
      hotel: {
        accommodation_type: roomPref || null,
        feeding_instructions: dietMeds || null,
      },
    });
  }

  if (cust.isLoading) return <div className="grid flex-1 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <WizardShell
      title="Book Hotel & Cattery"
      subtitle="Pick your dates — your invoice is issued as soon as the stay is booked."
      footer={
        <button
          onClick={onSubmit}
          disabled={!canSubmit}
          className="rounded-lg bg-sk-coral px-5 py-2 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-50"
        >
          {submit.isPending ? "Booking…" : "Confirm booking"}
        </button>
      }
    >
      <Field label="Which pets?">
        <div className="flex flex-wrap gap-2">
          {(pets.data ?? []).map((p: any) => {
            const active = petIds.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => togglePet(p.id)}
                className={"rounded-full border px-3 py-1.5 text-sm " + (active ? "border-sk-coral bg-sk-coral-soft text-sk-coral-dark" : "border-border bg-white hover:bg-muted")}
              >
                {p.name} <span className="text-xs text-muted-foreground">· {p.species ?? "—"}</span>
              </button>
            );
          })}
          {(pets.data ?? []).length === 0 && <span className="text-xs text-muted-foreground">Add a pet under My Pets first.</span>}
        </div>
      </Field>

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Check-in date">
          <input type="date" value={checkInDate} onChange={(e) => setCheckInDate(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Check-in time">
          <input type="time" value={checkInTime} onChange={(e) => setCheckInTime(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Check-out date">
          <input type="date" value={checkOutDate} onChange={(e) => setCheckOutDate(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Check-out time">
          <input type="time" value={checkOutTime} onChange={(e) => setCheckOutTime(e.target.value)} className={inputCls} />
        </Field>
      </div>

      <Field label="Room preference (optional)" hint="Final room allocation is confirmed by our team.">
        <select value={roomPref} onChange={(e) => setRoomPref(e.target.value)} className={selectCls}>
          <option value="">No preference</option>
          {(rooms.data ?? []).map((r: any) => (
            <option key={r.id} value={r.name}>{r.name}{r.description ? ` — ${r.description}` : ""}</option>
          ))}
        </select>
      </Field>

      <Field label="Diet, medication or special care notes">
        <textarea rows={3} value={dietMeds} onChange={(e) => setDietMeds(e.target.value)} className={textareaCls} placeholder="e.g. twice-daily insulin, raw diet, senior food only…" />
      </Field>

      <Field label="Anything else we should know?">
        <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={textareaCls} />
      </Field>
    </WizardShell>
  );
}