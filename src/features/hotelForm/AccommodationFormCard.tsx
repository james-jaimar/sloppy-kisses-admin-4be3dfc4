import { AlertTriangle, FileText } from "lucide-react";
import { useAccommodationForm, type FormPet } from "./accommodationForm";

function Row({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="contents">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="whitespace-pre-wrap">{value}</dd>
    </div>
  );
}

/** Read-only summary of the digital accommodation form for a hotel/cattery booking. */
export function AccommodationFormCard({ bookingId }: { bookingId: string }) {
  const q = useAccommodationForm(bookingId);
  const p = q.data?.payload;

  return (
    <section>
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <FileText className="h-3.5 w-3.5" /> Accommodation form
      </div>
      {q.isLoading ? (
        <div className="mt-1 text-xs text-muted-foreground">Loading…</div>
      ) : !p ? (
        <div className="mt-1 flex items-center gap-1.5 text-xs text-sk-orange">
          <AlertTriangle className="h-3.5 w-3.5" /> Not received yet — capture it under Edit booking.
        </div>
      ) : (
        <div className="mt-1 space-y-2 text-xs">
          <div className="inline-flex rounded-full bg-sk-green-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sk-green">
            Received {q.data?.receivedAt ? new Date(q.data.receivedAt).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" }) : ""}
          </div>
          {(() => {
            const missing = [
              !p.emergency_contact?.full_name || !p.emergency_contact?.mobile ? "emergency contact" : null,
              !p.vet?.vet_name || !p.vet?.contact_number ? "vet details" : null,
            ].filter(Boolean);
            return missing.length ? (
              <div className="inline-flex items-center gap-1.5 rounded-full bg-sk-orange-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sk-orange">
                <AlertTriangle className="h-3 w-3" /> Needs info: {missing.join(", ")}
              </div>
            ) : null;
          })()}
          <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1">
            <Row label="Check-in" value={p.check_in_window} />
            <Row label="Check-out" value={p.check_out_window} />
            <Row label="Collection" value={p.pickup_required || p.dropoff_required ? p.collection_address || "Required" : null} />
            <Row label="Emergency" value={[p.emergency_contact?.full_name, p.emergency_contact?.relationship, p.emergency_contact?.mobile].filter(Boolean).join(" · ")} />
            <Row label="Vet" value={[p.vet?.vet_name, p.vet?.contact_number].filter(Boolean).join(" · ")} />
            <Row label="Medical aid" value={p.vet?.has_medical_aid ? p.vet.policy_details || "Yes" : null} />
            <Row label="Feeding" value={p.feeding_instructions} />
            <Row label="Medication" value={p.medication_instructions} />
            <Row label="Grooming" value={p.grooming_required ? p.grooming_instructions || "Requested" : null} />
            <Row label="Belongings" value={p.belongings_notes} />
            <Row label="Emergency notes" value={p.emergency_notes} />
            <Row label="Other notes" value={p.additional_notes} />
            <Row label="Attachments" value={(p.attachments ?? []).join(", ")} />
            <Row label="Signed by" value={p.acknowledgement?.signed_name} />
          </dl>
          {(p.pets ?? []).map((pet: FormPet, i: number) => (
            <div key={pet.pet_id ?? i} className="rounded-lg border border-border p-2">
              <div className="font-semibold">{pet.name || `Pet ${i + 1}`}</div>
              <dl className="mt-1 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1">
                <Row label="Breed / size" value={[pet.breed, pet.size].filter(Boolean).join(" · ")} />
                <Row label="Behaviour" value={[...(pet.behaviour ?? []), pet.behaviour_other].filter(Boolean).join(", ")} />
                <Row label="Health" value={(pet.health ?? []).join(", ")} />
                <Row label="DHPP" value={pet.vax_dhpp} />
                <Row label="Rabies" value={pet.vax_rabies} />
                <Row label="Kennel cough" value={pet.vax_kennel_cough} />
                <Row label="Tick & flea" value={[pet.tick_flea_product, pet.tick_flea_date].filter(Boolean).join(" · ")} />
                <Row label="Notes" value={pet.notes} />
              </dl>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}