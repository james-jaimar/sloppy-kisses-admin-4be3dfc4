import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { CheckCircle2, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/lib/tenant/TenantContext";
import { useAccommodationForm, useSubmitAccommodationForm, type AccommodationFormPayload } from "./accommodationForm";
import { useAccommodationCustomer, useAccommodationPets, useAccommodationWriteBack } from "./prefillQueries";
import { AcknowledgementSection, buildAccommodationForm, CareSection, EmergencySection, OwnerSection, PetSections, syncFormPets, VetSection } from "./AccommodationFields";
import { GuidelinesSection } from "./GuidelinesSection";
import { HotelPetChecks } from "./HotelPetChecks";
import { StageBand } from "./StageBand";
import { hotelReadiness, type ReadinessItem, type ReadinessCode } from "./intakeReadiness";
import { usePetsTickFleaStatus } from "@/features/pets/healthQueries";
import { useBookingVaccinationGate } from "@/features/pets/vaccinationGate";
import { useBookingPhotoGate } from "@/features/pets/photoGateQueries";

export interface IntakeStatus { items: ReadinessItem[]; dirty: boolean }
export interface IntakeFocus { code: ReadinessCode; sequence: number }

export function HotelIntakeEditor({ bookingId, tenantId, customerId, pets, portal = false, vaxOverridden = false, onStatus, focus }: {
  bookingId: string; tenantId: string; customerId: string;
  pets: { id: string; name: string | null }[]; portal?: boolean;
  vaxOverridden?: boolean; onStatus?: (status: IntakeStatus) => void;
  focus?: IntakeFocus;
}) {
  const { hasPermission } = useCurrentUser();
  const canEdit = portal || hasPermission("bookings.edit");
  const existing = useAccommodationForm(bookingId);
  const customer = useAccommodationCustomer(customerId);
  const records = useAccommodationPets(pets.map(p => p.id));
  const submit = useSubmitAccommodationForm(bookingId);
  const writeBack = useAccommodationWriteBack();
  const vaxGate = useBookingVaccinationGate(bookingId);
  const photoGate = useBookingPhotoGate(bookingId);
  const tickRows = usePetsTickFleaStatus(pets.map(p => p.id));
  const stay = useQuery({ queryKey: ["hotel_intake_stay", bookingId], queryFn: async () => {
    const { data, error } = await supabase.from("hotel_booking_details").select("check_in_window, check_out_window, pickup_required, dropoff_required, feeding_instructions, medication_instructions, grooming_required, grooming_instructions, belongings_notes, emergency_notes, additional_notes").eq("booking_id", bookingId).maybeSingle();
    if (error) throw error;
    return data;
  } });
  const [form, setForm] = useState<AccommodationFormPayload | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activePetId, setActivePetId] = useState(pets[0]?.id ?? "");
  const version = useRef(0);
  const inFlight = useRef(false);
  const seededOnce = useRef(false);
  const loading = existing.isLoading || customer.isLoading || records.isLoading || stay.isLoading;
  const error = existing.error || customer.error || records.error || stay.error;

  useEffect(() => {
    if (loading || error || dirty || seededOnce.current) return;
    const seeded = buildAccommodationForm({ customer: customer.data, pets: records.data, saved: existing.data?.payload });
    if (stay.data) {
      for (const [key, value] of Object.entries(stay.data)) {
        if (value !== null) Object.assign(seeded, { [key]: value });
      }
    }
    setForm(syncFormPets(seeded, records.data ?? []));
    seededOnce.current = true;
  }, [loading, error, dirty, customer.data, records.data, existing.data, stay.data]);

  useEffect(() => {
    if (!form || records.isLoading || !records.data) return;
    const synced = syncFormPets(form, records.data);
    if (synced !== form) {
      version.current += 1;
      setForm(synced); setDirty(true);
    }
    if (!synced.pets.some(p => p.pet_id === activePetId)) setActivePetId(synced.pets[0]?.pet_id ?? "");
  }, [records.data, records.isLoading, form, activePetId]);

  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const navigation = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (target && !window.confirm("Leave this booking without saving the intake changes?")) {
        event.preventDefault(); event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", navigation, true);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", navigation, true); };
  }, [dirty]);

  async function save() {
    if (!form || inFlight.current) return;
    if (portal && form.acknowledgement.accepted && !form.acknowledgement.signed_name.trim()) {
      setSaveError(true); toast.error("Please enter your full name for the acknowledgement."); return;
    }
    const savingVersion = version.current;
    inFlight.current = true;
    setSaving(true);
    setSaveError(false);
    try {
      const payload = { ...form, acknowledgement: {
        ...form.acknowledgement,
        signed_at: portal && form.acknowledgement.accepted ? form.acknowledgement.signed_at || new Date().toISOString() : form.acknowledgement.signed_at,
      } };
      await submit.mutateAsync(payload);
      if (version.current === savingVersion) setDirty(false);
      if (!portal) {
        try { await writeBack.mutateAsync({ customerId, form: payload }); }
        catch { toast.warning("Intake saved, but the customer profile was not updated."); return; }
      }
    } catch (e) { setSaveError(true); toast.error(e instanceof Error ? e.message : "Could not save hotel intake"); }
    finally { inFlight.current = false; setSaving(false); }
  }

  useEffect(() => {
    if (!dirty || !canEdit || saving || saveError) return;
    const timer = window.setTimeout(() => { void save(); }, 1000);
    return () => window.clearTimeout(timer);
  }, [form, dirty, canEdit, saving, saveError]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!focus || !form) return;
    const code = focus.code;
    const targetPet = form.pets.find(p => {
      if (code === "care") return !p.feeding_instructions?.trim();
      if (code === "vaccinations") return vaxGate.data?.some(r => r.pet_id === p.pet_id && !["ok", "waived"].includes(r.status));
      if (code === "tick_flea") return tickRows.some(r => r.pet_id === p.pet_id && ["missing", "overdue"].includes(r.status));
      return true;
    }) ?? form.pets[0];
    if (targetPet?.pet_id) setActivePetId(targetPet.pet_id);
    const targetId = code === "care" ? `intake-feeding-${targetPet?.pet_id}` : code === "vaccinations" || code === "photo" ? `intake-vaccinations-${targetPet?.pet_id}` : code === "tick_flea" ? `intake-treatments-${targetPet?.pet_id}` : code === "terms" ? "intake-terms" : "intake-contacts";
    const timer = window.setTimeout(() => {
      const target = document.getElementById(targetId);
      target?.scrollIntoView({ behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
      if (code === "care") target?.querySelector("textarea")?.focus({ preventScroll: true });
    }, 50);
    return () => window.clearTimeout(timer);
  }, [focus]); // eslint-disable-line react-hooks/exhaustive-deps

  const readiness = form ? hotelReadiness({ form, vaxRows: vaxGate.data ?? [], vaxOverridden, photoRows: photoGate.data ?? [], tickRows }) : null;
  const readinessKey = readiness ? JSON.stringify(readiness) + dirty : "";
  useEffect(() => { if (readiness) onStatus?.({ items: readiness, dirty }); }, [readinessKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !form) return <p className="text-sm text-muted-foreground">Loading accommodation intake…</p>;
  if (error) return <p className="text-sm text-destructive">Could not load accommodation intake. Please retry before editing.</p>;
  if (!form || !readiness) return null;
  const change = (next: AccommodationFormPayload) => { version.current += 1; setForm(next); setDirty(true); setSaveError(false); };
  const props = { form, setForm: change, collapsible: true };
  const done = (...codes: string[]) => codes.every(c => readiness.find(i => i.code === c)?.done);
  const outstanding = (...codes: string[]) => readiness.filter(i => codes.includes(i.code) && !i.done && !i.optional).length;
  const ack = form.acknowledgement;
  const markPaper = () => change({ ...form, acknowledgement: { ...ack, accepted: true, signed_name: ack.signed_name || form.owner.full_name, signed_at: new Date().toISOString(), signed_place: "Reception (paper copy)" } });
  return <div className="space-y-4" aria-label="Accommodation intake">
    <fieldset disabled={!canEdit || submit.isPending} className="min-w-0 space-y-4">
      <StageBand id="intake-contacts" step={2} title="Contacts & vet" tone="blue" done={done("contacts", "vet")} status={done("contacts", "vet") ? "Done" : `${outstanding("contacts", "vet")} outstanding`}>
        <OwnerSection {...props} revealKey={focus?.code === "contacts" ? focus.sequence : undefined} />
        <EmergencySection {...props} revealKey={focus?.code === "contacts" ? focus.sequence : undefined} />
        <VetSection {...props} revealKey={focus?.code === "vet" ? focus.sequence : undefined} />
      </StageBand>
      <StageBand id="intake-pets" step={3} title={`${pets.length > 1 ? "Pets" : "Pet"}: health, vaccines & care`} tone="muted" done={done("vaccinations", "tick_flea", "care")} status={done("vaccinations", "tick_flea", "care") ? "Done" : `${outstanding("vaccinations", "tick_flea", "care")} outstanding`}>
        <PetSections {...props} activePetId={activePetId} onSelectPet={setActivePetId} species={Object.fromEntries((records.data ?? []).map(p => [p.id, p.species ?? "dog"]))} petIndicators={Object.fromEntries(form.pets.map(p => [p.pet_id ?? "", Number(!p.feeding_instructions?.trim()) + Number(Boolean(vaxGate.data?.some(r => r.pet_id === p.pet_id && !["ok", "waived"].includes(r.status)))) + Number(tickRows.some(r => r.pet_id === p.pet_id && ["missing", "overdue"].includes(r.status)))]))} tenantId={tenantId} uploadedVia={portal ? "portal" : "admin"} renderChecks={pet => pet.pet_id ? <HotelPetChecks bookingId={bookingId} tenantId={tenantId} petId={pet.pet_id} petName={pet.name || "Pet"} portal={portal} species={records.data?.find(record => record.id === pet.pet_id)?.species} /> : null} />
        <CareSection {...props} />
        {(form.feeding_instructions || form.medication_instructions || form.grooming_instructions) && <div className="border-t border-border py-3 text-sm"><h3 className="font-semibold">Earlier stay-wide care notes</h3>{[form.feeding_instructions, form.medication_instructions, form.grooming_instructions].filter(Boolean).map((note, i) => <p key={i} className="mt-2 whitespace-pre-wrap text-muted-foreground">{note}</p>)}</div>}
      </StageBand>
      <StageBand id="intake-terms" step={4} title="Terms & acknowledgement" tone="coral" done={done("terms")}>
        {portal ? <><GuidelinesSection tenantId={tenantId} collapsible /><AcknowledgementSection {...props} /></> :
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <p>{ack.accepted && ack.signed_name ? `Signed by ${ack.signed_name}${ack.signed_place ? ` · ${ack.signed_place}` : " · customer portal"}${ack.signed_at ? ` · ${new Date(ack.signed_at).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" })}` : ""}` : "Waiting for the customer to accept the terms in their portal, or a signed paper copy at reception."}</p>
            {!(ack.accepted && ack.signed_name) && canEdit && <Button type="button" variant="outline" onClick={markPaper}>Paper copy signed at reception</Button>}
          </div>}
      </StageBand>
    </fieldset>
    {canEdit && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-background py-3">
      <span className="inline-flex items-center gap-2 text-sm font-medium" role="status">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : !dirty ? <CheckCircle2 className="h-4 w-4 text-sk-green" /> : null}{saving ? "Saving intake…" : saveError ? "Not saved — retry saving intake" : dirty ? "Intake changes waiting to save…" : "Intake up to date"}</span>
      {dirty && <Button onClick={save} disabled={saving} variant="outline"><Save className="mr-2 h-4 w-4" />{saveError ? "Retry save" : "Save intake"}</Button>}
    </div>}
  </div>;
}