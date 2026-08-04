import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import type { AccommodationFormPayload } from "./accommodationForm";

const CUSTOMER_COLS =
  "id, full_name, first_name, last_name, email, mobile, phone_alt, id_number, home_address, address_line_1, address_line_2, suburb, city, postcode, emergency_contact_name, emergency_contact_relationship, emergency_contact_mobile, vet_clinic_name, vet_clinic_contact";

const PET_COLS =
  "id, name, species, breed, age_years, sex, size, size_override, marks_colour, behaviour_social, behaviour_nervous, behaviour_barker, behaviour_jumps, behaviour_notes, special_handling_flag, sterilised_status, is_spayed_neutered, microchipped, medical_notes, medical_aid_provider, medical_aid_number";

export function useAccommodationCustomer(customerId: string | null | undefined) {
  return useQuery({
    queryKey: ["accom_customer", customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select(CUSTOMER_COLS).eq("id", customerId!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useAccommodationPets(petIds: string[]) {
  const key = [...petIds].sort().join(",");
  return useQuery({
    queryKey: ["accom_pets", key],
    enabled: petIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("pets").select(PET_COLS).in("id", petIds);
      if (error) throw error;
      // preserve caller ordering
      return petIds.map((id) => (data ?? []).find((p: any) => p.id === id)).filter(Boolean) as any[];
    },
  });
}

/** Push any details the customer edited on the form back onto their master record. */
export function useAccommodationWriteBack() {
  return useMutation({
    mutationFn: async ({ customerId, form }: { customerId: string; form: AccommodationFormPayload }) => {
      const custPatch: Record<string, unknown> = {};
      if (form.owner.id_number) custPatch.id_number = form.owner.id_number;
      if (form.owner.mobile) custPatch.mobile = form.owner.mobile;
      if (form.owner.home_address) custPatch.home_address = form.owner.home_address;
      if (form.emergency_contact.full_name) custPatch.emergency_contact_name = form.emergency_contact.full_name;
      if (form.emergency_contact.relationship) custPatch.emergency_contact_relationship = form.emergency_contact.relationship;
      if (form.emergency_contact.mobile) custPatch.emergency_contact_mobile = form.emergency_contact.mobile;
      if (form.emergency_contact.alt_number) custPatch.phone_alt = form.emergency_contact.alt_number;
      if (form.vet.vet_name) custPatch.vet_clinic_name = form.vet.vet_name;
      if (form.vet.contact_number) custPatch.vet_clinic_contact = form.vet.contact_number;
      if (Object.keys(custPatch).length) {
        await supabase.from("customers").update(custPatch as never).eq("id", customerId);
      }

      for (const p of form.pets) {
        if (!p.pet_id) continue;
        const petPatch: Record<string, unknown> = {
          behaviour_social: p.behaviour.includes("Social"),
          behaviour_nervous: p.behaviour.includes("Nervous"),
          behaviour_barker: p.behaviour.includes("Barker"),
          behaviour_jumps: p.behaviour.includes("Jumps"),
        };
        if (p.breed) petPatch.breed = p.breed;
        if (p.colour_marks) petPatch.marks_colour = p.colour_marks;
        if (p.behaviour_other) petPatch.behaviour_notes = p.behaviour_other;
        if (p.health.includes("Microchipped")) petPatch.microchipped = true;
        if (p.health.includes("Sterilised / spayed / neutered")) petPatch.sterilised_status = "yes";
        await supabase.from("pets").update(petPatch as never).eq("id", p.pet_id);
      }
    },
  });
}
