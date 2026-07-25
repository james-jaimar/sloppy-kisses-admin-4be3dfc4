import type { ServiceType } from "@/features/bookings/queries";
import type {
  GroomingDetails,
  HotelDetails,
  TransportDetails,
} from "@/features/bookings/detailsQueries";
import type { BookingRequestListRow } from "./queries";

/**
 * Cross-service convert-request dispatcher (Sprint 5).
 *
 * Maps a booking_requests row (with its typed request_payload written by the
 * portal wizards) into the prefill shape BookingFormModal understands, so a
 * single "Convert" action works for every service type.
 */

export interface ConvertPrefill {
  customer_id?: string;
  pet_ids: string[];
  service_type: ServiceType;
  start_at?: string;
  end_at?: string;
  booking_request_id: string;
  notes_customer?: string | null;
  grooming?: Partial<GroomingDetails>;
  hotel?: Partial<HotelDetails>;
  transport?: Partial<TransportDetails>;
  grooming_instructions?: {
    selections: Record<string, any>;
    medical_flags: string[];
    notes: string;
  } | null;
}

function joinAddress(a: any): string | null {
  if (!a || typeof a !== "object") return null;
  const parts = [a.line_1, a.line_2, a.suburb, a.city].filter(
    (p) => typeof p === "string" && p.trim().length > 0,
  );
  return parts.length ? parts.join(", ") : null;
}

export function buildBookingPrefillFromRequest(
  request: BookingRequestListRow,
): ConvertPrefill {
  const payload: Record<string, any> = request.request_payload ?? {};
  const petIdsFromPayload: string[] = Array.isArray(payload.pet_ids)
    ? payload.pet_ids.filter((x: any) => typeof x === "string")
    : [];
  const petIds =
    petIdsFromPayload.length > 0
      ? petIdsFromPayload
      : request.pet_id
        ? [request.pet_id]
        : [];

  const base: ConvertPrefill = {
    customer_id: request.customer_id ?? undefined,
    pet_ids: petIds,
    service_type: request.service_type as ServiceType,
    start_at: request.preferred_start_at ?? undefined,
    end_at: request.preferred_end_at ?? undefined,
    booking_request_id: request.id,
    notes_customer: request.customer_notes,
  };

  switch (request.service_type) {
    case "hotel_dog":
    case "hotel_cat":
      return {
        ...base,
        hotel: {
          accommodation_type: payload.room_preference ?? null,
          feeding_instructions: payload.diet_medication ?? null,
          medication_instructions: payload.diet_medication ?? null,
          additional_notes: request.customer_notes ?? null,
          grooming_required: Boolean(payload.grooming_required),
          grooming_instructions: payload.grooming_instructions ?? null,
          pickup_required: Boolean(payload.pickup_required),
          dropoff_required: Boolean(payload.dropoff_required),
          belongings_notes: null,
          emergency_notes: null,
          check_in_window: null,
          check_out_window: null,
        },
      };

    case "grooming_inhouse":
    case "grooming_mobile": {
      const mobile = request.service_type === "grooming_mobile";
      const instr = payload.instructions && typeof payload.instructions === "object"
        ? {
            selections: payload.instructions.selections ?? {},
            medical_flags: Array.isArray(payload.instructions.medical_flags)
              ? payload.instructions.medical_flags
              : [],
            notes: typeof payload.instructions.notes === "string" ? payload.instructions.notes : "",
          }
        : null;
      return {
        ...base,
        grooming_instructions: instr,
        grooming: {
          grooming_mode: mobile ? "mobile" : "inhouse",
          package_id: payload.package_id ?? null,
          service_package: null,
          groomer_name: null,
          duration_minutes: null,
          travel_fee: null,
          surcharge_amount: null,
          matted_surcharge_zar: null,
          sedation_surcharge_zar: null,
          pensioner_discount: false,
          recurring: false,
          grooming_notes:
            [
              payload.time_window ? `Preferred window: ${payload.time_window}` : null,
              mobile && payload.service_address
                ? `Service address: ${joinAddress(payload.service_address)}`
                : null,
              mobile && payload.access_notes
                ? `Access: ${payload.access_notes}`
                : null,
              request.customer_notes ?? null,
            ]
              .filter(Boolean)
              .join("\n") || null,
        },
      };
    }

    case "pickup_dropoff": {
      const dir = payload.direction;
      const direction: TransportDetails["direction"] =
        dir === "pickup" || dir === "dropoff" || dir === "round_trip"
          ? dir
          : null;
      const addr = joinAddress(payload.pickup_address);
      return {
        ...base,
        transport: {
          direction,
          pickup_address: direction === "dropoff" ? null : addr,
          dropoff_address: direction === "pickup" ? null : addr,
          suburb: payload.pickup_address?.suburb ?? null,
          gate_code: null,
          planned_window_start: request.preferred_start_at ?? null,
          planned_window_end: request.preferred_end_at ?? null,
          driver_notes: payload.access_notes ?? null,
        },
      };
    }

    case "daycare":
    case "daycare_assessment":
    default:
      return base;
  }
}