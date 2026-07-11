import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export const WEEKDAYS: Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
export const WEEKDAY_LABEL: Record<Weekday, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
};

export function weekdayOf(date: Date): Weekday {
  // JS getDay(): 0 Sun..6 Sat
  const map: Weekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  return map[date.getDay()];
}

export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// -------------------- Plans --------------------

export interface DaycarePlan {
  id: string;
  tenant_id: string;
  name: string;
  days_per_week: number | null;
  price: number | null;
  billing_period: string;
  sort_order: number;
  active: boolean;
}

export function useDaycarePlans(tenantId: string | null | undefined, opts?: { activeOnly?: boolean }) {
  const activeOnly = opts?.activeOnly ?? false;
  return useQuery({
    queryKey: ["daycare_plans", tenantId, activeOnly],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<DaycarePlan[]> => {
      let q = supabase
        .from("daycare_plans")
        .select("id, tenant_id, name, days_per_week, price, billing_period, sort_order, active")
        .eq("tenant_id", tenantId as string)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (activeOnly) q = q.eq("active", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as DaycarePlan[];
    },
  });
}

export function useCreateDaycarePlan(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<DaycarePlan>) => {
      const { error } = await supabase.from("daycare_plans").insert({
        tenant_id: tenantId,
        name: input.name!,
        days_per_week: input.days_per_week ?? null,
        price: input.price ?? null,
        billing_period: input.billing_period ?? "month",
        sort_order: input.sort_order ?? 100,
        active: input.active ?? true,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["daycare_plans"] }),
  });
}

export function useUpdateDaycarePlan(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<DaycarePlan> }) => {
      const { error } = await supabase
        .from("daycare_plans")
        .update(patch as any)
        .eq("id", id)
        .eq("tenant_id", tenantId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["daycare_plans"] }),
  });
}

// -------------------- Enrolments --------------------

export interface DaycareEnrolment {
  id: string;
  tenant_id: string;
  pet_id: string;
  customer_id: string;
  daycare_plan_id: string | null;
  start_date: string;
  end_date: string | null;
  selected_days: string[];
  active: boolean;
  notes: string | null;
  pet: { id: string; name: string | null; species: string | null; breed: string | null } | null;
  customer: { id: string; full_name: string | null } | null;
  plan: { id: string; name: string } | null;
}

export function useDaycareEnrolments(tenantId: string | null | undefined, opts?: { activeOnly?: boolean }) {
  const activeOnly = opts?.activeOnly ?? false;
  return useQuery({
    queryKey: ["daycare_enrolments", tenantId, activeOnly],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<DaycareEnrolment[]> => {
      let q = supabase
        .from("daycare_enrolments")
        .select(`
          id, tenant_id, pet_id, customer_id, daycare_plan_id, start_date, end_date,
          selected_days, active, notes,
          pet:pets(id, name, species, breed),
          customer:customers(id, full_name),
          plan:daycare_plans(id, name)
        `)
        .eq("tenant_id", tenantId as string)
        .order("start_date", { ascending: false });
      if (activeOnly) q = q.eq("active", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any;
    },
  });
}

export function useCreateEnrolment(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      pet_id: string; customer_id: string; daycare_plan_id: string | null;
      start_date: string; end_date?: string | null; selected_days: string[]; notes?: string | null; active?: boolean;
    }) => {
      const { error } = await supabase.from("daycare_enrolments").insert({
        tenant_id: tenantId,
        ...input,
        active: input.active ?? true,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["daycare_enrolments"] }),
  });
}

export function useUpdateEnrolment(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<DaycareEnrolment> }) => {
      const { error } = await supabase
        .from("daycare_enrolments")
        .update(patch as any)
        .eq("id", id)
        .eq("tenant_id", tenantId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["daycare_enrolments"] }),
  });
}

// -------------------- Day swaps --------------------

export interface DaySwap {
  id: string;
  tenant_id: string;
  daycare_enrolment_id: string;
  pet_id: string;
  original_date: string;
  new_date: string;
  status: string;
  reason: string | null;
}

export function useDaySwapsForRange(tenantId: string | null | undefined, fromIso: string, toIso: string) {
  return useQuery({
    queryKey: ["daycare_day_swaps", tenantId, fromIso, toIso],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<DaySwap[]> => {
      const { data, error } = await supabase
        .from("daycare_day_swaps")
        .select("id, tenant_id, daycare_enrolment_id, pet_id, original_date, new_date, status, reason")
        .eq("tenant_id", tenantId as string)
        .or(`original_date.gte.${fromIso},new_date.gte.${fromIso}`);
      if (error) throw error;
      return (data ?? []).filter((s: any) => s.original_date <= toIso || s.new_date <= toIso) as DaySwap[];
    },
  });
}

export function useCreateDaySwap(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { daycare_enrolment_id: string; pet_id: string; original_date: string; new_date: string; reason?: string | null }) => {
      const { error } = await supabase.from("daycare_day_swaps").insert({
        tenant_id: tenantId,
        status: "approved",
        ...input,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["daycare_day_swaps"] }),
  });
}

// -------------------- Attendance --------------------

export type AttendanceStatus = "expected" | "checked_in" | "checked_out" | "not_arrived" | "walk_in";

export interface AttendanceRow {
  id: string;
  tenant_id: string;
  pet_id: string;
  customer_id: string;
  attendance_date: string;
  status: AttendanceStatus;
  expected: boolean;
  checked_in_at: string | null;
  checked_out_at: string | null;
  notes: string | null;
  pet: { id: string; name: string | null; species: string | null; breed: string | null } | null;
  customer: { id: string; full_name: string | null } | null;
}

export function useAttendanceForDay(tenantId: string | null | undefined, day: Date) {
  const dateIso = isoDate(day);
  return useQuery({
    queryKey: ["daycare_attendance", tenantId, dateIso],
    enabled: Boolean(tenantId),
    refetchInterval: 30000,
    queryFn: async (): Promise<AttendanceRow[]> => {
      const { data, error } = await supabase
        .from("daycare_attendance")
        .select(`
          id, tenant_id, pet_id, customer_id, attendance_date, status, expected,
          checked_in_at, checked_out_at, notes,
          pet:pets(id, name, species, breed),
          customer:customers(id, full_name)
        `)
        .eq("tenant_id", tenantId as string)
        .eq("attendance_date", dateIso);
      if (error) throw error;
      return (data ?? []) as any;
    },
  });
}

export function useAttendanceForRange(tenantId: string | null | undefined, fromIso: string, toIso: string, petId?: string | null) {
  return useQuery({
    queryKey: ["daycare_attendance_range", tenantId, fromIso, toIso, petId ?? "all"],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<AttendanceRow[]> => {
      let q = supabase
        .from("daycare_attendance")
        .select(`
          id, tenant_id, pet_id, customer_id, attendance_date, status, expected,
          checked_in_at, checked_out_at, notes,
          pet:pets(id, name, species, breed),
          customer:customers(id, full_name)
        `)
        .eq("tenant_id", tenantId as string)
        .gte("attendance_date", fromIso)
        .lte("attendance_date", toIso)
        .order("attendance_date", { ascending: false });
      if (petId) q = q.eq("pet_id", petId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any;
    },
  });
}

export function useUpsertAttendance(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      pet_id: string; customer_id: string; attendance_date: string;
      status: AttendanceStatus; expected?: boolean;
      checked_in_at?: string | null; checked_out_at?: string | null; notes?: string | null;
    }) => {
      if (input.id) {
        const { error } = await supabase
          .from("daycare_attendance")
          .update({
            status: input.status,
            checked_in_at: input.checked_in_at,
            checked_out_at: input.checked_out_at,
            notes: input.notes,
          } as any)
          .eq("id", input.id)
          .eq("tenant_id", tenantId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("daycare_attendance").insert({
          tenant_id: tenantId,
          pet_id: input.pet_id,
          customer_id: input.customer_id,
          attendance_date: input.attendance_date,
          status: input.status,
          expected: input.expected ?? true,
          checked_in_at: input.checked_in_at ?? null,
          checked_out_at: input.checked_out_at ?? null,
          notes: input.notes ?? null,
        } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["daycare_attendance"] });
      qc.invalidateQueries({ queryKey: ["daycare_attendance_range"] });
    },
  });
}

// -------------------- Workflow settings --------------------

export interface DaycareWorkflowSettings {
  id: string;
  tenant_id: string;
  arrival_window_start: string;
  arrival_window_end: string;
  late_arrival_cutoff: string;
  auto_checkout_time: string;
  block_unvaccinated: boolean;
}

export function useDaycareWorkflowSettings(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["daycare_workflow_settings", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<DaycareWorkflowSettings | null> => {
      const { data, error } = await supabase
        .from("daycare_workflow_settings")
        .select("*")
        .eq("tenant_id", tenantId as string)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as DaycareWorkflowSettings | null;
    },
  });
}

export function useUpdateDaycareWorkflowSettings(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<Omit<DaycareWorkflowSettings, "id" | "tenant_id">>) => {
      const { error } = await supabase
        .from("daycare_workflow_settings")
        .upsert({ tenant_id: tenantId, ...patch } as any, { onConflict: "tenant_id" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["daycare_workflow_settings"] }),
  });
}

// -------------------- Expected-today resolver --------------------

export interface ExpectedItem {
  key: string;
  pet_id: string;
  customer_id: string;
  pet_name: string;
  customer_name: string;
  plan_name: string | null;
  source: "enrolment" | "swap-in";
  enrolment_id: string;
}

/** Compose the expected-today list from active enrolments (weekday match) plus swap-ins,
 *  minus pets whose enrolment weekday was swapped out to another date. */
export function useExpectedForDay(tenantId: string | null | undefined, day: Date) {
  const enrolmentsQ = useDaycareEnrolments(tenantId, { activeOnly: true });
  const dateIso = isoDate(day);
  const swapsQ = useDaySwapsForRange(tenantId, dateIso, dateIso);

  const enrolments = enrolmentsQ.data ?? [];
  const swaps = swapsQ.data ?? [];
  const wd = weekdayOf(day);

  // Enrolments that would normally attend today
  const normal = enrolments.filter((e) => {
    if (!e.selected_days?.includes(wd)) return false;
    if (e.start_date && e.start_date > dateIso) return false;
    if (e.end_date && e.end_date < dateIso) return false;
    return true;
  });

  // Remove any enrolments that swapped OUT of today
  const swappedOutEnrolmentIds = new Set(
    swaps.filter((s) => s.original_date === dateIso && s.status !== "cancelled").map((s) => s.daycare_enrolment_id),
  );
  const kept = normal.filter((e) => !swappedOutEnrolmentIds.has(e.id));

  const items: ExpectedItem[] = kept.map((e) => ({
    key: `enrolment:${e.id}`,
    pet_id: e.pet_id,
    customer_id: e.customer_id,
    pet_name: e.pet?.name ?? "Unknown pet",
    customer_name: e.customer?.full_name ?? "",
    plan_name: e.plan?.name ?? null,
    source: "enrolment",
    enrolment_id: e.id,
  }));

  // Add swap-ins (swapped INTO today)
  const swapIns = swaps.filter((s) => s.new_date === dateIso && s.status !== "cancelled");
  for (const s of swapIns) {
    const enr = enrolments.find((e) => e.id === s.daycare_enrolment_id);
    if (!enr) continue;
    items.push({
      key: `swap:${s.id}`,
      pet_id: enr.pet_id,
      customer_id: enr.customer_id,
      pet_name: enr.pet?.name ?? "Unknown pet",
      customer_name: enr.customer?.full_name ?? "",
      plan_name: enr.plan?.name ?? null,
      source: "swap-in",
      enrolment_id: enr.id,
    });
  }

  return {
    items,
    isLoading: enrolmentsQ.isLoading || swapsQ.isLoading,
    error: enrolmentsQ.error || swapsQ.error,
  };
}

// -------------------- Pets/customers pickers --------------------

export function useTenantPetsWithOwners(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["daycare_pets_with_owners", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pets")
        .select("id, name, species, customer_id, customer:customers(id, full_name, first_name, last_name, mobile, phone_alt)")
        .eq("tenant_id", tenantId as string)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}