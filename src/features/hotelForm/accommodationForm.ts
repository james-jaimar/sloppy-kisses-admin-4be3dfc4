import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

export const CHECK_IN_WINDOWS = ["09:00–11:00"];
export const CHECK_OUT_WINDOWS = ["09:00–09:30", "Stay & Play 16:00–16:30"];
/** Fixed arrival time used to build `start_at` — arrivals are only taken 09:00–11:00. */
export const CHECK_IN_TIME = "09:00";
export const CHECK_OUT_STANDARD = CHECK_OUT_WINDOWS[0];
export const CHECK_OUT_STAY_PLAY = CHECK_OUT_WINDOWS[1];

export function isStayPlayWindow(w: string | null | undefined): boolean {
  return (w ?? "").startsWith("Stay & Play");
}

/** Departure clock time implied by the selected check-out window. */
export function checkOutTimeFor(w: string | null | undefined): string {
  return isStayPlayWindow(w) ? "16:00" : "09:00";
}

/** Sundays (and public holidays) only allow the late 16:00–16:30 collection. */
export function checkOutWindowsFor(dateIso: string | null | undefined): string[] {
  if (!dateIso) return CHECK_OUT_WINDOWS;
  const d = new Date(`${dateIso}T00:00:00`);
  return d.getDay() === 0 ? [CHECK_OUT_STAY_PLAY] : CHECK_OUT_WINDOWS;
}

export const BEHAVIOUR_OPTIONS = ["Social", "Nervous", "Barker", "Jumps", "Needs extra care"];
export const HEALTH_OPTIONS = [
  "Sterilised / spayed / neutered",
  "Vaccinations up to date",
  "Microchipped",
];
/** Office check-in list — ticked by staff on the booking, not by the customer. */
export const OFFICE_CHECKLIST_OPTIONS = [
  "Food packed in labelled bags",
  "Medication received with instructions",
  "Belongings labelled",
  "Grooming requested for this stay",
];

export interface FormPet {
  pet_id: string | null;
  name: string;
  breed: string;
  age: string;
  sex: string;
  size: string;
  colour_marks: string;
  behaviour: string[];
  behaviour_other: string;
  health: string[];
  vax_dhpp: string;
  vax_rabies: string;
  vax_kennel_cough: string;
  tick_flea_product: string;
  tick_flea_date: string;
  feeding_instructions: string;
  medication_instructions: string;
  grooming_required: boolean;
  grooming_notes: string;
  notes: string;
}

export interface AccommodationFormPayload {
  owner: {
    full_name: string;
    id_number: string;
    email: string;
    mobile: string;
    home_address: string;
  };
  emergency_contact: {
    full_name: string;
    relationship: string;
    mobile: string;
    alt_number: string;
  };
  vet: {
    vet_name: string;
    contact_number: string;
    has_medical_aid: boolean;
    policy_details: string;
  };
  check_in_window: string;
  check_out_window: string;
  pickup_required: boolean;
  dropoff_required: boolean;
  collection_address: string;
  pets: FormPet[];
  /** @deprecated kept for older submissions — care notes are captured per pet now. */
  feeding_instructions?: string;
  /** @deprecated kept for older submissions — care notes are captured per pet now. */
  medication_instructions?: string;
  /** @deprecated kept for older submissions. */
  grooming_required?: boolean;
  /** @deprecated kept for older submissions. */
  grooming_instructions?: string;
  belongings_notes: string;
  emergency_notes: string;
  additional_notes: string;
  attachments: string[];
  acknowledgement: {
    accepted: boolean;
    signed_name: string;
    signed_at: string;
    signed_place: string;
    guidelines_version?: number | null;
  };
}

export function emptyPet(petId: string | null = null, name = ""): FormPet {
  return {
    pet_id: petId,
    name,
    breed: "",
    age: "",
    sex: "",
    size: "",
    colour_marks: "",
    behaviour: [],
    behaviour_other: "",
    health: [],
    vax_dhpp: "",
    vax_rabies: "",
    vax_kennel_cough: "",
    tick_flea_product: "",
    tick_flea_date: "",
    feeding_instructions: "",
    medication_instructions: "",
    grooming_required: false,
    grooming_notes: "",
    notes: "",
  };
}

/** Latest accommodation form linked to a booking (via hotel_booking_details). */
export function useAccommodationForm(bookingId: string | null | undefined) {
  return useQuery({
    queryKey: ["accommodation-form", bookingId],
    enabled: Boolean(bookingId),
    queryFn: async () => {
      const { data: det, error } = await supabase
        .from("hotel_booking_details")
        .select("form_submission_id, form_received_at")
        .eq("booking_id", bookingId!)
        .maybeSingle();
      if (error) throw error;
      if (!det?.form_submission_id) return { receivedAt: null, payload: null as AccommodationFormPayload | null };
      const { data: sub, error: e2 } = await supabase
        .from("form_submissions")
        .select("payload, created_at")
        .eq("id", det.form_submission_id)
        .maybeSingle();
      if (e2) throw e2;
      return {
        receivedAt: det.form_received_at,
        payload: (sub?.payload ?? null) as unknown as AccommodationFormPayload | null,
      };
    },
  });
}

export function useSubmitAccommodationForm(bookingId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: AccommodationFormPayload) => {
      const { data, error } = await supabase.rpc("submit_accommodation_form", {
        p_booking_id: bookingId!,
        p_payload: payload as unknown as never,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accommodation-form", bookingId] });
      qc.invalidateQueries({ queryKey: ["booking-details"] });
      qc.invalidateQueries({ queryKey: ["portal_booking", bookingId] });
    },
  });
}