import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/lib/tenant/TenantContext";
import { useAccommodationForm, useSubmitAccommodationForm, type AccommodationFormPayload } from "./accommodationForm";
import { useAccommodationCustomer, useAccommodationPets, useAccommodationWriteBack } from "./prefillQueries";
import { AcknowledgementSection, buildAccommodationForm, CareSection, EmergencySection, OwnerSection, PetSections, syncFormPets, VetSection } from "./AccommodationFields";
import { GuidelinesSection } from "./GuidelinesSection";
import { HotelPetChecks } from "./HotelPetChecks";
import { StageBand } from "./StageBand";
import { hotelReadiness, type ReadinessItem } from "./intakeReadiness";
import { usePetsTickFleaStatus } from "@/features/pets/healthQueries";
import { useBookingVaccinationGate } from "@/features/pets/vaccinationGate";
import { useBookingPhotoGate } from "@/features/pets/photoGateQueries";

export interface IntakeStatus { items: ReadinessItem[]; dirty: boolean }

export function HotelIntakeEditor({ bookingId, tenantId, customerId, pets, portal = false, vaxOverridden = false, onStatus }: {
  bookingId: string; tenantId: string; customerId: string;
  pets: { id: string; name: string | null }[]; portal?: boolean;
  vaxOverridden?: boolean; onStatus?: (status: IntakeStatus) => void;
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
  const loading = existing.isLoading || customer.isLoading || records.isLoading || stay.isLoading;
  const error = existing.error || customer.error || records.error || stay.error;

  useEffect(() => {
    if (loading || error || dirty) return;
    const seeded = buildAccommodationForm({ customer: customer.data, pets: records.data, saved: existing.data?.payload });
    if (stay.data) {
      for (const [key, value] of Object.entries(stay.data)) {
        if (value !== null) Object.assign(seeded, { [key]: value });
      }
    }
    setForm(syncFormPets(seeded, records.data ?? []));
  }, [loading, error, dirty, customer.data, records.data, existing.data, stay.data]);

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
    if (!form) return;
    if (portal && form.acknowledgement.accepted && !form.acknowledgement.signed_name.trim()) {
      toast.error("Please enter your full name for the acknowledgement."); return;
    }
    try {
      const payload = { ...form, acknowledgement: {
        ...form.acknowledgement,
        signed_at: portal && form.acknowledgement.accepted ? form.acknowledgement.signed_at || new Date().toISOString() : form.acknowledgement.signed_at,
      } };
      await submit.mutateAsync(payload);
      setDirty(false);
      if (!portal) {
        try { await writeBack.mutateAsync({ customerId, form: payload }); }
        catch { toast.warning("Intake saved, but the customer profile was not updated."); return; }
      }
      toast.success(portal ? "Hotel intake saved" : "Hotel intake saved and customer profile updated");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save hotel intake"); }
  }

  const readiness = form ? hotelReadiness({ form, vaxRows: vaxGate.data ?? [], vaxOverridden, photoRows: photoGate.data ?? [], tickRows }) : null;
  const readinessKey = readiness ? JSON.stringify(readiness) + dirty : "";
  useEffect(() => { if (readiness) onStatus?.({ items: readiness, dirty }); }, [readinessKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !form) return <p className="text-sm text-muted-foreground">Loading accommodation intake…</p>;
  if (error) return <p className="text-sm text-destructive">Could not load accommodation intake. Please retry before editing.</p>;
  if (!form || !readiness) return null;
  const change = (next: AccommodationFormPayload) => { setForm(next); setDirty(true); };
  const props = { form, setForm: change, collapsible: true };
  const done = (...codes: string[]) => codes.every(c => readiness.find(i => i.code === c)?.done);
  const outstanding = (...codes: string[]) => readiness.filter(i => codes.includes(i.code) && !i.done && !i.optional).length;
  const ack = form.acknowledgement;
  const markPaper = () => change({ ...form, acknowledgement: { ...ack, accepted: true, signed_name: ack.signed_name || form.owner.full_name, signed_at: new Date().toISOString(), signed_place: "Reception (paper copy)" } });
  return <div className="space-y-4" aria-label="Accommodation intake">
    <fieldset disabled={!canEdit || submit.isPending} className="min-w-0 space-y-4">
      <StageBand id="intake-contacts" step={2} title="Contacts & vet" tone="blue" done={done("contacts", "vet")} status={done("contacts", "vet") ? "Done" : `${outstanding("contacts", "vet")} outstanding`}>
        <OwnerSection {...props} />
        <EmergencySection {...props} />
        <VetSection {...props} />
      </StageBand>
      <StageBand id="intake-pets" step={3} title={`${pets.length > 1 ? "Pets" : "Pet"}: health, vaccines & care`} tone="muted" done={done("vaccinations", "tick_flea", "care")} status={done("vaccinations", "tick_flea", "care") ? "Done" : `${outstanding("vaccinations", "tick_flea", "care")} outstanding`}>
        <PetSections {...props} tenantId={tenantId} uploadedVia={portal ? "portal" : "admin"} renderChecks={pet => pet.pet_id ? <HotelPetChecks bookingId={bookingId} tenantId={tenantId} petId={pet.pet_id} petName={pet.name || "Pet"} portal={portal} species={records.data?.find(record => record.id === pet.pet_id)?.species} /> : null} />
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
    {canEdit && <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-sk-border bg-background p-3 shadow-sm">
      <span className="text-sm font-medium" role="status">{dirty ? "Unsaved intake changes" : existing.data?.receivedAt ? "Intake saved" : "Intake not saved yet"}</span>
      <Button onClick={save} disabled={!dirty || submit.isPending}>{submit.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save intake</Button>
    </div>}
  </div>;
}