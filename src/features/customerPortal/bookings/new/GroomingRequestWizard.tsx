import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useCurrentCustomer } from "../../hooks";
import { WizardShell, Field, inputCls, selectCls, textareaCls } from "./WizardShell";
import { usePortalPets, useGroomingPackages, useGroomingAddons } from "./wizardHooks";
import { dateToIso, useRequestSubmit } from "./useRequestSubmit";

interface Props { mode: "inhouse" | "mobile" }

export default function GroomingRequestWizard({ mode }: Props) {
  const cust = useCurrentCustomer();
  const pets = usePortalPets(cust.data?.id);
  const packages = useGroomingPackages(cust.data?.tenant_id);
  const addons = useGroomingAddons(cust.data?.tenant_id);
  const submit = useRequestSubmit();

  const [petId, setPetId] = useState("");
  const [date, setDate] = useState("");
  const [window, setWindow] = useState<"morning" | "afternoon" | "any">("any");
  const [packageId, setPackageId] = useState("");
  const [addonIds, setAddonIds] = useState<string[]>([]);
  const [addressLine, setAddressLine] = useState(cust.data?.address_line_1 ?? "");
  const [suburb, setSuburb] = useState(cust.data?.suburb ?? "");
  const [accessNotes, setAccessNotes] = useState("");
  const [notes, setNotes] = useState("");

  const canSubmit = cust.data && petId && date && (mode === "inhouse" || (addressLine && suburb)) && !submit.isPending;

  function toggleAddon(id: string) {
    setAddonIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

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
        addon_ids: addonIds,
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

      {(addons.data ?? []).length > 0 && (
        <Field label="Add-ons (optional)">
          <div className="flex flex-wrap gap-2">
            {(addons.data ?? []).map((a: any) => {
              const active = addonIds.includes(a.id);
              return (
                <button key={a.id} type="button" onClick={() => toggleAddon(a.id)}
                  className={"rounded-full border px-3 py-1.5 text-sm " + (active ? "border-sk-coral bg-sk-coral-soft text-sk-coral-dark" : "border-border bg-white hover:bg-muted")}>
                  {a.name} · R{Number(a.price_zar ?? 0).toFixed(0)}
                </button>
              );
            })}
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