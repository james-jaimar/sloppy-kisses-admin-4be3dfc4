import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/layout/AppHeader";
import { supabase } from "@/lib/supabase/client";
import { fmtDate } from "../portalCommon";
import { useCurrentCustomer } from "../hooks";
import { GuidelinesBody } from "@/features/hotelForm/GuidelinesSection";
import { useHotelGuidelines } from "@/features/hotelForm/guidelinesQueries";
import { PetAttachments } from "@/features/uploads/PetAttachments";
import { usePetAttachmentStatus } from "@/features/uploads/snapQueries";
import { AddressSelector } from "@/features/customers/AddressSelector";
import { useCustomerAddresses } from "@/features/customers/addressQueries";
import {
  BEHAVIOUR_OPTIONS,
  CHECK_IN_WINDOWS,
  CHECK_OUT_WINDOWS,
  HEALTH_OPTIONS,
  emptyPet,
  useAccommodationForm,
  useSubmitAccommodationForm,
  type AccommodationFormPayload,
  type FormPet,
} from "@/features/hotelForm/accommodationForm";

const inputCls =
  "mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-sk-coral";

/** Reads what's actually on file for the selected pets and nudges for the rest. */
function MissingAttachments({ form }: { form: AccommodationFormPayload }) {
  const petIds = form.pets.map((p) => p.pet_id).filter(Boolean) as string[];
  const status = usePetAttachmentStatus(petIds);
  const missing: string[] = [];
  for (const p of form.pets) {
    if (!p.pet_id) continue;
    const s = status.data?.[p.pet_id];
    if (!s) continue;
    if (!s.pet_photo) missing.push(`${p.name || "Pet"}: photo`);
    if (!s.vaccination) missing.push(`${p.name || "Pet"}: vaccination card`);
  }
  return (
    <Section title="Photos & vaccination cards">
      {petIds.length === 0 ? (
        <p className="text-sm text-muted-foreground">No pets selected yet.</p>
      ) : missing.length === 0 ? (
        <p className="text-sm text-muted-foreground">Everything we need is on file — thank you.</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Still outstanding — upload them on each pet's card above, from this device or straight from your phone:
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-sk-coral-dark">
            {missing.map((m) => <li key={m}>{m}</li>)}
          </ul>
        </>
      )}
    </Section>
  );
}

function Text({
  label, value, onChange, type = "text", placeholder,
}: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <label className="block text-sm">
      <span className="text-xs font-semibold uppercase text-muted-foreground">{label}</span>
      <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={inputCls} />
    </label>
  );
}

function Area({ label, value, onChange, rows = 3 }: { label: string; value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <label className="block text-sm md:col-span-2">
      <span className="text-xs font-semibold uppercase text-muted-foreground">{label}</span>
      <textarea rows={rows} value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} />
    </label>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <label className="block text-sm">
      <span className="text-xs font-semibold uppercase text-muted-foreground">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
        <option value="">Select…</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-current text-sk-coral" />
      <span>{label}</span>
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return SectionImpl({ title, children });
}

function GuidelinesInline({ tenantId }: { tenantId: string | null | undefined }) {
  const q = useHotelGuidelines(tenantId);
  const md = q.data?.guidelines_md ?? "";
  if (!md) return null;
  return (
    <div className="max-h-64 overflow-y-auto rounded-lg border border-border bg-muted/30 p-3">
      <GuidelinesBody md={md} />
    </div>
  );
}

function SectionImpl({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="sk-card space-y-4 p-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-sk-coral-dark">{title}</h2>
      {children}
    </section>
  );
}

function toggle(list: string[], v: string): string[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

function cap(v: string | null | undefined): string {
  if (!v) return "";
  return v.charAt(0).toUpperCase() + v.slice(1);
}

const SIZE_LABEL: Record<string, string> = { small: "Small", medium: "Medium", large: "Large" };

export default function AccommodationFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const cust = useCurrentCustomer();
  const existing = useAccommodationForm(id);
  const submit = useSubmitAccommodationForm(id);

  const bookingQ = useQuery({
    queryKey: ["portal_booking_form", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("id, tenant_id, customer_id, service_address_id, booking_number, service_type, start_at, end_at, booking_pets(pet:pets(id, name, breed, sex, size, size_override, marks_colour))")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [form, setForm] = useState<AccommodationFormPayload>({
    owner: { full_name: "", id_number: "", email: "", mobile: "", home_address: "" },
    emergency_contact: { full_name: "", relationship: "", mobile: "", alt_number: "" },
    vet: { vet_name: "", contact_number: "", has_medical_aid: false, policy_details: "" },
    check_in_window: CHECK_IN_WINDOWS[0],
    check_out_window: "",
    pickup_required: false,
    dropoff_required: false,
    collection_address: "",
    pets: [],
    feeding_instructions: "",
    medication_instructions: "",
    grooming_required: false,
    grooming_instructions: "",
    belongings_notes: "",
    emergency_notes: "",
    additional_notes: "",
    attachments: [],
    acknowledgement: { accepted: false, signed_name: "", signed_at: "", signed_place: "" },
  });
  const [seeded, setSeeded] = useState(false);
  const [serviceAddressId, setServiceAddressId] = useState<string | null>(null);

  const bookingPets = useMemo(
    () => ((bookingQ.data as any)?.booking_pets ?? []).map((bp: any) => bp.pet).filter(Boolean),
    [bookingQ.data],
  );

  useEffect(() => {
    if (seeded || !bookingQ.data || !cust.data) return;
    const saved = existing.data?.payload;
    const c = cust.data;
    setForm((f) => ({
      ...f,
      ...(saved ?? {}),
      owner: saved?.owner ?? {
        full_name: c.full_name ?? [c.first_name, c.last_name].filter(Boolean).join(" "),
        id_number: "",
        email: c.email ?? "",
        mobile: c.mobile ?? "",
        home_address: [c.address_line_1, c.address_line_2, c.suburb, c.city, c.postcode].filter(Boolean).join(", "),
      },
      pets:
        saved?.pets?.length
          ? saved.pets
          : bookingPets.map((p: any) => ({
              ...emptyPet(p.id, p.name ?? ""),
              breed: p.breed ?? "",
              sex: cap(p.sex === "unknown" ? "" : p.sex),
              size: SIZE_LABEL[String(p.size_override ?? p.size ?? "")] ?? "",
              colour_marks: p.marks_colour ?? "",
            })),
    }));
    setServiceAddressId((bookingQ.data as any)?.service_address_id ?? null);
    setSeeded(true);
  }, [seeded, bookingQ.data, cust.data, existing.data, bookingPets]);

  const addressesQ = useCustomerAddresses(
    (bookingQ.data as any)?.customer_id ?? cust.data?.id ?? null,
    (bookingQ.data as any)?.tenant_id ?? cust.data?.tenant_id ?? null,
  );

  function patchPet(i: number, patch: Partial<FormPet>) {
    setForm((f) => ({ ...f, pets: f.pets.map((p, idx) => (idx === i ? { ...p, ...patch } : p)) }));
  }

  async function onSubmit() {
    if (!form.acknowledgement.accepted || !form.acknowledgement.signed_name.trim()) {
      toast.error("Please accept the terms and sign with your full name.");
      return;
    }
    if ((form.pickup_required || form.dropoff_required) && !serviceAddressId) {
      toast.error("Please choose the collection / drop-off address.");
      return;
    }
    try {
      const address = serviceAddressId
        ? addressesQ.data?.find((a) => a.id === serviceAddressId) ?? null
        : null;
      const collectionText = address
        ? [address.address_line_2, address.formatted_address || [address.address_line_1, address.suburb, address.city].filter(Boolean).join(", ")]
            .filter(Boolean)
            .join(", ")
        : form.collection_address;
      if (serviceAddressId && serviceAddressId !== (bookingQ.data as any)?.service_address_id) {
        const { error: addrErr } = await supabase
          .from("bookings")
          .update({ service_address_id: serviceAddressId })
          .eq("id", id!);
        if (addrErr) console.error("Could not set the booking service address", addrErr);
      }
      await submit.mutateAsync({
        ...form,
        collection_address: collectionText,
        acknowledgement: { ...form.acknowledgement, signed_at: new Date().toISOString() },
      });
      toast.success("Accommodation form submitted — thank you!");
      navigate(`/customer/bookings/${id}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not submit the form");
    }
  }

  if (bookingQ.isLoading || existing.isLoading) {
    return <div className="grid flex-1 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }
  if (!bookingQ.data) return <div className="p-6 text-sm text-muted-foreground">Booking not found.</div>;
  const b: any = bookingQ.data;

  return (
    <>
      <AppHeader title="Accommodation form" subtitle={`${b.booking_number} · ${fmtDate(b.start_at)} – ${fmtDate(b.end_at)}`} />
      <div className="flex-1 space-y-6 p-4 md:p-6">
        <Link to={`/customer/bookings/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to booking
        </Link>

        {existing.data?.receivedAt && (
          <div className="flex items-center gap-2 rounded-xl border border-sk-green/30 bg-sk-green-soft px-4 py-3 text-sm text-sk-green">
            <CheckCircle2 className="h-4 w-4" /> Form received {fmtDate(existing.data.receivedAt)} — you can update and resubmit it below.
          </div>
        )}

        <Section title="Owner information">
          <div className="grid gap-4 md:grid-cols-2">
            <Text label="Full name" value={form.owner.full_name} onChange={(v) => setForm({ ...form, owner: { ...form.owner, full_name: v } })} />
            <Text label="ID number" value={form.owner.id_number} onChange={(v) => setForm({ ...form, owner: { ...form.owner, id_number: v } })} />
            <Text label="Email" type="email" value={form.owner.email} onChange={(v) => setForm({ ...form, owner: { ...form.owner, email: v } })} />
            <Text label="Mobile" value={form.owner.mobile} onChange={(v) => setForm({ ...form, owner: { ...form.owner, mobile: v } })} />
            
          </div>
        </Section>

        <Section title="Emergency contact">
          <div className="grid gap-4 md:grid-cols-2">
            <Text label="Full name" value={form.emergency_contact.full_name} onChange={(v) => setForm({ ...form, emergency_contact: { ...form.emergency_contact, full_name: v } })} />
            <Select label="Relationship" options={["Family", "Friend", "Neighbour", "Other"]} value={form.emergency_contact.relationship} onChange={(v) => setForm({ ...form, emergency_contact: { ...form.emergency_contact, relationship: v } })} />
            <Text label="Mobile" value={form.emergency_contact.mobile} onChange={(v) => setForm({ ...form, emergency_contact: { ...form.emergency_contact, mobile: v } })} />
            <Text label="Alternative number" value={form.emergency_contact.alt_number} onChange={(v) => setForm({ ...form, emergency_contact: { ...form.emergency_contact, alt_number: v } })} />
          </div>
        </Section>

        <Section title="Veterinary details / medical aid">
          <div className="grid gap-4 md:grid-cols-2">
            <Text label="Vet name" value={form.vet.vet_name} onChange={(v) => setForm({ ...form, vet: { ...form.vet, vet_name: v } })} />
            <Text label="Vet contact number" value={form.vet.contact_number} onChange={(v) => setForm({ ...form, vet: { ...form.vet, contact_number: v } })} />
            <div className="flex items-end">
              <Check label="Medical aid / insurance" checked={form.vet.has_medical_aid} onChange={(v) => setForm({ ...form, vet: { ...form.vet, has_medical_aid: v } })} />
            </div>
            <Text label="Policy / company details" value={form.vet.policy_details} onChange={(v) => setForm({ ...form, vet: { ...form.vet, policy_details: v } })} />
          </div>
        </Section>

        <Section title="Booking details">
          <div className="grid gap-4 md:grid-cols-2">
            <Select label="Check-in time" options={CHECK_IN_WINDOWS} value={form.check_in_window} onChange={(v) => setForm({ ...form, check_in_window: v })} />
            <Select label="Check-out time" options={CHECK_OUT_WINDOWS} value={form.check_out_window} onChange={(v) => setForm({ ...form, check_out_window: v })} />
            <div className="flex flex-wrap gap-2 md:col-span-2">
              <Check label="Collection required" checked={form.pickup_required} onChange={(v) => setForm({ ...form, pickup_required: v })} />
              <Check label="Drop-off required" checked={form.dropoff_required} onChange={(v) => setForm({ ...form, dropoff_required: v })} />
            </div>
            {(form.pickup_required || form.dropoff_required) && (
              <div className="md:col-span-2">
                <AddressSelector
                  customerId={(bookingQ.data as any)?.customer_id ?? cust.data?.id ?? null}
                  tenantId={(bookingQ.data as any)?.tenant_id ?? cust.data?.tenant_id ?? null}
                  value={serviceAddressId}
                  onChange={setServiceAddressId}
                  label="Collection / drop-off address"
                  allowManual={false}
                />
                {!serviceAddressId && (
                  <p className="mt-2 rounded-lg border border-sk-coral bg-sk-coral-soft px-3 py-2 text-xs text-sk-coral-dark">
                    Choose the address our van should drive to, or add a new one.
                  </p>
                )}
              </div>
            )}
          </div>
        </Section>

        {form.pets.map((p, i) => (
          <Section key={p.pet_id ?? i} title={`Pet ${i + 1} details${p.name ? ` — ${p.name}` : ""}`}>
            <div className="grid gap-4 md:grid-cols-2">
              <Text label="Pet name" value={p.name} onChange={(v) => patchPet(i, { name: v })} />
              <Text label="Breed" value={p.breed} onChange={(v) => patchPet(i, { breed: v })} />
              <Text label="Age" value={p.age} onChange={(v) => patchPet(i, { age: v })} />
              <Select label="Sex" options={["Male", "Female"]} value={p.sex} onChange={(v) => patchPet(i, { sex: v })} />
              <Select label="Size" options={["Small", "Medium", "Large"]} value={p.size} onChange={(v) => patchPet(i, { size: v })} />
              <Text label="Colour / marks" value={p.colour_marks} onChange={(v) => patchPet(i, { colour_marks: v })} />
            </div>
            <div>
              <div className="text-xs font-semibold uppercase text-muted-foreground">Behaviour</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {BEHAVIOUR_OPTIONS.map((o) => (
                  <Check key={o} label={o} checked={p.behaviour.includes(o)} onChange={() => patchPet(i, { behaviour: toggle(p.behaviour, o) })} />
                ))}
              </div>
              <div className="mt-2"><Text label="Other" value={p.behaviour_other} onChange={(v) => patchPet(i, { behaviour_other: v })} /></div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase text-muted-foreground">Health checklist</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {HEALTH_OPTIONS.map((o) => (
                  <Check key={o} label={o} checked={p.health.includes(o)} onChange={() => patchPet(i, { health: toggle(p.health, o) })} />
                ))}
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Text label="5-in-1 / DHPP date" type="date" value={p.vax_dhpp} onChange={(v) => patchPet(i, { vax_dhpp: v })} />
              <Text label="Rabies date" type="date" value={p.vax_rabies} onChange={(v) => patchPet(i, { vax_rabies: v })} />
              <Text label="Kennel cough date" type="date" value={p.vax_kennel_cough} onChange={(v) => patchPet(i, { vax_kennel_cough: v })} />
              <Text label="Tick & flea product" value={p.tick_flea_product} onChange={(v) => patchPet(i, { tick_flea_product: v })} />
              <Text label="Tick & flea date" type="date" value={p.tick_flea_date} onChange={(v) => patchPet(i, { tick_flea_date: v })} />
              <Area label="Feeding / medication / grooming notes for this pet" value={p.notes} onChange={(v) => patchPet(i, { notes: v })} />
            </div>
            {b.tenant_id && p.pet_id && (
              <PetAttachments tenantId={b.tenant_id} petId={p.pet_id} petName={p.name || "this pet"} />
            )}
          </Section>
        ))}

        <Section title="Care instructions">
          <div className="grid gap-4 md:grid-cols-2">
            <Area label="Feeding instructions" value={form.feeding_instructions} onChange={(v) => setForm({ ...form, feeding_instructions: v })} />
            <Area label="Medication instructions" value={form.medication_instructions} onChange={(v) => setForm({ ...form, medication_instructions: v })} />
            <div className="md:col-span-2">
              <Check label="Grooming requested during the stay" checked={form.grooming_required} onChange={(v) => setForm({ ...form, grooming_required: v })} />
            </div>
            {form.grooming_required && (
              <Area label="Grooming instructions" value={form.grooming_instructions} onChange={(v) => setForm({ ...form, grooming_instructions: v })} />
            )}
            <Area label="Belongings sent with your pet (please label clearly)" value={form.belongings_notes} onChange={(v) => setForm({ ...form, belongings_notes: v })} />
            <Area label="Emergency instructions" value={form.emergency_notes} onChange={(v) => setForm({ ...form, emergency_notes: v })} />
            <Area label="Anything else you wish to share with us?" value={form.additional_notes} onChange={(v) => setForm({ ...form, additional_notes: v })} />
          </div>
        </Section>

        <MissingAttachments form={form} />

        <Section title="Acknowledgement">
          <GuidelinesInline tenantId={b.tenant_id} />
          <p className="text-sm text-muted-foreground">
            By submitting your booking and/or completed forms, you confirm that you have read, understood, and agree to all
            Sloppy Kisses terms and conditions as stated on our website.
          </p>
          <Check label="I have read and agree to the terms and conditions" checked={form.acknowledgement.accepted} onChange={(v) => setForm({ ...form, acknowledgement: { ...form.acknowledgement, accepted: v } })} />
          <div className="grid gap-4 md:grid-cols-2">
            <Text label="Signed (full name)" value={form.acknowledgement.signed_name} onChange={(v) => setForm({ ...form, acknowledgement: { ...form.acknowledgement, signed_name: v } })} />
            <Text label="Signed at (place)" value={form.acknowledgement.signed_place} onChange={(v) => setForm({ ...form, acknowledgement: { ...form.acknowledgement, signed_place: v } })} />
          </div>
          <button
            onClick={onSubmit}
            disabled={submit.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-sk-coral px-4 py-2 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-60"
          >
            {submit.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Submit accommodation form
          </button>
        </Section>
      </div>
    </>
  );
}