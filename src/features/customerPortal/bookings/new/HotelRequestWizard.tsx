import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase/client";
import { useCurrentCustomer } from "../../hooks";
import { Button } from "@/components/ui/button";
import { AppHeader } from "@/components/layout/AppHeader";
import { BookingPhotos, AwardPlaceholder } from "@/features/publicBooking/BookingPhotos";
import { HotelAccommodationChoices, HotelStaySummary } from "@/features/publicBooking/HotelBookingPresentation";
import { readHotelDraft, clearHotelDraft, matchDraftPets } from "@/features/publicBooking/hotelDraft";
import { usePublicHotelRates } from "@/features/publicBooking/publicBookingQueries";
import { Field, inputCls, selectCls } from "./WizardShell";
import { PetsVaccinationGate, usePetsVaxBlocked } from "@/features/bookings/VaccinationGatePanel";
import { usePortalServiceGates } from "@/features/customerPortal/gatesQueries";
import { HouseCapacityNotice, useHotelHouseAvailability, fullNights } from "@/features/hotelCattery/HouseCapacityNotice";

import { usePortalPets, useResources } from "./wizardHooks";
import { dateToIso, useCreatePortalBooking } from "./useBookingSubmit";
import {
  AcknowledgementSection,
  AttachmentsSection,
  CareSection,
  EmergencySection,
  OwnerSection,
  PetSections,
  StayWindowSection,
  VetSection,
  buildAccommodationForm,
  syncFormPets,
  emptyAccommodationForm,
} from "@/features/hotelForm/AccommodationFields";
import {
  useAccommodationCustomer,
  useAccommodationPets,
  useAccommodationWriteBack,
} from "@/features/hotelForm/prefillQueries";
import {
  CHECK_IN_TIME,
  checkOutTimeFor,
  checkOutWindowsFor,
  type AccommodationFormPayload,
} from "@/features/hotelForm/accommodationForm";
import { GuidelinesSection } from "@/features/hotelForm/GuidelinesSection";
import { useHotelGuidelines } from "@/features/hotelForm/guidelinesQueries";
import { usePhotoGateMode } from "@/features/bookings/PhotoGatePanel";
import { usePetPhotoStatus, isPhotoWaiverActive } from "@/features/pets/photoGateQueries";
import {
  useHotelRateCards,
  SIZE_BAND_ORDER,
  type PetSizeBand,
} from "@/features/settings/hotelRateCardQueries";

const STEPS = ["Stay", "Your details", "Pet details", "Care & consent"];

const fmtZar = (n: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", minimumFractionDigits: 2 }).format(n);

function bandIndex(b: PetSizeBand | null | undefined) {
  return b ? SIZE_BAND_ORDER.indexOf(b) : -1;
}

function rateAllowsSize(
  r: { min_size_band: PetSizeBand | null; max_size_band: PetSizeBand | null },
  size: PetSizeBand | null,
) {
  if (!r.min_size_band && !r.max_size_band) return true;
  if (!size) return false;
  const idx = bandIndex(size);
  const lo = r.min_size_band ? bandIndex(r.min_size_band) : 0;
  const hi = r.max_size_band ? bandIndex(r.max_size_band) : SIZE_BAND_ORDER.length - 1;
  return idx >= lo && idx <= hi;
}

function addDays(date: string, days: number): string {
  if (!date) return "";
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function nightsBetween(a: string, b: string): number {
  if (!a || !b) return 1;
  const ms = new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime();
  return Math.max(1, Math.round(ms / 86400000));
}

export default function HotelRequestWizard() {
  const cust = useCurrentCustomer();
  const pets = usePortalPets(cust.data?.id);
  const rooms = useResources(cust.data?.tenant_id, ["hotel_area", "cattery_area"]);
  const submit = useCreatePortalBooking();
  const nav = useNavigate();
  const [savingQuote, setSavingQuote] = useState(false);
  const [params] = useSearchParams();
  const [draft] = useState(() => params.get("from") === "public" ? readHotelDraft() : null);
  const [draftImported, setDraftImported] = useState(false);
  const [unmatchedPets, setUnmatchedPets] = useState<string[]>([]);
  const [requestedExtras, setRequestedExtras] = useState<Record<string, number>>({});
  const extrasCatalog = usePublicHotelRates(cust.data?.tenant_id);

  useEffect(() => {
    if (draftImported || !draft || !cust.data || !pets.data) return;
    setDraftImported(true);
    if (draft.tenantId !== cust.data.tenant_id) return;
    const { matches, unmatched } = matchDraftPets(draft.pets, pets.data);
    setCheckInDate(draft.checkIn);
    setNights(draft.nights);
    setPetIds(matches.map(m => m.id));
    setPetAcc(Object.fromEntries(matches.map(m => [m.id, m.accommodation])));
    setUnmatchedPets(unmatched);
    setRequestedExtras(draft.addons);
    setForm(f => ({ ...f, pickup_required: draft.transport.pickup, dropoff_required: draft.transport.dropoff, additional_notes: draft.notes }));
  }, [draft, draftImported, cust.data, pets.data]);

  // Whether the tenant lets customers save their own quotes, and for how long.
  const quoteSettings = useQuery({
    queryKey: ["portal_hotel_quote_settings", cust.data?.tenant_id],
    enabled: Boolean(cust.data?.tenant_id),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("portal_hotel_quote_settings" as any, {
        p_tenant_id: cust.data?.tenant_id,
      });
      if (error) throw error;
      return (data ?? { enabled: true, hold_hours: 48 }) as { enabled: boolean; hold_hours: number };
    },
  });
  const writeBack = useAccommodationWriteBack();

  const [step, setStep] = useState(0);
  const [petIds, setPetIds] = useState<string[]>([]);
  const [checkInDate, setCheckInDate] = useState("");
  const [nights, setNights] = useState(1);
  const [roomPref, setRoomPref] = useState("");
  const [accommodationType, setAccommodationType] = useState("");
  /** Per-dog accommodation — dogs of different sizes can be in different areas. */
  const [petAcc, setPetAcc] = useState<Record<string, string>>({});
  const [form, setForm] = useState<AccommodationFormPayload>(emptyAccommodationForm());
  const [serviceAddressId, setServiceAddressId] = useState<string | null>(null);
  const [seeded, setSeeded] = useState(false);


  const checkOutDate = useMemo(() => (checkInDate ? addDays(checkInDate, nights) : ""), [checkInDate, nights]);
  const guidelines = useHotelGuidelines(cust.data?.tenant_id);

  // Sundays only allow the late (Stay & Play) collection window.
  useEffect(() => {
    const allowed = checkOutWindowsFor(checkOutDate);
    if (form.check_out_window && !allowed.includes(form.check_out_window)) {
      setForm((f) => ({ ...f, check_out_window: allowed[0] }));
    }
  }, [checkOutDate, form.check_out_window]);

  const detailCustomer = useAccommodationCustomer(cust.data?.id);
  const detailPets = useAccommodationPets(petIds);

  // Seed the form from the customer record once it loads.
  useEffect(() => {
    if (seeded || !detailCustomer.data) return;
    setForm((f) => ({ ...buildAccommodationForm({ customer: detailCustomer.data, saved: f.owner.full_name ? f : null }), pickup_required: f.pickup_required, dropoff_required: f.dropoff_required, additional_notes: f.additional_notes }));
    setSeeded(true);
  }, [seeded, detailCustomer.data]);

  // Keep pet cards in step with the pets picked on step 1.
  useEffect(() => {
    if (!detailPets.data) return;
    setForm((f) => syncFormPets(f, detailPets.data));
  }, [detailPets.data]);

  const selectedPets = useMemo(
    () => (pets.data ?? []).filter((p: any) => petIds.includes(p.id)),
    [pets.data, petIds],
  );
  const isCat = selectedPets.length > 0 && selectedPets.every((p) => (p.species ?? "").toLowerCase().includes("cat"));
  const serviceType = isCat ? "hotel_cat" : "hotel_dog";

  // Accommodation drives the price, so it comes from the rate cards — not the room list.
  const ratesQ = useHotelRateCards(cust.data?.tenant_id, { activeOnly: true });
  const speciesRates = useMemo(
    () => (ratesQ.data ?? []).filter((r) => r.species === (isCat ? "cat" : "dog")),
    [ratesQ.data, isCat],
  );
  const rateBlockReason = (r: { min_size_band: PetSizeBand | null; max_size_band: PetSizeBand | null }) => {
    if (selectedPets.length === 0) return null;
    const bad = selectedPets.filter(
      (p: any) => !rateAllowsSize(r, ((p.size_override ?? p.size) ?? null) as PetSizeBand | null),
    );
    if (bad.length === 0) return null;
    return `Not available for: ${bad
      .map((p: any) => `${p.name}${p.size_override ?? p.size ? ` (${p.size_override ?? p.size})` : " (no size set)"}`)
      .join(", ")}`;
  };
  const activeRate = speciesRates.find((r) => r.accommodation_type === accommodationType) ?? null;
  const accFor = (petId: string) => petAcc[petId] || accommodationType;

  // Clear a choice that no longer fits the selected pets / species.
  useEffect(() => {
    if (!accommodationType) return;
    const still = speciesRates.find((r) => r.accommodation_type === accommodationType);
    if (!still || rateBlockReason(still)) setAccommodationType("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speciesRates, petIds.join(",")]);

  /** One line per dog, using that dog's own area; a second dog in the same area uses its extra-pet rate. */
  const estimate = useMemo(() => {
    if (selectedPets.length === 0) return null;
    const groups = new Map<string, string[]>();
    for (const p of selectedPets as any[]) {
      const acc = petAcc[p.id] || accommodationType;
      if (!acc) return null;
      groups.set(acc, [...(groups.get(acc) ?? []), p.name as string]);
    }
    const lines: { label: string; amount: number }[] = [];
    for (const [acc, names] of groups) {
      const rate: any = speciesRates.find((r) => r.accommodation_type === acc);
      if (!rate) return null;
      const nightly = Number(rate.nightly_rate_zar);
      lines.push({
        label: `${rate.display_name} (${names[0]}) · ${fmtZar(nightly)} × ${nights} night${nights === 1 ? "" : "s"}`,
        amount: Math.round(nightly * nights * 100) / 100,
      });
      const extras = names.length - 1;
      if (extras > 0 && Number(rate.extra_pet_rate_zar) > 0) {
        lines.push({
          label: `Extra pet${extras === 1 ? "" : "s"} in ${rate.display_name} (${names.slice(1).join(", ")}) × ${nights} night${nights === 1 ? "" : "s"}`,
          amount: Math.round(Number(rate.extra_pet_rate_zar) * extras * nights * 100) / 100,
        });
      }
    }
    return { lines, grand: lines.reduce((s, l) => s + l.amount, 0) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPets, petAcc, accommodationType, speciesRates, nights]);

  const transportNeeded = form.pickup_required || form.dropoff_required;
  const transportAddressReady = !transportNeeded || Boolean(serviceAddressId);

  // House-wide occupancy for the nights of this stay.
  const gates = usePortalServiceGates(cust.data?.tenant_id);
  const houseQ = useHotelHouseAvailability({
    tenantId: cust.data?.tenant_id,
    start: checkInDate ? new Date(`${checkInDate}T00:00:00`) : null,
    end: checkOutDate ? new Date(`${checkOutDate}T00:00:00`) : null,
    species: isCat ? "cat" : "dog",
    enabled: Boolean(checkInDate && checkOutDate && petIds.length),
  });
  const overNights = fullNights(houseQ.data, petIds.length);
  const capacityBlocked =
    gates.data?.hotel_overbooking_mode === "block" && overNights.length > 0;

  const stayReady =
    petIds.length > 0 && !!checkInDate && nights >= 1 &&
    transportAddressReady && !capacityBlocked &&
    selectedPets.every((p: any) => {
      const r = speciesRates.find(r => r.accommodation_type === accFor(p.id));
      return r && rateAllowsSize(r, (p.size_override ?? p.size ?? null) as PetSizeBand | null);
    });



  // Pet photo requirement (Settings → Hotel & Cattery workflow).
  const photoMode = usePhotoGateMode(cust.data?.tenant_id, serviceType);
  const photoStatus = usePetPhotoStatus(petIds);
  const petsMissingPhoto = selectedPets
    .filter((p: any) => {
      const s = photoStatus.data?.[p.id];
      return !s?.has_photo && !isPhotoWaiverActive(s?.waived_until);
    })
    .map((p: any) => p.name as string);
  const photoBlocked = photoMode === "hard" && petsMissingPhoto.length > 0;

  const vax = usePetsVaxBlocked(petIds, serviceType, checkInDate || null);

  const canSubmit =
    stayReady && transportAddressReady && !photoBlocked && !vax.blocked && form.acknowledgement.accepted &&
    form.acknowledgement.signed_name.trim().length > 1 && !submit.isPending;

  const extraRequests = (extrasCatalog.data?.surcharges ?? []).filter(s => (requestedExtras[s.code] ?? 0) > 0);
  const extrasNote = extraRequests.map(s => `${s.name}: ${requestedExtras[s.code]}${s.per_night ? " per pet per day" : " per pet"}`).join("; ");

  /** Saves the priced stay as a quote that holds the dates for a short while. */
  async function onSaveQuote() {
    if (!cust.data || !checkInDate) return;
    setSavingQuote(true);
    try {
      const { data, error } = await supabase.functions.invoke("portal-create-quote", {
        body: {
          service_type: serviceType,
          pet_ids: petIds,
          start_at: dateToIso(checkInDate, CHECK_IN_TIME),
          end_at: dateToIso(checkOutDate, checkOutTimeFor(form.check_out_window)),
          pet_accommodations: Object.fromEntries(selectedPets.map((p: any) => [p.id, accFor(p.id)])),
          notes: roomPref ? `Room preference: ${roomPref}` : null,
          check_in_window: form.check_in_window || null,
          check_out_window: form.check_out_window || null,
        },
      });
      if (error) throw new Error(error.message);
      if ((data as any)?.ok === false) throw new Error((data as any).error ?? "Could not save the quote");
      toast.success("Quote saved — we're holding these dates for you.");
      nav(`/customer/quotes/${(data as any).quote_id}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save the quote");
    } finally {
      setSavingQuote(false);
    }
  }

  function togglePet(id: string) {
    setPetIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function onSubmit() {
    if (!cust.data) return;
    const startAt = dateToIso(checkInDate, CHECK_IN_TIME);
    if (!startAt) return;
    const payload: AccommodationFormPayload = {
      ...form,
      acknowledgement: {
        ...form.acknowledgement,
        signed_at: new Date().toISOString(),
        guidelines_version: guidelines.data?.guidelines_version ?? null,
      },
    };
    const petCare = payload.pets
      .map((p) => [p.name, p.feeding_instructions].filter(Boolean).join(": "))
      .filter(Boolean)
      .join("\n");
    const petMeds = payload.pets
      .map((p) => [p.name, p.medication_instructions].filter(Boolean).join(": "))
      .filter(Boolean)
      .join("\n");
    const notes = [payload.additional_notes || null, roomPref ? `Room preference: ${roomPref}` : null, extrasNote ? `Requested extras (staff to confirm and price): ${extrasNote}` : null]
      .filter(Boolean)
      .join("\n");
    submit.mutate({
      serviceType: serviceType as any,
      petIds,
      startAt,
      endAt: dateToIso(checkOutDate, checkOutTimeFor(payload.check_out_window)),
      notes: notes || null,
      service_address_id: transportNeeded ? serviceAddressId : null,
      hotel: {
        accommodation_type: accommodationType || null,
        pet_accommodations: Object.fromEntries(selectedPets.map((p: any) => [p.id, accFor(p.id)])),
        feeding_instructions: petCare || null,
        check_in_window: payload.check_in_window || null,
        check_out_window: payload.check_out_window || null,
        medication_instructions: petMeds || null,
        belongings_notes: payload.belongings_notes || null,
        pickup_required: payload.pickup_required,
        dropoff_required: payload.dropoff_required,
      },
      afterCreate: async (res) => {
        if (!res.booking_id) return;
        clearHotelDraft();
        const { error } = await supabase.rpc("submit_accommodation_form", {
          p_booking_id: res.booking_id,
          p_payload: payload as unknown as never,
        });
        if (error) {
          toast.error("Booking created, but the form didn't save — please complete it from the booking.");
          return;
        }
        try {
          await writeBack.mutateAsync({ customerId: cust.data?.id ?? "", form: payload });
        } catch {
          /* non-fatal */
        }
      },
    });
  }

  if (cust.isLoading) {
    return <div className="grid flex-1 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  if (cust.isError || !cust.data) return <div className="p-6 text-sm text-muted-foreground">We couldn’t load your customer account. Please try again or contact Sloppy Kisses.</div>;

  const isLast = step === STEPS.length - 1;

  return (
    <>
      <AppHeader title="Book Hotel & Cattery" />
      <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-6">
        <Link to="/customer/bookings/new" className="inline-flex items-center gap-1 text-xs text-muted-foreground">← All services</Link>
        <BookingPhotos title="Hotel & Cattery" subtitle="A little holiday for your best friend. Choose their dates and accommodation, with prices from our current rate card." />
        <AwardPlaceholder />
        {draftImported && draft?.tenantId === cust.data.tenant_id && <div className="border-l-2 border-primary pl-3 text-sm">
          Your stay choices have been brought across. Please confirm which pets are staying.
          {unmatchedPets.length > 0 && <p className="mt-1 text-xs text-muted-foreground">Please select or add: {unmatchedPets.join(", ")}. <Link to="/customer/pets" className="font-semibold text-primary">My pets</Link></p>}
          {(form.pickup_required || form.dropoff_required) && <p className="mt-1 text-xs text-muted-foreground">Choose a saved, verified collection address below.</p>}
        </div>}
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-5">
      {petIds.length > 0 && (
        <PetsVaccinationGate petIds={petIds} serviceType={serviceType} onDate={checkInDate || null} mode="portal" />
      )}
      <ol className="flex flex-wrap gap-2 text-xs">
        {STEPS.map((s, i) => (
          <li
            key={s}
            className={
              "rounded-full px-3 py-1 font-medium " +
              (i === step ? "bg-sk-coral text-primary-foreground" : i < step ? "bg-sk-coral-soft text-sk-coral-dark" : "bg-muted text-muted-foreground")
            }
          >
            {i + 1}. {s}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <>
          <Field label="Which pets?">
            <div className="flex flex-wrap gap-2">
              {(pets.data ?? []).map((p: any) => {
                const active = petIds.includes(p.id);
                return (
                  <Button
                    key={p.id}
                    variant="outline"
                    aria-pressed={active}
                    type="button"
                    onClick={() => togglePet(p.id)}
                    className={"rounded-full border px-3 py-1.5 text-sm " + (active ? "border-sk-coral bg-sk-coral-soft text-sk-coral-dark" : "border-border bg-white hover:bg-muted")}
                  >
                    {p.name} <span className="text-xs text-muted-foreground">· {p.species ?? "—"}</span>
                  </Button>
                );
              })}
              {(pets.data ?? []).length === 0 && <span className="text-xs text-muted-foreground">Add a pet under My Pets first.</span>}
            </div>
          </Field>

          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Check-in date">
              <input type="date" value={checkInDate} onChange={(e) => setCheckInDate(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Check-out date">
              <input
                type="date"
                value={checkOutDate}
                min={checkInDate ? addDays(checkInDate, 1) : undefined}
                disabled={!checkInDate}
                onChange={(e) => {
                  if (!e.target.value || !checkInDate) return;
                  setNights(Math.max(1, nightsBetween(checkInDate, e.target.value)));
                }}
                className={inputCls}
              />
            </Field>
            <Field label="Nights">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" aria-label="Fewer nights" type="button" onClick={() => setNights((n) => Math.max(1, n - 1))} className="grid h-10 w-10 place-items-center rounded-lg border border-border hover:bg-muted">
                  <Minus className="h-4 w-4" />
                </Button>
                <input
                  type="number"
                  min={1}
                  value={nights}
                  onChange={(e) => setNights(Math.max(1, Number(e.target.value) || 1))}
                  className={inputCls + " text-center"}
                />
                <Button variant="outline" size="icon" aria-label="More nights" type="button" onClick={() => setNights((n) => n + 1)} className="grid h-10 w-10 place-items-center rounded-lg border border-border hover:bg-muted">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </Field>
          </div>

          <HouseCapacityNotice
            rows={houseQ.data}
            petCount={petIds.length}
            mode={gates.data?.hotel_overbooking_mode ?? "warn"}
            loading={houseQ.isLoading}
          />



          <section className="booking-section space-y-3">
            <h2 className="text-lg font-semibold">Accommodation{selectedPets.length > 1 ? " · default for all pets" : ""}</h2>
            <HotelAccommodationChoices rates={speciesRates} species={isCat ? "cat" : "dog"} value={accommodationType}
              onChange={setAccommodationType} blocked={rateBlockReason} />
            <p className="text-xs text-muted-foreground">Final room allocation is confirmed by our team.</p>
          </section>

          {selectedPets.length > 1 && (
            <Field
              label="Accommodation per pet"
              hint="Pets of different sizes can stay in different areas — each is priced at its own nightly rate."
            >
              <div className="space-y-2">
                {selectedPets.map((p: any) => (
                  <div key={p.id} className="space-y-1">
                    <div className="text-xs font-semibold text-muted-foreground">
                      {p.name}
                      <span className="ml-1.5 font-normal">{p.size_override ?? p.size ?? "no size set"}</span>
                    </div>
                    <select
                      value={accFor(p.id)}
                      onChange={(e) => setPetAcc({ ...petAcc, [p.id]: e.target.value })}
                      className={selectCls}
                    >
                      <option value="">— Select accommodation —</option>
                      {speciesRates.map((r) => {
                        const fits = rateAllowsSize(
                          r,
                          ((p.size_override ?? p.size) ?? null) as PetSizeBand | null,
                        );
                        return (
                          <option key={r.id} value={r.accommodation_type} disabled={!fits}>
                            {r.display_name} · {fmtZar(Number(r.nightly_rate_zar))}/night
                            {fits ? "" : " — not available for this size"}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                ))}
              </div>
            </Field>
          )}

          {extraRequests.length > 0 && <section className="booking-section space-y-3">
            <h2 className="text-sm font-semibold">Requested extras from your public booking</h2>
            {extraRequests.map(s => <div key={s.code} className="flex items-center justify-between gap-3 text-sm">
              <span>{s.name} · {requestedExtras[s.code]}{s.per_night ? " per pet per day" : " per pet"}</span>
              <Button variant="ghost" size="sm" onClick={() => setRequestedExtras(a => ({ ...a, [s.code]: 0 }))}>Remove</Button>
            </div>)}
            <p className="text-xs text-muted-foreground">These requests will accompany your booking for staff to confirm and price. They are not included in this estimate or a saved quote.</p>
          </section>}

          <Field label="Room preference (optional)" hint="A request only — we'll do our best.">
            <select value={roomPref} onChange={(e) => setRoomPref(e.target.value)} className={selectCls}>
              <option value="">No preference</option>
              {(rooms.data ?? []).map((r: any) => (
                <option key={r.id} value={r.name}>{r.name}{r.description ? ` — ${r.description}` : ""}</option>
              ))}
            </select>
          </Field>

          <StayWindowSection
            form={form}
            setForm={setForm}
            checkOutDate={checkOutDate}
            customerId={cust.data?.id ?? null}
            tenantId={cust.data?.tenant_id ?? null}
            addressId={serviceAddressId}
            onAddressChange={setServiceAddressId}
            allowManual={false}
          />
        </>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">We've filled in what we hold on file — please check and correct anything that's changed.</p>
          <OwnerSection form={form} setForm={setForm} />
          <EmergencySection form={form} setForm={setForm} />
          <VetSection form={form} setForm={setForm} />
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          {detailPets.isLoading ? (
            <div className="grid place-items-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <PetSections form={form} setForm={setForm} tenantId={cust.data?.tenant_id} />
          )}
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <CareSection form={form} setForm={setForm} />
          <AttachmentsSection
            form={form}
            setForm={setForm}
            hint="Upload on each pet above — from this device or straight from your phone."
          />
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
                {photoBlocked ? "A photo is required before you can book" : "Photo still missing"}
              </div>
              <div className="text-xs opacity-90">
                We use it to match your pet at check-in. Still needed for {petsMissingPhoto.join(", ")} — upload it on the
                pet's card under "Pet details".
              </div>
            </div>
          )}
          <GuidelinesSection tenantId={cust.data?.tenant_id} />
          <AcknowledgementSection form={form} setForm={setForm} />
        </div>
      )}
        </div>
        <HotelStaySummary checkIn={checkInDate} checkOut={checkOutDate} nights={nights} petCount={petIds.length} estimate={estimate}
          status={`Step ${step + 1} of ${STEPS.length} · ${STEPS[step]}`}
          disclaimer="Accommodation estimate only. Extras, late collection, peak dates and discounts may adjust the final invoice.">
          <div className="flex flex-col gap-2">
            {step > 0 && <Button variant="outline" onClick={() => setStep(s => s - 1)}>Back</Button>}
            {step === 0 && quoteSettings.data?.enabled !== false && <Button variant="outline" onClick={onSaveQuote} disabled={!stayReady || !estimate || savingQuote}>{savingQuote ? "Saving…" : "Save as quote"}</Button>}
            {!isLast ? <Button onClick={() => setStep(s => s + 1)} disabled={step === 0 && !stayReady}>Continue</Button> : <Button onClick={onSubmit} disabled={!canSubmit}>{submit.isPending ? "Booking…" : "Confirm booking"}</Button>}
          </div>
        </HotelStaySummary>
        </div>
      </div>
    </>
  );
}
