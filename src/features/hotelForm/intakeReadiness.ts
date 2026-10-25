import type { AccommodationFormPayload } from "./accommodationForm";

export type ReadinessCode = "contacts" | "vet" | "vaccinations" | "tick_flea" | "care" | "photo" | "terms";
export interface ReadinessItem { code: ReadinessCode; label: string; done: boolean; section: string; optional?: boolean }

const filled = (v: string | null | undefined) => Boolean(v && v.trim());

/** Live readiness computed from the intake and the server vaccination/photo/health gates. */
export function hotelReadiness({ form, vaxRows, vaxOverridden, photoRows, tickRows }: {
  form: AccommodationFormPayload;
  vaxRows: { pet_id: string; status: string }[];
  vaxOverridden?: boolean;
  photoRows: { pet_id: string; status: string }[];
  /** When supplied, tick & flea is judged on the pet's recorded parasite treatments. */
  tickRows?: { pet_id: string; status: string }[];
}): ReadinessItem[] {
  const pets = form.pets;
  const name = (petId: string | null) => pets.find(p => p.pet_id === petId)?.name || "Pet";
  const badVax = vaxRows.filter(r => r.status !== "ok" && r.status !== "waived");
  const badPhoto = photoRows.filter(r => r.status !== "ok" && r.status !== "waived");
  const badTick = tickRows
    ? tickRows.filter(r => r.status === "missing" || r.status === "overdue")
    : pets.filter(p => !filled(p.tick_flea_product) || !filled(p.tick_flea_date)).map(p => ({ pet_id: p.pet_id ?? "" }));
  const noFood = pets.filter(p => !filled(p.feeding_instructions));
  const vaxPets = [...new Set(badVax.map(r => r.pet_id))];
  return [
    { code: "contacts", section: "intake-contacts", label: "Owner & emergency contact", done: filled(form.owner.full_name) && filled(form.owner.mobile) && filled(form.emergency_contact.full_name) && filled(form.emergency_contact.mobile) },
    { code: "vet", section: "intake-contacts", label: "Vet & emergency number", done: filled(form.vet.vet_name) && filled(form.vet.contact_number) },
    { code: "vaccinations", section: "intake-pets", label: vaxOverridden || !vaxPets.length ? "Vaccinations valid" : `Vaccinations outstanding: ${vaxPets.map(name).join(", ")}`, done: Boolean(vaxOverridden) || !badVax.length },
    { code: "tick_flea", section: "intake-pets", label: badTick.length ? `Tick & flea outstanding: ${badTick.map(r => name(r.pet_id)).join(", ")}` : "Tick & flea recorded", done: pets.length > 0 && !badTick.length },
    { code: "care", section: "intake-pets", label: noFood.length ? `Feeding outstanding: ${noFood.map(p => p.name || "Pet").join(", ")}` : "Feeding & care instructions", done: pets.length > 0 && !noFood.length },
    { code: "photo", section: "intake-pets", label: badPhoto.length ? `Photo outstanding: ${[...new Set(badPhoto.map(r => r.pet_id))].map(name).join(", ")}` : "Pet photos", done: !badPhoto.length, optional: true },
    { code: "terms", section: "intake-terms", label: "Terms acknowledged", done: form.acknowledgement.accepted && filled(form.acknowledgement.signed_name) },
  ];
}

/** Map live readiness onto the configured server approval checklist codes. Unknown codes stay manual. */
export function checklistFromReadiness(items: ReadinessItem[], codes: string[], manual: Record<string, boolean>): Record<string, boolean> {
  const ok = (...c: ReadinessCode[]) => c.every(code => items.find(i => i.code === code)?.done);
  const auto: Record<string, boolean> = {
    vaccinations: ok("vaccinations"),
    owner_details: ok("contacts", "vet"),
    care: ok("care", "tick_flea"),
    terms: ok("terms"),
  };
  return Object.fromEntries(codes.map(code => [code, code in auto ? auto[code] : Boolean(manual[code])]));
}

export const AUTO_CHECKLIST_CODES = ["vaccinations", "owner_details", "care", "terms"];
