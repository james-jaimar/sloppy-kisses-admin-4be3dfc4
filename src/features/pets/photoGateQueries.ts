import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

export type PhotoGateMode = "off" | "soft" | "hard";

export interface PetPhotoStatusRow {
  pet_id: string;
  has_photo: boolean;
  document_id: string | null;
  waived_until: string | null;
}

export interface BookingPhotoGateRow {
  pet_id: string;
  pet_name: string;
  status: "ok" | "waived" | "missing";
}

export function isPhotoWaiverActive(until: string | null | undefined) {
  if (!until) return false;
  return until >= new Date().toISOString().slice(0, 10);
}

/** Photo-on-file status for a set of pets. */
export function usePetPhotoStatus(petIds: string[]) {
  const key = [...petIds].sort().join(",");
  return useQuery({
    queryKey: ["pet_photo_status", key],
    enabled: petIds.length > 0,
    queryFn: async (): Promise<Record<string, PetPhotoStatusRow>> => {
      const { data, error } = await supabase!.rpc("pet_photo_status" as any, { p_pet_ids: petIds });
      if (error) throw error;
      const map: Record<string, PetPhotoStatusRow> = {};
      for (const r of (data ?? []) as PetPhotoStatusRow[]) map[r.pet_id] = r;
      return map;
    },
  });
}

/** Per-pet photo readiness for one booking. */
export function useBookingPhotoGate(bookingId: string | null | undefined) {
  return useQuery({
    queryKey: ["booking_photo_gate", bookingId],
    enabled: Boolean(bookingId),
    queryFn: async (): Promise<BookingPhotoGateRow[]> => {
      const { data, error } = await supabase!.rpc("booking_photo_gate" as any, { p_booking_id: bookingId });
      if (error) throw error;
      return (data ?? []) as BookingPhotoGateRow[];
    },
  });
}

export interface PetPhotoWaiver {
  photo_waived_until: string | null;
  photo_waiver_reason: string | null;
  photo_waiver_at: string | null;
}

export function usePetPhotoWaiver(petId: string | null | undefined) {
  return useQuery({
    queryKey: ["pet_photo_waiver", petId],
    enabled: Boolean(petId),
    queryFn: async (): Promise<PetPhotoWaiver | null> => {
      const { data, error } = await supabase!
        .from("pets")
        .select("photo_waived_until, photo_waiver_reason, photo_waiver_at")
        .eq("id", petId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as PetPhotoWaiver | null;
    },
  });
}

export function useSetPetPhotoWaiver(petId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { until: string | null; reason: string | null }) => {
      const { data: prof } = await supabase!.rpc("current_profile_id");
      const { error } = await supabase!
        .from("pets")
        .update({
          photo_waived_until: input.until,
          photo_waiver_reason: input.until ? input.reason : null,
          photo_waiver_by: input.until ? ((prof as unknown as string) ?? null) : null,
          photo_waiver_at: input.until ? new Date().toISOString() : null,
        } as never)
        .eq("id", petId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pet_photo_waiver", petId] });
      qc.invalidateQueries({ queryKey: ["pet_photo_status"] });
      qc.invalidateQueries({ queryKey: ["booking_photo_gate"] });
      qc.invalidateQueries({ queryKey: ["pets"] });
    },
  });
}