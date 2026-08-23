import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

export type GroupKind = "single" | "multi" | "text" | "number" | "bool";

export interface InstructionGroup {
  id: string;
  tenant_id: string;
  code: string;
  label: string;
  kind: GroupKind;
  sort_order: number;
  active: boolean;
  is_medical: boolean;
  icon: string | null;
  colour: string | null;
}

export interface InstructionOption {
  id: string;
  group_id: string;
  tenant_id: string;
  code: string;
  label: string;
  sort_order: number;
  active: boolean;
  is_alert: boolean;
  addon_code: string | null;
}

export type Selections = Record<string, string | string[] | number | boolean | null>;

export function useInstructionCatalog(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["grooming_instruction_catalog", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      const [groupsRes, optsRes] = await Promise.all([
        supabase.from("grooming_instruction_groups" as any).select("*").eq("tenant_id", tenantId as string).eq("active", true).order("sort_order"),
        supabase.from("grooming_instruction_options" as any).select("*").eq("tenant_id", tenantId as string).eq("active", true).order("sort_order"),
      ]);
      if (groupsRes.error) throw groupsRes.error;
      if (optsRes.error) throw optsRes.error;
      const groups = (groupsRes.data ?? []) as unknown as InstructionGroup[];
      const options = (optsRes.data ?? []) as unknown as InstructionOption[];
      const byGroup: Record<string, InstructionOption[]> = {};
      for (const o of options) (byGroup[o.group_id] ||= []).push(o);
      return { groups, options, byGroup };
    },
  });
}

// ---- Full CRUD catalog for settings page ----
export function useAllInstructionGroups(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["grooming_instruction_groups_all", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<InstructionGroup[]> => {
      const { data, error } = await supabase.from("grooming_instruction_groups" as any).select("*").eq("tenant_id", tenantId as string).order("sort_order");
      if (error) throw error;
      return (data ?? []) as unknown as InstructionGroup[];
    },
  });
}

export function useAllInstructionOptions(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["grooming_instruction_options_all", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<InstructionOption[]> => {
      const { data, error } = await supabase.from("grooming_instruction_options" as any).select("*").eq("tenant_id", tenantId as string).order("sort_order");
      if (error) throw error;
      return (data ?? []) as unknown as InstructionOption[];
    },
  });
}

export function useUpsertInstructionGroup(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Partial<InstructionGroup> & { code: string; label: string }) => {
      const payload: any = { tenant_id: tenantId, ...row };
      const { error } = await supabase.from("grooming_instruction_groups" as any).upsert(payload, { onConflict: "id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["grooming_instruction_groups_all"] });
      qc.invalidateQueries({ queryKey: ["grooming_instruction_catalog"] });
    },
  });
}

export function useDeleteInstructionGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("grooming_instruction_groups" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["grooming_instruction_groups_all"] });
      qc.invalidateQueries({ queryKey: ["grooming_instruction_catalog"] });
    },
  });
}

export function useUpsertInstructionOption(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Partial<InstructionOption> & { group_id: string; code: string; label: string }) => {
      const payload: any = { tenant_id: tenantId, ...row };
      const { error } = await supabase.from("grooming_instruction_options" as any).upsert(payload, { onConflict: "id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["grooming_instruction_options_all"] });
      qc.invalidateQueries({ queryKey: ["grooming_instruction_catalog"] });
    },
  });
}

export function useDeleteInstructionOption() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("grooming_instruction_options" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["grooming_instruction_options_all"] });
      qc.invalidateQueries({ queryKey: ["grooming_instruction_catalog"] });
    },
  });
}

// ---- Pet defaults ----
export interface PetGroomingDefaults {
  pet_id: string;
  tenant_id: string;
  selections: Selections;
  medical_flags: string[];
  notes: string | null;
}

export function usePetGroomingDefaults(petId: string | null | undefined) {
  return useQuery({
    queryKey: ["pet_grooming_defaults", petId],
    enabled: Boolean(petId),
    queryFn: async (): Promise<PetGroomingDefaults | null> => {
      const { data, error } = await supabase.from("pet_grooming_defaults" as any).select("*").eq("pet_id", petId as string).maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as PetGroomingDefaults | null;
    },
  });
}

export function useSavePetGroomingDefaults(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: { pet_id: string; selections: Selections; medical_flags: string[]; notes?: string | null }) => {
      const payload: any = { tenant_id: tenantId, ...row };
      const { error } = await supabase.from("pet_grooming_defaults" as any).upsert(payload, { onConflict: "pet_id" });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["pet_grooming_defaults", vars.pet_id] }),
  });
}

// ---- Booking instructions ----
export interface BookingInstructions {
  booking_id: string;
  tenant_id: string;
  selections: Selections;
  medical_flags: string[];
  notes: string | null;
  told_office_to_call: string | null;
}

export function useBookingInstructions(bookingId: string | null | undefined) {
  return useQuery({
    queryKey: ["grooming_booking_instructions", bookingId],
    enabled: Boolean(bookingId),
    queryFn: async (): Promise<BookingInstructions | null> => {
      const { data, error } = await supabase.from("grooming_booking_instructions" as any).select("*").eq("booking_id", bookingId as string).maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as BookingInstructions | null;
    },
  });
}

export function useSaveBookingInstructions(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: { booking_id: string; selections: Selections; medical_flags: string[]; notes?: string | null; told_office_to_call?: string | null }) => {
      const payload: any = { tenant_id: tenantId, ...row };
      const { error } = await supabase.from("grooming_booking_instructions" as any).upsert(payload, { onConflict: "booking_id" });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["grooming_booking_instructions", vars.booking_id] }),
  });
}
// ---- Brief tick-offs (Work mode accountability) ----
export interface BriefCheck {
  id: string;
  booking_id: string;
  pet_id: string | null;
  group_code: string;
  done: boolean;
  done_at: string | null;
}

export function useBriefChecks(bookingId: string | null | undefined) {
  return useQuery({
    queryKey: ["booking_brief_checks", bookingId],
    enabled: Boolean(bookingId),
    queryFn: async (): Promise<BriefCheck[]> => {
      const { data, error } = await supabase
        .from("booking_brief_checks" as any)
        .select("id, booking_id, pet_id, group_code, done, done_at")
        .eq("booking_id", bookingId as string);
      if (error) throw error;
      return (data ?? []) as unknown as BriefCheck[];
    },
  });
}

export function useToggleBriefCheck(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      bookingId: string;
      petId: string | null;
      groupCode: string;
      done: boolean;
      existingId?: string | null;
    }) => {
      const stamp = vars.done ? new Date().toISOString() : null;
      if (vars.existingId) {
        const { error } = await supabase
          .from("booking_brief_checks" as any)
          .update({ done: vars.done, done_at: stamp } as any)
          .eq("id", vars.existingId);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("booking_brief_checks" as any).insert({
        tenant_id: tenantId,
        booking_id: vars.bookingId,
        pet_id: vars.petId,
        group_code: vars.groupCode,
        done: vars.done,
        done_at: stamp,
      } as any);
      if (error) throw error;
    },
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: ["booking_brief_checks", vars.bookingId] }),
  });
}
