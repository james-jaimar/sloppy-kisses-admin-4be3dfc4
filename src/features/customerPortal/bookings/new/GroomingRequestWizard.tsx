import { useEffect, useMemo, useState } from "react";
import { Loader2, MapPin, Plus } from "lucide-react";
import { useCurrentCustomer } from "../../hooks";
import { WizardShell, Field, inputCls, selectCls, textareaCls } from "./WizardShell";
import { usePortalPets, useGroomingPackages } from "./wizardHooks";
import { useCreatePortalBooking } from "./useBookingSubmit";
import { GroomingInstructionsForm, type GroomingInstructionsValue } from "@/features/grooming/instructions/GroomingInstructionsForm";
import { usePetGroomingDefaults, useInstructionCatalog } from "@/features/grooming/instructions/queries";
import { useGroomingAddons } from "@/features/settings/groomingRateCardQueries";
import { GroomingSlotPicker } from "@/features/grooming/GroomingSlotPicker";
import { effectivePetSize, petSizeToBand } from "@/features/pets/sizeUtils";
import { SizeOverrideBadge } from "@/features/pets/SizeOverrideControl";
import { useCustomerAddresses } from "@/features/customers/addressQueries";
import AddressFormDrawer from "@/features/customers/AddressFormDrawer";

interface Props { mode: "inhouse" | "mobile" }

export default function GroomingRequestWizard({ mode }: Props) {
  const cust = useCurrentCustomer();
  const pets = usePortalPets(cust.data?.id);
  const packages = useGroomingPackages(cust.data?.tenant_id);
  const submit = useCreatePortalBooking();

  const [petId, setPetId] = useState("");
  const [slotStart, setSlotStart] = useState<string | null>(null);
  const [slotEnd, setSlotEnd] = useState<string | null>(null);
  const [packageId, setPackageId] = useState("");
  const [serviceAddressId, setServiceAddressId] = useState<string | null>(null);
  const [showAddressDrawer, setShowAddressDrawer] = useState(false);
  const [accessNotes, setAccessNotes] = useState("");
  const [notes, setNotes] = useState("");
  const [stayPlay, setStayPlay] = useState(false);
  const [collectTime, setCollectTime] = useState("16:30");
  const [instructions, setInstructions] = useState<GroomingInstructionsValue>({
    selections: {}, medical_flags: [], notes: "",
  });
  const addressesQ = useCustomerAddresses(cust.data?.id ?? null, cust.data?.tenant_id ?? null);
  const defaultsQ = usePetGroomingDefaults(petId || null);
  const catalogQ = useInstructionCatalog(cust.data?.tenant_id ?? null);
  const addonsQ = useGroomingAddons(cust.data?.tenant_id ?? undefined, { activeOnly: true });
  const stayPlayAddon = (addonsQ.data ?? []).find((a: any) => a.code === "stay_play_after") ?? null;
  const selectedPet = (pets.data ?? []).find((p: any) => p.id === petId) ?? null;
  const petBand = petSizeToBand(effectivePetSize(selectedPet as any));
  const filteredPackages = (packages.data ?? []).filter((p: any) => {
    if (!petBand) return true;
    return !p.size_band || p.size_band === petBand;
  });

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
    const pkg = filteredPackages.find((p: any) => p.id === packageId);
    const base = Number(pkg?.price_zar ?? 0);
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
        const price = opt?.addon_code ? priceByCode.get(opt.addon_code) ?? 0 : 0;
        if (price > 0) extras.push({ label: opt!.label, price });
      }
    }
    const extrasTotal = extras.reduce((s, e) => s + e.price, 0);
    const spPrice = stayPlay && stayPlayAddon ? Number(stayPlayAddon.price_zar) : 0;
    if (spPrice > 0) extras.push({ label: stayPlayAddon!.name, price: spPrice });
    return { base, extras, total: base + extrasTotal + spPrice, hasPackage: Boolean(pkg) };
  }, [filteredPackages, packageId, addonsQ.data, catalogQ.data, instructions.selections, stayPlay, stayPlayAddon]);

  const packageRequired = filteredPackages.length > 0;
  const canSubmit =
    Boolean(
      cust.data && petId && slotStart &&
      (!packageRequired || packageId) &&
      (mode === "inhouse" || serviceAddressId),
    ) && !submit.isPending;

  function onSubmit() {
    if (!cust.data || !slotStart) return;
    submit.mutate({
      serviceType: mode === "inhouse" ? "grooming_inhouse" : "grooming_mobile",
      petIds: [petId],
      startAt: new Date(slotStart).toISOString(),
      endAt: slotEnd ? new Date(slotEnd).toISOString() : null,
      notes,
      service_address_id: serviceAddressId,
      grooming: {
        package_id: packageId || null,
        duration_minutes: 60,
        instructions: {
          selections: instructions.selections,
          medical_flags: instructions.medical_flags,
          notes: instructions.notes,
        },
        ...(mode === "mobile" ? {
          access_notes: accessNotes || null,
        } : {}),
        ...(mode === "inhouse" ? { stay_play: stayPlay, stay_play_collect_time: stayPlay ? collectTime : null } : {}),
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
      <Field label="Pet">
        <select value={petId} onChange={(e) => setPetId(e.target.value)} className={selectCls}>
          <option value="">Select pet…</option>
          {(pets.data ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {selectedPet && (selectedPet as any).size_override && (
          <div className="mt-2"><SizeOverrideBadge pet={selectedPet as any} /></div>
        )}
      </Field>

      <Field label="Pick a date & time">
        <GroomingSlotPicker
          tenantId={cust.data?.tenant_id ?? null}
          value={slotStart}
          durationMinutes={60}
          onChange={(s, e) => { setSlotStart(s); setSlotEnd(e); }}
        />
      </Field>

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
          <Field label="Service address">
            <div className="space-y-2">
              {(addressesQ.data ?? []).length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
                  You don't have any saved addresses yet.
                </div>
              ) : (
                <div className="grid gap-2">
                  {(addressesQ.data ?? []).map((a: any) => (
                    <label
                      key={a.id}
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm ${serviceAddressId === a.id ? "border-sk-coral bg-sk-coral-soft" : "border-border bg-white"}`}
                    >
                      <input
                        type="radio"
                        name="service_address"
                        value={a.id}
                        checked={serviceAddressId === a.id}
                        onChange={() => setServiceAddressId(a.id)}
                        className="mt-0.5"
                      />
                      <span className="flex-1">
                        <span className="font-medium">{a.label}</span>
                        <span className="block text-muted-foreground">{a.formatted_address}</span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={() => setShowAddressDrawer(true)}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-sk-coral hover:underline"
              >
                <Plus className="h-4 w-4" /> Add a new address
              </button>
            </div>
          </Field>
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
      {cust.data && showAddressDrawer && (
        <AddressFormDrawer
          customerId={cust.data.id}
          tenantId={cust.data.tenant_id}
          onClose={() => setShowAddressDrawer(false)}
          onSave={async (addr) => {
            setServiceAddressId(addr.id);
            setShowAddressDrawer(false);
            await addressesQ.refetch();
          }}
        />
      )}
    </WizardShell>
  );
}