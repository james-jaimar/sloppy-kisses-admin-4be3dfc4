import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

export interface SnapTarget {
  tenantId: string;
  petId?: string | null;
  customerId?: string | null;
  bookingId?: string | null;
  docType: string;
  label?: string | null;
}

export interface SnapSession {
  id: string;
  token: string;
  expires_at: string;
  max_files: number;
}

/** Creates a short-lived phone upload session and returns its token. */
export function useCreateSnapSession() {
  return useMutation({
    mutationFn: async (t: SnapTarget): Promise<SnapSession> => {
      const { data, error } = await supabase!.functions.invoke("snap-upload", {
        body: {
          action: "create",
          tenant_id: t.tenantId,
          pet_id: t.petId ?? null,
          customer_id: t.customerId ?? null,
          booking_id: t.bookingId ?? null,
          doc_type: t.docType,
          label: t.label ?? null,
        },
      });
      if (error) throw new Error(await readFnError(error));
      return data as SnapSession;
    },
  });
}

/** Documents that landed through a given phone session (polled while the sheet is open). */
export function useSnapSessionDocuments(sessionId: string | null) {
  return useQuery({
    queryKey: ["snap_session_docs", sessionId],
    enabled: Boolean(sessionId),
    refetchInterval: 3000,
    queryFn: async () => {
      const { data, error } = await supabase!
        .from("documents")
        .select("id, file_name, status, content_type, created_at")
        .eq("upload_session_id", sessionId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export type PetDocKind = "pet_photo" | "vaccination";

/** What's already on file for a set of pets — drives the attachment tiles. */
export function usePetAttachmentStatus(petIds: string[]) {
  const key = [...petIds].sort().join(",");
  return useQuery({
    queryKey: ["pet_attachment_status", key],
    enabled: petIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase!
        .from("documents")
        .select("id, pet_id, type, file_name, status, created_at")
        .in("pet_id", petIds)
        .in("type", ["pet_photo", "vaccination"])
        .is("deleted_at", null)
        .neq("status", "rejected");
      if (error) throw error;
      const map: Record<string, Record<PetDocKind, boolean>> = {};
      for (const id of petIds) map[id] = { pet_photo: false, vaccination: false };
      for (const d of data ?? []) {
        const pid = (d as any).pet_id as string;
        const t = (d as any).type as PetDocKind;
        if (map[pid] && (t === "pet_photo" || t === "vaccination")) map[pid][t] = true;
      }
      return map;
    },
  });
}

export async function readFnError(error: any): Promise<string> {
  try {
    const text = typeof error?.context?.text === "function" ? await error.context.text() : null;
    if (text) {
      const parsed = JSON.parse(text);
      return parsed?.error ?? text;
    }
  } catch {
    /* not JSON */
  }
  return error?.message ?? "Something went wrong";
}
