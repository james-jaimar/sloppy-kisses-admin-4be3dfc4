import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

export type GateMode = "off" | "warn" | "block";

export interface ParasiteRule {
  id: string;
  tenant_id: string;
  kind: string;
  label: string;
  interval_days: number;
  grace_days: number;
  gate_mode: GateMode;
  species: string;
  chargeable_on_arrival: boolean;
  active: boolean;
  sort_order: number;
}

export interface ParasiteTreatment {
  id: string;
  tenant_id: string;
  pet_id: string;
  kind: string;
  administered_on: string;
  next_due_date: string | null;
  product_name: string | null;
  notes: string | null;
}

export interface HealthHold {
  id: string;
  tenant_id: string;
  pet_id: string;
  reason: string;
  notes: string | null;
  started_on: string;
  expected_clear_on: string | null;
  blocks_attendance: boolean;
  cleared_at: string | null;
  clearance_notes: string | null;
  clearance_document_id: string | null;
}

export interface HealthGateTreatment {
  kind: string;
  label: string;
  gate_mode: GateMode;
  chargeable_on_arrival: boolean;
  last_administered: string | null;
  next_due_date: string | null;
  status: "ok" | "due" | "overdue" | "missing";
}

export interface HealthGate {
  ok: boolean;
  blocked: boolean;
  treatments: HealthGateTreatment[];
  holds: Array<Pick<HealthHold, "id" | "reason" | "notes" | "started_on" | "blocks_attendance">>;
}

export const HOLD_REASONS = [
  { value: "on_heat", label: "On heat" },
  { value: "contagious", label: "Contagious illness" },
  { value: "injury", label: "Injury / recovering" },
  { value: "behaviour", label: "Behaviour review" },
  { value: "other", label: "Other" },
] as const;

export function holdReasonLabel(value: string) {
  return HOLD_REASONS.find((r) => r.value === value)?.label ?? value;
}

/* ---------------- Parasite treatment rules (settings) ---------------- */

export function useParasiteRules(tenantId: string | null, opts?: { activeOnly?: boolean }) {
  const activeOnly = opts?.activeOnly ?? false;
  return useQuery({
    queryKey: ["parasite_treatment_rules", tenantId, activeOnly],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<ParasiteRule[]> => {
      let q = supabase
        .from("parasite_treatment_rules" as any)
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("sort_order");
      if (activeOnly) q = q.eq("active", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as ParasiteRule[];
    },
  });
}

export function useUpsertParasiteRule(tenantId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<ParasiteRule> & { kind: string; label: string }) => {
      const payload = { ...input, tenant_id: tenantId };
      const { error } = input.id
        ? await supabase.from("parasite_treatment_rules" as any).update(payload as any).eq("id", input.id)
        : await supabase.from("parasite_treatment_rules" as any).insert(payload as any);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["parasite_treatment_rules"] }),
  });
}

export function useDeleteParasiteRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("parasite_treatment_rules" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["parasite_treatment_rules"] }),
  });
}

/* ---------------- Per-pet treatments ---------------- */

export function usePetParasiteTreatments(tenantId: string | null, petId: string | null) {
  return useQuery({
    queryKey: ["pet_parasite_treatments", tenantId, petId],
    enabled: Boolean(tenantId && petId),
    queryFn: async (): Promise<ParasiteTreatment[]> => {
      const { data, error } = await supabase
        .from("pet_parasite_treatments")
        .select("*")
        .eq("tenant_id", tenantId!)
        .eq("pet_id", petId!)
        .order("administered_on", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ParasiteTreatment[];
    },
  });
}

export function useRecordTreatment(tenantId: string | null, petId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { kind: string; administered_on: string; product_name?: string | null; notes?: string | null }) => {
      const { error } = await supabase.from("pet_parasite_treatments").insert({
        tenant_id: tenantId!,
        pet_id: petId!,
        ...input,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pet_parasite_treatments"] });
      qc.invalidateQueries({ queryKey: ["pet_health_gate"] });
    },
  });
}

export function useDeleteTreatment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pet_parasite_treatments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pet_parasite_treatments"] });
      qc.invalidateQueries({ queryKey: ["pet_health_gate"] });
    },
  });
}

/* ---------------- Health holds ---------------- */

export function usePetHealthHolds(tenantId: string | null, petId: string | null, opts?: { openOnly?: boolean }) {
  const openOnly = opts?.openOnly ?? false;
  return useQuery({
    queryKey: ["pet_health_holds", tenantId, petId, openOnly],
    enabled: Boolean(tenantId && petId),
    queryFn: async (): Promise<HealthHold[]> => {
      let q = supabase
        .from("pet_health_holds" as any)
        .select("*")
        .eq("tenant_id", tenantId!)
        .eq("pet_id", petId!)
        .order("started_on", { ascending: false });
      if (openOnly) q = q.is("cleared_at", null);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as HealthHold[];
    },
  });
}

export function useCreateHealthHold(tenantId: string | null, petId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { reason: string; notes?: string | null; started_on: string; expected_clear_on?: string | null; blocks_attendance: boolean }) => {
      const { error } = await supabase.from("pet_health_holds" as any).insert({
        tenant_id: tenantId!,
        pet_id: petId!,
        ...input,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pet_health_holds"] });
      qc.invalidateQueries({ queryKey: ["pet_health_gate"] });
    },
  });
}

export function useClearHealthHold() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, clearance_notes, clearance_document_id }: { id: string; clearance_notes?: string | null; clearance_document_id?: string | null }) => {
      const { error } = await supabase
        .from("pet_health_holds" as any)
        .update({
          cleared_at: new Date().toISOString(),
          clearance_notes: clearance_notes ?? null,
          clearance_document_id: clearance_document_id ?? null,
        } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pet_health_holds"] });
      qc.invalidateQueries({ queryKey: ["pet_health_gate"] });
    },
  });
}

/* ---------------- Gate status ---------------- */

export function usePetHealthGate(petId: string | null, onDate?: string) {
  return useQuery({
    queryKey: ["pet_health_gate", petId, onDate ?? null],
    enabled: Boolean(petId),
    queryFn: async (): Promise<HealthGate> => {
      const { data, error } = await supabase.rpc("pet_health_gate" as any, {
        p_pet_id: petId,
        ...(onDate ? { p_on: onDate } : {}),
      });
      if (error) throw error;
      return (data ?? { ok: true, blocked: false, treatments: [], holds: [] }) as unknown as HealthGate;
    },
  });
}

export function useChargeArrivalTreatment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { bookingId: string; petId: string; kind?: string; product?: string | null; note?: string | null }) => {
      const { data, error } = await supabase.rpc("charge_arrival_parasite_treatment" as any, {
        p_booking_id: input.bookingId,
        p_pet_id: input.petId,
        p_kind: input.kind ?? "tick_flea",
        p_product: input.product ?? null,
        p_note: input.note ?? null,
      });
      if (error) throw error;
      return data as { charged: number; invoice_id: string | null };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pet_parasite_treatments"] });
      qc.invalidateQueries({ queryKey: ["pet_health_gate"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["booking"] });
    },
  });
}