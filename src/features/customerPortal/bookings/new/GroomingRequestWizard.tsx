import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useCurrentCustomer } from "../../hooks";
import { WizardShell, Field, inputCls, selectCls, textareaCls } from "./WizardShell";
import { usePortalPets, useGroomingPackages } from "./wizardHooks";
import { useCreatePortalBooking } from "./useBookingSubmit";
import { GroomingInstructionsForm, type GroomingInstructionsValue } from "@/features/grooming/instructions/GroomingInstructionsForm";
import { usePetGroomingDefaults, useInstructionCatalog } from "@/features/grooming/instructions/queries";
import { useGroomingAddons } from "@/features/settings/groomingRateCardQueries";
import { useGroomingWorkflowSettings } from "@/features/grooming/workflowQueries";
import { GroomingSlotPicker } from "@/features/grooming/GroomingSlotPicker";
import { useGroomingDayAvailability } from "@/features/grooming/availabilityQueries";
import { layoutGroomingAppointments, type PetSlotRequest } from "@/features/grooming/multiPetSchedule";
import { effectivePetSize, petSizeToBand } from "@/features/pets/sizeUtils";
import { SizeOverrideBadge } from "@/features/pets/SizeOverrideControl";
import { AddressSelector } from "@/features/customers/AddressSelector";
import { PetsVaccinationGate, usePetsVaxBlocked } from "@/features/bookings/VaccinationGatePanel";

interface Props { mode: "inhouse" | "mobile" }

export default function GroomingRequestWizard({ mode }: Props) {
  const cust = useCurrentCustomer();
  const pets = usePortalPets(cust.data?.id);
  const packages = useGroomingPackages(cust.data?.tenant_id);
  const submit = useCreatePortalBooking();

  const [petIds, setPetIds] = useState<string[]>([]);
  const petId = petIds[0] ?? "";
  const [petPackages, setPetPackages] = useState<Record<string, string>>({});
  const [slotStart, setSlotStart] = useState<string | null>(null);
  const [slotEnd, setSlotEnd] = useState<string | null>(null);
  const [packageId, setPackageId] = useState("");
  const [treatments, setTreatments] = useState<Record<string, number>>({});
  const [serviceAddressId, setServiceAddressId] = useState<string | null>(null);
  const [accessNotes, setAccessNotes] = useState("");
  const [notes, setNotes] = useState("");
  const [stayPlay, setStayPlay] = useState(false);
  const [collectTime, setCollectTime] = useState("16:30");
  const [instructions, setInstructions] = useState<GroomingInstructionsValue>({
    selections: {}, medical_flags: [], notes: "",
  });
  const defaultsQ = usePetGroomingDefaults(petId || null);
  const catalogQ = useInstructionCatalog(cust.data?.tenant_id ?? null);
  const addonsQ = useGroomingAddons(cust.data?.tenant_id ?? undefined, { activeOnly: true });
  const wfQ = useGroomingWorkflowSettings(cust.data?.tenant_id ?? null);
  // Mobile grooming always carries the travel fee — show it up front.
  const travelFee = mode === "mobile" ? Number(wfQ.data?.default_mobile_travel_fee_zar ?? 0) : 0;
  const stayPlayAddon = (addonsQ.data ?? []).find((a: any) => a.code === "stay_play_after") ?? null;
  // Quick single treatments — bookable without a full package.
  const standaloneAddons = (addonsQ.data ?? []).filter((a) => a.bookable_standalone && a.code !== "stay_play_after");
  const selectedTreatments = standaloneAddons.filter((a) => treatments[a.id]);
  // Clear quick treatments when a package is picked (they're included / handled as instructions).
  useEffect(() => {
    if (packageId || Object.values(petPackages).some(Boolean)) setTreatments({});
  }, [packageId, petPackages]);
  const selectedPets = (pets.data ?? []).filter((p: any) => petIds.includes(p.id));
  const selectedPet = selectedPets[0] ?? null;
  const multiPet = petIds.length > 1;
  const petBand = petSizeToBand(effectivePetSize(selectedPet as any));
  function packagesForPet(pet: any) {
    const band = petSizeToBand(effectivePetSize(pet));
    return (packages.data ?? []).filter((p: any) => (!band ? true : !p.size_band || p.size_band === band));
  }
  const filteredPackages = selectedPet ? packagesForPet(selectedPet) : (packages.data ?? []);
  /** The package chosen for a given dog (single-dog flow uses the shared picker). */
  function packageForPet(id: string) {
    return multiPet ? petPackages[id] || "" : packageId;
  }
  function minutesForPet(id: string) {
    const pkg = (packages.data ?? []).find((p: any) => p.id === packageForPet(id));
    const pkgMins = pkg ? Number(pkg.expected_minutes) || 60 : 0;
    const treatMins = selectedTreatments.reduce(
      (s, a) => s + Number(a.duration_minutes ?? 0) * (treatments[a.id] || 1), 0,
    );
    return Math.max(15, pkgMins + treatMins) || 60;
  }

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

  // Running estimate: package price + any add-ons triggered by the chosen instructions.
  const estimate = useMemo(() => {
    const dogCount = Math.max(1, petIds.length);
    const chosenPkgs = (petIds.length ? petIds : [""])
      .map((id) => (packages.data ?? []).find((p: any) => p.id === packageForPet(id)))
      .filter(Boolean) as any[];
    const base = chosenPkgs.reduce((s, p) => s + Number(p.price_zar ?? 0), 0);
    const priceByCode = new Map<string, number>();
    for (const a of addonsQ.data ?? []) priceByCode.set(a.code, Number(a.price_zar));
    const options = catalogQ.data?.options ?? [];
    const groups = catalogQ.data?.groups ?? [];
    const extras: { label: string; price: number }[] = [];
    for (const g of groups) {
      const val = instructions.selections[g.code];
      const codes = Array.isArray(val) ? (val as string[]) : typeof val === "string" ? [val] : [];
      for (const code of codes) {
        const opt = options.find((o) => o.group_id === g.id && o.code === code);
        const unit = opt?.addon_code ? priceByCode.get(opt.addon_code) ?? 0 : 0;
        const price = unit * dogCount;
        if (price > 0) extras.push({ label: dogCount > 1 ? `${opt!.label} × ${dogCount} dogs` : opt!.label, price });
      }
    }
    const extrasTotal = extras.reduce((s, e) => s + e.price, 0);
    const treatmentTotal = selectedTreatments.reduce(
      (s, a) => s + Number(a.price_zar) * (treatments[a.id] || 1) * dogCount, 0,
    );
    for (const a of selectedTreatments) {
      extras.push({
        label: dogCount > 1 ? `${a.name} × ${dogCount} dogs` : a.name,
        price: Number(a.price_zar) * (treatments[a.id] || 1) * dogCount,
      });
    }
    const spPrice = stayPlay && stayPlayAddon ? Number(stayPlayAddon.price_zar) * dogCount : 0;
    if (spPrice > 0) {
      extras.push({ label: dogCount > 1 ? `${stayPlayAddon!.name} × ${dogCount} dogs` : stayPlayAddon!.name, price: spPrice });
    }
    if (travelFee > 0) extras.push({ label: "Mobile grooming travel fee", price: travelFee });
    return {
      base,
      extras,
      total: base + extrasTotal + treatmentTotal + spPrice + travelFee,
      hasPackage: chosenPkgs.length > 0,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packages.data, petIds, petPackages, packageId, addonsQ.data, catalogQ.data, instructions.selections, stayPlay, stayPlayAddon, treatments, travelFee]);

  // Appointment length = package time + each treatment's own time.
  const durationMinutes = useMemo(() => {
    return petId ? minutesForPet(petId) : 60;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petId, packages.data, packageId, petPackages, treatments, addonsQ.data]);

  // Multi-dog: one appointment per dog, run in parallel where a groomer is free.
  const petSlotRequests: PetSlotRequest[] = useMemo(
    () => petIds.map((id) => ({ petId: id, durationMinutes: minutesForPet(id) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [petIds, packages.data, packageId, petPackages, treatments, addonsQ.data],
  );
  const slotDayKey = slotStart ? slotStart.slice(0, 10) : null;
  const availQ = useGroomingDayAvailability(multiPet ? cust.data?.tenant_id ?? null : null, slotDayKey);
  const plan = useMemo(() => {
    if (!multiPet || !slotStart) return null;
    return layoutGroomingAppointments({
      resources: availQ.data?.resources ?? [],
      busy: availQ.data?.busy ?? [],
      baseStart: new Date(slotStart),
      pets: petSlotRequests,
    });
  }, [multiPet, slotStart, availQ.data, petSlotRequests]);

  const anyPackageChosen = multiPet ? petIds.some((id) => Boolean(petPackages[id])) : Boolean(packageId);
  const packageRequired = (packages.data ?? []).length > 0 && selectedTreatments.length === 0;
  const allPetsHavePackages = !packageRequired || petIds.every((id) => Boolean(packageForPet(id)));
  const vaxService = mode === "inhouse" ? "grooming_inhouse" : "grooming_mobile";
  const vax = usePetsVaxBlocked(petIds, vaxService, slotDayKey);
  const canSubmit =
    Boolean(
      cust.data && petIds.length > 0 && slotStart &&
      allPetsHavePackages &&
      (!multiPet || plan) &&
      (mode === "inhouse" || serviceAddressId),
    ) && !vax.blocked && !submit.isPending;

  function onSubmit() {
    if (!cust.data || !slotStart) return;
    const groomingCommon = {
      addons: selectedTreatments.map((a) => ({ code: a.code, qty: treatments[a.id] || 1 })),
      instructions: {
        selections: instructions.selections,
        medical_flags: instructions.medical_flags,
        notes: instructions.notes,
      },
      ...(mode === "mobile" ? { access_notes: accessNotes || null } : {}),
      ...(mode === "inhouse" ? { stay_play: stayPlay, stay_play_collect_time: stayPlay ? collectTime : null } : {}),
    };

    if (multiPet && plan) {
      submit.mutate({
        serviceType: mode === "inhouse" ? "grooming_inhouse" : "grooming_mobile",
        petIds,
        startAt: new Date(slotStart).toISOString(),
        endAt: null,
        notes,
        service_address_id: serviceAddressId,
        grooming: {
          ...groomingCommon,
          pets: plan.map((s) => ({
            pet_id: s.petId,
            package_id: packageForPet(s.petId) || null,
            duration_minutes: Math.round((s.end.getTime() - s.start.getTime()) / 60000),
            start_at: s.start.toISOString(),
          })),
        },
      });
      return;
    }

    submit.mutate({
      serviceType: mode === "inhouse" ? "grooming_inhouse" : "grooming_mobile",
      petIds: [petId],
      startAt: new Date(slotStart).toISOString(),
      endAt: slotEnd ? new Date(slotEnd).toISOString() : null,
      notes,
      service_address_id: serviceAddressId,
      grooming: {
        ...groomingCommon,
        package_id: packageId || null,
        duration_minutes: durationMinutes,
      },
    });
  }

  if (cust.isLoading) return <div className="grid flex-1 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <WizardShell
      title={mode === "inhouse" ? "Book in-house grooming" : "Book mobile grooming"}
      subtitle={mode === "inhouse" ? "Spa day at the salon." : "We bring the van to your door."}
      footer={
        <button onClick={onSubmit} disabled={!canSubmit} className="rounded-lg bg-sk-coral px-5 py-2 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-50">
          {submit.isPending ? "Booking…" : "Confirm booking"}
        </button>
      }
    >
      {petIds.length > 0 && (
        <PetsVaccinationGate petIds={petIds} serviceType={vaxService} onDate={slotDayKey} mode="portal" />
      )}
      <Field label={(pets.data ?? []).length > 1 ? "Which dogs are coming?" : "Pet"}>
        <div className="space-y-2">
          {(pets.data ?? []).map((p: any) => {
            const checked = petIds.includes(p.id);
            return (
              <label key={p.id} className="flex items-center gap-3 rounded-lg border border-border bg-white px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={checked}
                  onChange={(e) =>
                    setPetIds((prev) => (e.target.checked ? [...prev, p.id] : prev.filter((id) => id !== p.id)))
                  }
                />
                <span className="flex-1 font-medium">{p.name}</span>
                {p.size_override && <SizeOverrideBadge pet={p} />}
              </label>
            );
          })}
          {(pets.data ?? []).length === 0 && (
            <p className="text-xs text-muted-foreground">No pets on your profile yet.</p>
          )}
        </div>
        {multiPet && (
          <p className="mt-1 text-[11px] text-muted-foreground">
            Each dog gets their own appointment — they'll run side by side if two groomers are free,
            otherwise one after the other. Everything lands on a single invoice.
          </p>
        )}
      </Field>

      <Field label="Pick a date & time">
        <GroomingSlotPicker
          tenantId={cust.data?.tenant_id ?? null}
          value={slotStart}
          durationMinutes={durationMinutes}
          petSlots={multiPet ? petSlotRequests : undefined}
          onChange={(s, e) => { setSlotStart(s); setSlotEnd(e); }}
        />
      </Field>

      {multiPet ? (
        <Field label="Package for each dog">
          <div className="space-y-3">
            {selectedPets.map((p: any) => {
              const opts = packagesForPet(p);
              const band = petSizeToBand(effectivePetSize(p));
              return (
                <div key={p.id}>
                  <div className="mb-1 text-xs font-medium">
                    {p.name}{band ? ` (${band.toUpperCase()})` : ""}
                  </div>
                  <select
                    value={petPackages[p.id] ?? ""}
                    onChange={(e) => setPetPackages((prev) => ({ ...prev, [p.id]: e.target.value }))}
                    className={selectCls}
                  >
                    <option value="">Select a package…</option>
                    {opts.map((op: any) => (
                      <option key={op.id} value={op.id}>{op.name} — R{Number(op.price_zar ?? 0).toFixed(2)}</option>
                    ))}
                  </select>
                  {opts.length === 0 && (
                    <div className="mt-1 text-[11px] text-sk-orange">No packages match {p.name}'s size. Staff will confirm the right option.</div>
                  )}
                </div>
              );
            })}
          </div>
        </Field>
      ) : (
        <Field label={petBand ? `Package for ${selectedPet?.name ?? "your pet"} (${petBand.toUpperCase()})` : "Package"}>
          <select value={packageId} onChange={(e) => setPackageId(e.target.value)} className={selectCls}>
            <option value="">Select a package…</option>
            {filteredPackages.map((p: any) => (
              <option key={p.id} value={p.id}>{p.name} — R{Number(p.price_zar ?? 0).toFixed(2)}</option>
            ))}
          </select>
          {petBand && filteredPackages.length === 0 && (
            <div className="mt-1 text-[11px] text-sk-orange">No packages match {selectedPet?.name}'s size. Staff will confirm the right option.</div>
          )}
        </Field>
      )}

      {multiPet && slotStart && (
        <Field label="Running order">
          {plan ? (
            <div className="space-y-1 rounded-lg border border-border bg-white p-3 text-sm">
              {plan.map((s) => {
                const p = selectedPets.find((x: any) => x.id === s.petId);
                return (
                  <div key={s.petId} className="flex items-center justify-between gap-3">
                    <span className="font-medium">{p?.name ?? "Dog"}</span>
                    <span className="text-muted-foreground">
                      {s.start.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: false })}
                      –{s.end.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: false })}
                      {s.resourceName ? ` · ${s.resourceName}` : ""}
                      {s.chained ? " · after the first dog" : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg border border-sk-orange/40 bg-sk-orange/10 p-3 text-sm text-sk-orange">
              We can't fit all {petIds.length} dogs from that time — please pick an earlier slot or another day.
            </div>
          )}
        </Field>
      )}

      {!anyPackageChosen && standaloneAddons.length > 0 && (
        <Field label="Or book a quick treatment on its own">
          <div className="space-y-2">
            {standaloneAddons.map((a) => (
              <label key={a.id} className="flex items-center gap-3 rounded-lg border border-border bg-white px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={Boolean(treatments[a.id])}
                  onChange={(e) =>
                    setTreatments((prev) => {
                      const next = { ...prev };
                      if (e.target.checked) next[a.id] = 1; else delete next[a.id];
                      return next;
                    })
                  }
                />
                <span className="flex-1 font-medium">{a.name}</span>
                <span className="text-xs text-muted-foreground">
                  R{Number(a.price_zar).toFixed(2)}{a.duration_minutes ? ` · ${a.duration_minutes} min` : ""}
                </span>
              </label>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            No package needed — pick one or more quick treatments and we'll book the right amount of time.
          </p>
        </Field>
      )}

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
          <AddressSelector
            customerId={cust.data?.id}
            tenantId={cust.data?.tenant_id}
            value={serviceAddressId}
            onChange={setServiceAddressId}
            label="Where should the van come?"
            mobileOnly
            allowManual={false}
          />
          <Field label="Access / parking notes"><textarea rows={2} value={accessNotes} onChange={(e) => setAccessNotes(e.target.value)} className={textareaCls} placeholder="Gate code, where to park, dogs at home, etc." /></Field>
        </>
      )}

      <Field label="Notes for our team"><textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={textareaCls} /></Field>

      {mode === "inhouse" && stayPlayAddon && (
        <Field label="After-groom Stay &amp; Play">
          <label className="flex items-start gap-3 rounded-lg border border-border bg-white p-3 text-sm">
            <input type="checkbox" checked={stayPlay} onChange={(e) => setStayPlay(e.target.checked)} className="mt-0.5" />
            <span>
              <span className="font-medium">Keep {selectedPet?.name ?? "my pet"} for Stay &amp; Play after the groom</span>
              <span className="block text-xs text-muted-foreground">
                Supervised play in daycare until you collect — R{Number(stayPlayAddon.price_zar).toFixed(2)}.
              </span>
            </span>
          </label>
          {stayPlay && (
            <div className="mt-2 flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Collection time</span>
              <input type="time" value={collectTime} onChange={(e) => setCollectTime(e.target.value)}
                className="h-9 rounded-lg border border-border px-2 text-sm" />
            </div>
          )}
        </Field>
      )}

      {(estimate.hasPackage || estimate.extras.length > 0) && (
        <div className="rounded-lg border border-sk-coral-soft bg-sk-coral-soft/40 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-sk-coral-dark">Estimated total</div>
          <div className="mt-2 space-y-1 text-sm">
            {estimate.hasPackage && (
              <div className="flex justify-between"><span>Package</span><span>R{estimate.base.toFixed(2)}</span></div>
            )}
            {estimate.extras.map((e, i) => (
              <div key={i} className="flex justify-between text-muted-foreground"><span>{e.label}</span><span>+R{e.price.toFixed(2)}</span></div>
            ))}
            <div className="flex justify-between border-t border-sk-coral-soft pt-1 font-semibold">
              <span>Total</span><span>R{estimate.total.toFixed(2)}</span>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Your invoice is issued as soon as the booking is confirmed. Extras such as matting or
            sedation are added by our team on the day if needed.
          </p>
        </div>
      )}
    </WizardShell>
  );
}