import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/lib/tenant/TenantContext";
import { useAccommodationForm, useSubmitAccommodationForm, type AccommodationFormPayload } from "./accommodationForm";
import { useAccommodationCustomer, useAccommodationPets } from "./prefillQueries";
import { AcknowledgementSection, buildAccommodationForm, CareSection, EmergencySection, OwnerSection, PetSections, syncFormPets, VetSection } from "./AccommodationFields";
import { GuidelinesSection } from "./GuidelinesSection";
import { HotelPetChecks } from "./HotelPetChecks";

export function HotelIntakeEditor({ bookingId, tenantId, customerId, pets, portal = false }: {
  bookingId: string; tenantId: string; customerId: string;
  pets: { id: string; name: string | null }[]; portal?: boolean;
}) {
  const { hasPermission } = useCurrentUser();
  const canEdit = portal || hasPermission("bookings.edit");
  const existing = useAccommodationForm(bookingId);
  const customer = useAccommodationCustomer(customerId);
  const records = useAccommodationPets(pets.map(p => p.id));
  const submit = useSubmitAccommodationForm(bookingId);
  const [form, setForm] = useState<AccommodationFormPayload | null>(null);
  const [dirty, setDirty] = useState(false);
  const loading = existing.isLoading || customer.isLoading || records.isLoading;
  const error = existing.error || customer.error || records.error;

  useEffect(() => {
    if (loading || error || dirty) return;
    const seeded = buildAccommodationForm({ customer: customer.data, pets: records.data, saved: existing.data?.payload });
    setForm(syncFormPets(seeded, records.data ?? []));
  }, [loading, error, dirty, customer.data, records.data, existing.data]);

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
      await submit.mutateAsync({ ...form, acknowledgement: {
        ...form.acknowledgement,
        signed_at: portal && form.acknowledgement.accepted ? form.acknowledgement.signed_at || new Date().toISOString() : form.acknowledgement.signed_at,
      } });
      setDirty(false);
      toast.success("Hotel intake saved");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save hotel intake"); }
  }

  if (loading && !form) return <p className="text-sm text-muted-foreground">Loading accommodation intake…</p>;
  if (error) return <p className="text-sm text-destructive">Could not load accommodation intake. Please retry before editing.</p>;
  if (!form) return null;
  const change = (next: AccommodationFormPayload) => { setForm(next); setDirty(true); };
  const props = { form, setForm: change, collapsible: true };
  const missing = [
    !form.owner.full_name || !form.owner.mobile ? "Owner contact" : null,
    !form.emergency_contact.full_name || !form.emergency_contact.mobile ? "Emergency contact" : null,
    !form.vet.vet_name || !form.vet.contact_number ? "Vet details" : null,
    !form.acknowledgement.accepted || !form.acknowledgement.signed_name ? "Customer acknowledgement" : null,
  ].filter(Boolean);
  return <section className="space-y-3 border-b border-border pb-6" aria-label="Accommodation intake">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-semibold">Accommodation intake</h2>
      <span className="text-xs text-muted-foreground" role="status">{dirty ? "Unsaved changes" : existing.data?.receivedAt ? "Saved on this booking" : "Not saved yet"}</span>
    </div>
    {missing.length > 0 && <div className="flex flex-wrap gap-2">{missing.map(item => <span key={item} className="rounded-md bg-sk-orange-soft px-2 py-1 text-xs text-sk-orange">{item} outstanding</span>)}</div>}
    <fieldset disabled={!canEdit || submit.isPending} className="min-w-0 space-y-3">
      <OwnerSection {...props} />
      <EmergencySection {...props} />
      <VetSection {...props} />
      <PetSections {...props} tenantId={tenantId} uploadedVia={portal ? "portal" : "admin"} renderChecks={pet => pet.pet_id ? <HotelPetChecks bookingId={bookingId} tenantId={tenantId} petId={pet.pet_id} petName={pet.name || "Pet"} portal={portal} species={records.data?.find(record => record.id === pet.pet_id)?.species} /> : null} />
      <CareSection {...props} />
      {portal ? <><GuidelinesSection tenantId={tenantId} collapsible /><AcknowledgementSection {...props} /></> :
        <div className="border-t border-border py-3 text-sm"><h3 className="font-semibold">Customer acknowledgement</h3><p className="mt-1 text-muted-foreground">{form.acknowledgement.accepted && form.acknowledgement.signed_name ? `Signed by ${form.acknowledgement.signed_name}${form.acknowledgement.signed_at ? ` · ${new Date(form.acknowledgement.signed_at).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" })}` : ""}` : "Awaiting customer acknowledgement"}</p></div>}
    </fieldset>
    {canEdit && <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-background py-3">
      <span className="text-xs text-muted-foreground">{dirty ? "Changes not yet saved" : "Intake details"}</span>
      <Button onClick={save} disabled={!dirty || submit.isPending}>{submit.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save intake</Button>
    </div>}
  </section>;
}