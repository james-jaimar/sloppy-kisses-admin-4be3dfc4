import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

export interface PetPhotoDoc {
  id: string;
  pet_id: string;
  file_name: string;
  content_type: string | null;
  created_at: string;
}

export interface PetPhoto extends PetPhotoDoc {
  url: string | null;
}

async function fetchPetPhotoDocs(petIds: string[]): Promise<PetPhotoDoc[]> {
  const { data, error } = await supabase!
    .from("documents")
    .select("id, pet_id, file_name, content_type, created_at")
    .in("pet_id", petIds)
    .eq("type", "pet_photo")
    .is("deleted_at", null)
    .in("status", ["uploaded", "verified"])
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PetPhotoDoc[];
}

async function signMany(ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const { data, error } = await supabase!.functions.invoke("documents-sign-download", {
    body: { document_ids: ids },
  });
  if (error) return {};
  const map: Record<string, string> = {};
  for (const u of ((data as any)?.urls ?? []) as { id: string; download_url: string }[]) {
    map[u.id] = u.download_url;
  }
  return map;
}

/**
 * Latest photo per pet, with a short-lived thumbnail URL.
 * Batched on purpose: a daycare board renders dozens of pets at once.
 */
export function usePetPhotos(petIds: (string | null | undefined)[]) {
  const ids = Array.from(new Set(petIds.filter(Boolean) as string[])).sort();
  return useQuery({
    queryKey: ["pet_photos", ids.join(",")],
    enabled: ids.length > 0,
    staleTime: 4 * 60_000,
    refetchInterval: 4 * 60_000,
    queryFn: async (): Promise<Record<string, PetPhoto>> => {
      const docs = await fetchPetPhotoDocs(ids);
      const latest: Record<string, PetPhotoDoc> = {};
      for (const d of docs) if (!latest[d.pet_id]) latest[d.pet_id] = d;
      const picks = Object.values(latest);
      const urls = await signMany(picks.map((d) => d.id));
      const out: Record<string, PetPhoto> = {};
      for (const d of picks) out[d.pet_id] = { ...d, url: urls[d.id] ?? null };
      return out;
    },
  });
}

/** Every photo on file for one pet — the history strip on the pet profile. */
export function usePetPhotoHistory(petId: string | null | undefined) {
  return useQuery({
    queryKey: ["pet_photo_history", petId],
    enabled: Boolean(petId),
    staleTime: 4 * 60_000,
    queryFn: async (): Promise<PetPhoto[]> => {
      const docs = await fetchPetPhotoDocs([petId!]);
      const urls = await signMany(docs.map((d) => d.id));
      return docs.map((d) => ({ ...d, url: urls[d.id] ?? null }));
    },
  });
}

/** Promote an older picture back to being the pet's main photo. */
export function useSetMainPetPhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (documentId: string) => {
      const { error } = await supabase!
        .from("documents")
        .update({ created_at: new Date().toISOString() })
        .eq("id", documentId);
      if (error) throw error;
    },
    onSuccess: () => invalidatePetPhotos(qc),
  });
}

export function invalidatePetPhotos(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["pet_photos"] });
  qc.invalidateQueries({ queryKey: ["pet_photo_history"] });
  qc.invalidateQueries({ queryKey: ["pet_attachment_status"] });
  qc.invalidateQueries({ queryKey: ["pet_photo_status"] });
  qc.invalidateQueries({ queryKey: ["booking_photo_gate"] });
}

export function isFreshToday(createdAt: string | null | undefined) {
  if (!createdAt) return false;
  return createdAt.slice(0, 10) === new Date().toISOString().slice(0, 10);
}
