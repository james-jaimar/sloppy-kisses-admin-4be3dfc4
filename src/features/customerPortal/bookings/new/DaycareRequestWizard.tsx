import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useCurrentCustomer } from "../../hooks";
import { WizardShell, Field, inputCls, textareaCls } from "./WizardShell";
import { usePortalPets, useDaycarePlans } from "./wizardHooks";
import { dateToIso, useRequestSubmit } from "./useRequestSubmit";

export default function DaycareRequestWizard() {
  const cust = useCurrentCustomer();
  const pets = usePortalPets(cust.data?.id);
  const plans = useDaycarePlans(cust.data?.tenant_id);
  const submit = useRequestSubmit();

  const [petIds, setPetIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [dropOffTime, setDropOffTime] = useState("07:30");
  const [pickUpTime, setPickUpTime] = useState("17:30");
  const [planId, setPlanId] = useState("");
  const [assessment, setAssessment] = useState(false);
  const [notes, setNotes] = useState("");

  const canSubmit = cust.data && petIds.length > 0 && startDate && !submit.isPending;

  function togglePet(id: string) {
    setPetIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function onSubmit() {
    if (!cust.data) return;
    const endD = endDate || startDate;
    submit.mutate({
      tenantId: cust.data.tenant_id,
      customerId: cust.data.id,
      serviceType: assessment ? "daycare_assessment" : "daycare",
      petId: petIds[0] ?? null,
      preferredStartAt: dateToIso(startDate, dropOffTime),
      preferredEndAt: dateToIso(endD, pickUpTime),
      customerNotes: notes,
      requestPayload: {
        pet_ids: petIds,
        date_range: endDate && endDate !== startDate ? { from: startDate, to: endDate } : null,
        daycare_plan_id: planId || null,
        assessment_requested: assessment,
      },
    });
  }

  if (cust.isLoading) return <div className="grid flex-1 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <WizardShell
      title="Daycare request"
      subtitle="Book a day (or a range of days) of play."
      footer={
        <button onClick={onSubmit} disabled={!canSubmit} className="rounded-lg bg-sk-coral px-5 py-2 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-50">
          {submit.isPending ? "Sending…" : "Send request"}
        </button>
      }
    >
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

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Start date"><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputCls} /></Field>
        <Field label="End date (optional)" hint="Leave blank for a single day."><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputCls} /></Field>
        <Field label="Drop-off time"><input type="time" value={dropOffTime} onChange={(e) => setDropOffTime(e.target.value)} className={inputCls} /></Field>
        <Field label="Pick-up time"><input type="time" value={pickUpTime} onChange={(e) => setPickUpTime(e.target.value)} className={inputCls} /></Field>
      </div>

      {(plans.data ?? []).length > 0 && (
        <Field label="Plan / day-pack (optional)">
          <select value={planId} onChange={(e) => setPlanId(e.target.value)} className={inputCls}>
            <option value="">Ad-hoc day</option>
            {(plans.data ?? []).map((p: any) => (
              <option key={p.id} value={p.id}>{p.name} — R{Number(p.price ?? 0).toFixed(2)} / {p.billing_period}</option>
            ))}
          </select>
        </Field>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={assessment} onChange={(e) => setAssessment(e.target.checked)} className="h-4 w-4 rounded border-border" />
        This is a first-time visit — please book an assessment.
      </label>

      <Field label="Notes for our team"><textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={textareaCls} /></Field>
    </WizardShell>
  );
}