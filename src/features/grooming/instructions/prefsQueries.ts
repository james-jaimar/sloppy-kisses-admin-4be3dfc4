import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import type { Selections } from "./queries";

export type PrefsState = "missing" | "from_pet" | "set";

function hasContent(row: { selections?: Selections | null; medical_flags?: string[] | null; notes?: string | null } | null | undefined) {
  if (!row) return false;
  const sel = row.selections ?? {};
  const anySel = Object.values(sel).some((v) =>
    Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined && v !== "" && v !== false,
  );
  return anySel || (row.medical_flags?.length ?? 0) > 0 || Boolean(row.notes && row.notes.trim());
}

export interface PrefsLookup {
  isLoading: boolean;
  /** Preference state for a booking, given the pets on that booking. */
  forBooking: (bookingId: string, petIds: string[]) => PrefsState;
  /** Bookings (of those passed in) with no preferences at all. */
  missingCount: number;
}

/**
 * Batched lookup of grooming preference coverage for a set of bookings.
 * Two queries: booking instructions for these bookings, pet defaults for their pets.
 */
export function useGroomingPrefsStates(
  bookings: { id: string; petIds: string[] }[],
): PrefsLookup {
  const bookingIds = bookings.map((b) => b.id).sort();
  const petIds = Array.from(new Set(bookings.flatMap((b) => b.petIds))).sort();

  const q = useQuery({
    queryKey: ["grooming_prefs_states", bookingIds.join(","), petIds.join(",")],
    enabled: bookingIds.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const [insRes, defRes] = await Promise.all([
        supabase
          .from("grooming_booking_instructions" as any)
          .select("booking_id, selections, medical_flags, notes")
          .in("booking_id", bookingIds),
        petIds.length
          ? supabase
              .from("pet_grooming_defaults" as any)
              .select("pet_id, selections, medical_flags, notes")
              .in("pet_id", petIds)
          : Promise.resolve({ data: [], error: null } as any),
      ]);
      if (insRes.error) throw insRes.error;
      if (defRes.error) throw defRes.error;
      const withInstructions = new Set<string>();
      for (const r of (insRes.data ?? []) as any[]) if (hasContent(r)) withInstructions.add(r.booking_id);
      const petsWithDefaults = new Set<string>();
      for (const r of (defRes.data ?? []) as any[]) if (hasContent(r)) petsWithDefaults.add(r.pet_id);
      return { withInstructions, petsWithDefaults };
    },
  });

  const withInstructions = q.data?.withInstructions ?? new Set<string>();
  const petsWithDefaults = q.data?.petsWithDefaults ?? new Set<string>();

  const forBooking = (bookingId: string, pets: string[]): PrefsState => {
    if (withInstructions.has(bookingId)) return "set";
    if (pets.length > 0 && pets.every((p) => petsWithDefaults.has(p))) return "from_pet";
    return "missing";
  };

  const missingCount = q.data
    ? bookings.filter((b) => forBooking(b.id, b.petIds) === "missing").length
    : 0;

  return { isLoading: q.isLoading, forBooking, missingCount };
}

/** Single-booking version for the booking detail page. */
export function useGroomingPrefsState(bookingId: string | null, petIds: string[]) {
  const lookup = useGroomingPrefsStates(bookingId ? [{ id: bookingId, petIds }] : []);
  return {
    isLoading: lookup.isLoading,
    state: bookingId ? lookup.forBooking(bookingId, petIds) : ("missing" as PrefsState),
  };
}
