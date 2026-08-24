import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useCurrentCustomer } from "../../hooks";
import { WizardShell, Field, inputCls, textareaCls } from "./WizardShell";
import { usePortalPets, useDaycarePlans } from "./wizardHooks";
import { dateToIso, useCreatePortalBooking } from "./useBookingSubmit";
import { usePhotoGateMode } from "@/features/bookings/PhotoGatePanel";
import { usePetPhotoStatus, isPhotoWaiverActive } from "@/features/pets/photoGateQueries";
import { PetsVaccinationGate, usePetsVaxBlocked } from "@/features/bookings/VaccinationGatePanel";
import { usePortalServiceGates } from "@/features/customerPortal/gatesQueries";
import { DaycareCapacityNotice, useDaycareDayAvailability, daycareDayFull } from "@/features/daycare/DaycareCapacityNotice";

const WEEKDAYS = [
  { code: "mon", label: "Mon" },
  { code: "tue", label: "Tue" },
  { code: "wed", label: "Wed" },
  { code: "thu", label: "Thu" },
  { code: "fri", label: "Fri" },
];

export default function DaycareRequestWizard() {
  const cust = useCurrentCustomer();
  const pets = usePortalPets(cust.data?.id);
  const plans = useDaycarePlans(cust.data?.tenant_id);
  const submit = useCreatePortalBooking();

  // Enrolments run from the 1st of the next month by default.
  const defaultStart = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString().slice(0, 10);
  }, []);

  const [petIds, setPetIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState(defaultStart);
  const [days, setDays] = useState<string[]>([]);
  const [assessDate, setAssessDate] = useState("");
  const [dropOffTime, setDropOffTime] = useState("07:30");
  const [planId, setPlanId] = useState("");
  const [assessment, setAssessment] = useState(false);
  const [notes, setNotes] = useState("");

  // Daycare needs a photo on file so staff can match the right dog at drop-off.
  const photoMode = usePhotoGateMode(cust.data?.tenant_id, assessment ? "daycare_assessment" : "daycare");
  const photoStatus = usePetPhotoStatus(petIds);
  const petsMissingPhoto = (pets.data ?? [])
    .filter((p: any) => petIds.includes(p.id))
    .filter((p: any) => {
      const s = photoStatus.data?.[p.id];
      return !s?.has_photo && !isPhotoWaiverActive(s?.waived_until);
    })
    .map((p: any) => p.name as string);
  const photoBlocked = photoMode === "hard" && petsMissingPhoto.length > 0;

  const vax = usePetsVaxBlocked(petIds, assessment ? "daycare_assessment" : "daycare", assessment ? assessDate : startDate);

  // Daily capacity gate — assessments land on one specific day, so we check that day.
  const gates = usePortalServiceGates(cust.data?.tenant_id);
  const capacityDay = assessment ? assessDate : startDate;
  const capacityQ = useDaycareDayAvailability({
    tenantId: cust.data?.tenant_id,
    start: capacityDay || null,
    end: capacityDay ? new Date(new Date(`${capacityDay}T00:00:00`).getTime() + 86400000).toISOString().slice(0, 10) : null,
    enabled: Boolean(capacityDay && petIds.length),
  });
  const dayFull = daycareDayFull(capacityQ.data, petIds.length);
  const capacityBlocked = assessment && dayFull;

  const canSubmit = Boolean(
    cust.data && petIds.length > 0 &&
    (assessment ? assessDate : startDate && planId),
  ) && !photoBlocked && !vax.blocked && !capacityBlocked && !submit.isPending;

  function togglePet(id: string) {
    setPetIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }
  function toggleDay(code: string) {
    setDays((prev) => (prev.includes(code) ? prev.filter((x) => x !== code) : [...prev, code]));
  }

  function onSubmit() {
    if (!cust.data) return;
    if (assessment) {
      const startAt = dateToIso(assessDate, dropOffTime);
      if (!startAt) return;
      submit.mutate({
        serviceType: "daycare_assessment" as any,
        petIds,
        startAt,
        notes,
      });
      return;
    }
    submit.mutate({
      serviceType: "daycare" as any,
      petIds,
      startAt: new Date(`${startDate}T07:30:00`).toISOString(),
      notes,
      daycare: {
        daycare_plan_id: planId || null,
        start_date: startDate,
        selected_days: days,
      },
    });
  }

  if (cust.isLoading) return <div className="grid flex-1 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <WizardShell
      title="Daycare enrolment"
      subtitle="Pick a plan and your days — billing runs monthly, in advance."
      footer={
        <button onClick={onSubmit} disabled={!canSubmit} className="rounded-lg bg-sk-coral px-5 py-2 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-50">
          {submit.isPending ? "Saving…" : assessment ? "Book assessment" : "Confirm enrolment"}
        </button>
      }
    >
      {petIds.length > 0 && (
        <PetsVaccinationGate
          petIds={petIds}
          serviceType={assessment ? "daycare_assessment" : "daycare"}
          onDate={assessment ? assessDate : startDate}
          mode="portal"
        />
      )}
      <Field label="Which dogs?">
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
          {(pets.data ?? []).length === 0 && <span className="text-xs text-muted-foreground">Add a pet under My Pets first.</span>}
        </div>
      </Field>

      {photoMode !== "off" && petsMissingPhoto.length > 0 && (
        <div
          className={
            "rounded-xl border p-3 text-sm " +
            (photoBlocked
              ? "border-sk-coral bg-sk-coral-soft text-sk-coral-dark"
              : "border-sk-orange bg-sk-orange-soft text-sk-orange")
          }
        >
          <div className="font-semibold">
            {photoBlocked ? "A photo is required before you can enrol" : "Photo still missing"}
          </div>
          <div className="text-xs opacity-90">
            We use it to match your dog at drop-off. Still needed for {petsMissingPhoto.join(", ")} — add it under My Pets.
          </div>
        </div>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={assessment} onChange={(e) => setAssessment(e.target.checked)} className="h-4 w-4 rounded border-border" />
        This is a first-time visit — please book an assessment.
      </label>

      {assessment ? (
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Assessment date"><input type="date" value={assessDate} onChange={(e) => setAssessDate(e.target.value)} className={inputCls} /></Field>
          <Field label="Drop-off time"><input type="time" value={dropOffTime} onChange={(e) => setDropOffTime(e.target.value)} className={inputCls} /></Field>
        </div>
      ) : (
        <>
          <Field label="Plan">
            <select value={planId} onChange={(e) => setPlanId(e.target.value)} className={inputCls}>
              <option value="">Select a plan…</option>
              {(plans.data ?? []).map((p: any) => (
                <option key={p.id} value={p.id}>{p.name} — R{Number(p.price ?? 0).toFixed(2)} / {p.billing_period}</option>
              ))}
            </select>
          </Field>

          <Field label="Which days?" hint="Optional — helps us plan the lanes.">
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((d) => {
                const active = days.includes(d.code);
                return (
                  <button key={d.code} type="button" onClick={() => toggleDay(d.code)}
                    className={"rounded-full border px-3 py-1.5 text-sm " + (active ? "border-sk-coral bg-sk-coral-soft text-sk-coral-dark" : "border-border bg-white hover:bg-muted")}>
                    {d.label}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="Start date" hint="Enrolments normally start on the 1st of the month.">
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputCls} />
          </Field>
        </>
      )}

      {capacityDay && petIds.length > 0 && (
        <DaycareCapacityNotice
          rows={capacityQ.data}
          petCount={petIds.length}
          blocked={capacityBlocked}
          loading={capacityQ.isLoading}
        />
      )}

      <Field label="Notes for our team"><textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={textareaCls} /></Field>
    </WizardShell>
  );
}