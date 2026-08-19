import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

const sb = supabase as any;

export interface DaycareDayNote {
  id: string;
  tenant_id: string;
  pet_id: string;
  customer_id: string | null;
  note_date: string;
  body: string;
  office_flag: boolean;
  handled_at: string | null;
  handled_by: string | null;
  author_profile_id: string | null;
  created_at: string;
  pet?: { id: string; name: string | null } | null;
  customer?: { id: string; full_name: string | null } | null;
  author?: { id: string; full_name: string | null; email: string | null } | null;
}

const SELECT =
  "*, pet:pets(id, name), customer:customers(id, full_name), author:profiles!daycare_day_notes_author_profile_id_fkey(id, full_name, email)";

/** All day notes for a given day (work board + admin board). */
export function useDaycareDayNotes(tenantId: string | null | undefined, dateIso: string) {
  return useQuery({
    queryKey: ["daycare_day_notes", tenantId, dateIso],
    enabled: Boolean(tenantId),
    refetchInterval: 60_000,
    queryFn: async (): Promise<DaycareDayNote[]> => {
      const { data, error } = await sb
        .from("daycare_day_notes")
        .select(SELECT)
        .eq("tenant_id", tenantId as string)
        .eq("note_date", dateIso)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DaycareDayNote[];
    },
  });
}

/** Notes flagged for the office that nobody has ticked off yet. */
export function useOpenOfficeNotes(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["daycare_day_notes", "open_office", tenantId],
    enabled: Boolean(tenantId),
    refetchInterval: 60_000,
    queryFn: async (): Promise<DaycareDayNote[]> => {
      const { data, error } = await sb
        .from("daycare_day_notes")
        .select(SELECT)
        .eq("tenant_id", tenantId as string)
        .eq("office_flag", true)
        .is("handled_at", null)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as DaycareDayNote[];
    },
  });
}

/** Notes history for one dog. */
export function usePetDayNotes(tenantId: string | null | undefined, petId: string | null | undefined) {
  return useQuery({
    queryKey: ["daycare_day_notes", "pet", tenantId, petId],
    enabled: Boolean(tenantId && petId),
    queryFn: async (): Promise<DaycareDayNote[]> => {
      const { data, error } = await sb
        .from("daycare_day_notes")
        .select(SELECT)
        .eq("tenant_id", tenantId as string)
        .eq("pet_id", petId as string)
        .order("note_date", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as DaycareDayNote[];
    },
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["daycare_day_notes"] });
  qc.invalidateQueries({ queryKey: ["nav-badges"] });
}

export function useCreateDayNote(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      petId: string;
      customerId?: string | null;
      petName?: string | null;
      dateIso: string;
      body: string;
      officeFlag: boolean;
      /** Also save to the dog's customer record as a pinned lasting note. */
      lasting?: boolean;
      authorProfileId?: string | null;
    }) => {
      const body = input.body.trim();
      const { error } = await sb.from("daycare_day_notes").insert({
        tenant_id: tenantId,
        pet_id: input.petId,
        customer_id: input.customerId ?? null,
        note_date: input.dateIso,
        body,
        office_flag: input.officeFlag,
        author_profile_id: input.authorProfileId ?? null,
      });
      if (error) throw error;

      if (input.lasting && input.customerId) {
        const { error: e2 } = await sb.from("customer_notes").insert({
          tenant_id: tenantId,
          customer_id: input.customerId,
          author_profile_id: input.authorProfileId ?? null,
          body: input.petName ? `${input.petName} — ${body}` : body,
          pinned: true,
          alert: false,
        });
        if (e2) throw e2;
      }
    },
    onSuccess: () => {
      invalidate(qc);
      qc.invalidateQueries({ queryKey: ["customer_notes"] });
    },
  });
}

export function useMarkDayNoteHandled(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; profileId?: string | null; handled?: boolean }) => {
      const handled = input.handled ?? true;
      const { error } = await sb
        .from("daycare_day_notes")
        .update({
          handled_at: handled ? new Date().toISOString() : null,
          handled_by: handled ? (input.profileId ?? null) : null,
        })
        .eq("id", input.id)
        .eq("tenant_id", tenantId);
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc),
  });
}
