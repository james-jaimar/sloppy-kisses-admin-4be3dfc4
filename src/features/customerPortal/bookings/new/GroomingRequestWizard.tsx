import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useCurrentCustomer } from "../../hooks";
import { WizardShell, Field, inputCls, selectCls, textareaCls } from "./WizardShell";
import { usePortalPets, useGroomingPackages } from "./wizardHooks";
import { dateToIso, useRequestSubmit } from "./useRequestSubmit";
import { GroomingInstructionsForm, type GroomingInstructionsValue } from "@/features/grooming/instructions/GroomingInstructionsForm";
import { usePetGroomingDefaults } from "@/features/grooming/instructions/queries";

interface Props { mode: "inhouse" | "mobile" }

export default function GroomingRequestWizard({ mode }: Props) {
  const cust = useCurrentCustomer();
  const pets = usePortalPets(cust.data?.id);
  const packages = useGroomingPackages(cust.data?.tenant_id);
  const submit = useRequestSubmit();

  const [petId, setPetId] = useState("");
  const [date, setDate] = useState("");
  const [window, setWindow] = useState<"morning" | "afternoon" | "any">("any");
  const [packageId, setPackageId] = useState("");
  const [addressLine, setAddressLine] = useState(cust.data?.address_line_1 ?? "");
  const [suburb, setSuburb] = useState(cust.data?.suburb ?? "");
  const [accessNotes, setAccessNotes] = useState("");
  const [notes, setNotes] = useState("");
  const [instructions, setInstructions] = useState<GroomingInstructionsValue>({
    selections: {}, medical_flags: [], notes: "",
  });
  const defaultsQ = usePetGroomingDefaults(petId || null);

  // Seed instructions from selected pet's saved defaults whenever the pet changes.
  useEffect(() => {
    if (!petId) {
      setInstructions({ selections: {}, medical_flags: [], notes: "" });
      return;
    }
    if (defaultsQ.data) {
      setInstructions({
        selections: defaultsQ.data.selections ?? {},
        medical_flags: defaultsQ.data.medical_flags ?? [],
        notes: defaultsQ.data.notes ?? "",
      });
    } else if (defaultsQ.isFetched) {
      setInstructions({ selections: {}, medical_flags: [], notes: "" });
    }
  }, [petId, defaultsQ.data, defaultsQ.isFetched]);

  const canSubmit = cust.data && petId && date && (mode === "inhouse" || (addressLine && suburb)) && !submit.isPending;

  function onSubmit() {
    if (!cust.data) return;
    const startTime = window === "morning" ? "09:00" : window === "afternoon" ? "13:00" : "10:00";
    submit.mutate({
      tenantId: cust.data.tenant_id,
      customerId: cust.data.id,
      serviceType: mode === "inhouse" ? "grooming_inhouse" : "grooming_mobile",
      petId,
      preferredStartAt: dateToIso(date, startTime),
      preferredEndAt: null,
      customerNotes: notes,
      requestPayload: {
        time_window: window,
        package_id: packageId || null,
        instructions: {
          selections: instructions.selections,
          medical_flags: instructions.medical_flags,
          notes: instructions.notes,
        },
        ...(mode === "mobile" ? {
          service_address: {
            line_1: addressLine,
            suburb,
          },
          access_notes: accessNotes || null,
        } : {}),
      },
    });
  }

  if (cust.isLoading) return <div className="grid flex-1 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <WizardShell
      title={mode === "inhouse" ? "In-house grooming request" : "Mobile grooming request"}
      subtitle={mode === "inhouse" ? "Spa day at the salon." : "We bring the van to your door."}
      footer={
        <button onClick={onSubmit} disabled={!canSubmit} className="rounded-lg bg-sk-coral px-5 py-2 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-50">
          {submit.isPending ? "Sending…" : "Send request"}
        </button>
      }
    >
      <Field label="Pet">
        <select value={petId} onChange={(e) => setPetId(e.target.value)} className={selectCls}>
          <option value="">Select pet…</option>
          {(pets.data ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Field>

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Preferred date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} /></Field>
        <Field label="Preferred time">
          <select value={window} onChange={(e) => setWindow(e.target.value as any)} className={selectCls}>
            <option value="any">Any time</option>
            <option value="morning">Morning</option>
            <option value="afternoon">Afternoon</option>
          </select>
        </Field>
      </div>

      <Field label="Package (optional)">
        <select value={packageId} onChange={(e) => setPackageId(e.target.value)} className={selectCls}>
          <option value="">Let staff recommend</option>
          {(packages.data ?? []).map((p: any) => (
            <option key={p.id} value={p.id}>{p.name} — R{Number(p.price_zar ?? 0).toFixed(2)}</option>
          ))}
        </select>
      </Field>

      {petId && (
        <Field label="Grooming instructions">
          <div className="rounded-lg border border-border bg-white p-3">
            {defaultsQ.data && (
              <p className="mb-2 text-[11px] text-muted-foreground">Prefilled from this pet's saved defaults — tweak for this visit if you like.</p>
            )}
            <GroomingInstructionsForm
              tenantId={cust.data?.tenant_id ?? null}
              value={instructions}
              onChange={setInstructions}
              compact
            />
          </div>
        </Field>
      )}

      {mode === "mobile" && (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Service address"><input value={addressLine} onChange={(e) => setAddressLine(e.target.value)} className={inputCls} placeholder="Street & number" /></Field>
            <Field label="Suburb"><input value={suburb} onChange={(e) => setSuburb(e.target.value)} className={inputCls} /></Field>
          </div>
          <Field label="Access / parking notes"><textarea rows={2} value={accessNotes} onChange={(e) => setAccessNotes(e.target.value)} className={textareaCls} placeholder="Gate code, where to park, dogs at home, etc." /></Field>
        </>
      )}

      <Field label="Notes for our team"><textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={textareaCls} /></Field>
    </WizardShell>
  );
}