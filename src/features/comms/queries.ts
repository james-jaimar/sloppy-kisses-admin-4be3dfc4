import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type NotificationEvent = Database["public"]["Tables"]["notification_events"]["Row"] & {
  customer?: { id: string; full_name: string | null; email: string | null } | null;
};

export type NotificationEventStatus = Database["public"]["Enums"]["notification_status"];

export function useNotificationEvents(
  tenantId: string | null | undefined,
  opts?: { status?: NotificationEventStatus | "all"; channel?: string; from?: string; to?: string; limit?: number },
) {
  return useQuery({
    queryKey: ["notification_events", tenantId, opts],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<NotificationEvent[]> => {
      let q = supabase
        .from("notification_events")
        .select("*, customer:customers(id, full_name, email)")
        .eq("tenant_id", tenantId as string)
        .order("created_at", { ascending: false })
        .limit(opts?.limit ?? 200);
      if (opts?.status && opts.status !== "all") q = q.eq("status", opts.status);
      if (opts?.channel) q = q.eq("channel", opts.channel as any);
      if (opts?.from) q = q.gte("created_at", opts.from);
      if (opts?.to) q = q.lte("created_at", opts.to);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any;
    },
  });
}

export function useBookingNotifications(tenantId: string | null, bookingId: string | null) {
  return useQuery({
    queryKey: ["notification_events", "booking", tenantId, bookingId],
    enabled: Boolean(tenantId && bookingId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_events")
        .select("*")
        .eq("tenant_id", tenantId as string)
        .eq("booking_id", bookingId as string)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useResendNotification(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (eventId: string) => {
      const { error } = await supabase
        .from("notification_events")
        .update({ status: "pending", error: null, attempts: 0, scheduled_for: null })
        .eq("id", eventId)
        .eq("tenant_id", tenantId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notification_events"] }),
  });
}

export function useCancelNotification(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (eventId: string) => {
      const { error } = await supabase
        .from("notification_events")
        .update({ status: "skipped", error: "Cancelled by operator" })
        .eq("id", eventId)
        .eq("tenant_id", tenantId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notification_events"] }),
  });
}

// -------- Auth email log (Supabase auth emails routed via auth-email-hook) --------
export type EmailLogRow = Database["public"]["Tables"]["email_log"]["Row"];

export function useAuthEmailLog(tenantId: string | null | undefined, opts?: { limit?: number; kind?: "all" | "auth" | "notify" }) {
  const kind = opts?.kind ?? "all";
  return useQuery({
    queryKey: ["email_log", kind, tenantId, opts],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<EmailLogRow[]> => {
      let q = supabase
        .from("email_log")
        .select("*")
        .eq("tenant_id", tenantId as string)
        .order("created_at", { ascending: false })
        .limit(opts?.limit ?? 100);
      if (kind === "auth") q = q.like("template_code", "auth.%");
      else if (kind === "notify") q = q.like("template_code", "notify.%");
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as EmailLogRow[];
    },
  });
}

// -------- Templates --------
export type MessageTemplate = Database["public"]["Tables"]["message_templates"]["Row"];

export function useMessageTemplates(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["message_templates", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("message_templates")
        .select("*")
        .eq("tenant_id", tenantId as string)
        .order("event_code");
      if (error) throw error;
      return (data ?? []) as MessageTemplate[];
    },
  });
}

export function useUpsertMessageTemplate(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Partial<MessageTemplate> & { event_code: string; channel: MessageTemplate["channel"]; name: string; body: string }) => {
      const payload = { tenant_id: tenantId, ...row };
      const { data, error } = await supabase
        .from("message_templates")
        .upsert(payload as any, { onConflict: "tenant_id,event_code,channel" })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["message_templates"] }),
  });
}

export function useDeleteMessageTemplate(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("message_templates").delete().eq("id", id).eq("tenant_id", tenantId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["message_templates"] }),
  });
}

// -------- Comms settings --------
export type CommsSettings = Database["public"]["Tables"]["comms_settings"]["Row"];

export function useCommsSettings(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["comms_settings", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      const { data, error } = await supabase.from("comms_settings").select("*").eq("tenant_id", tenantId as string).maybeSingle();
      if (error) throw error;
      return data as CommsSettings | null;
    },
  });
}

export function useUpdateCommsSettings(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<CommsSettings>) => {
      const { data, error } = await supabase
        .from("comms_settings")
        .upsert({ tenant_id: tenantId, ...patch } as any, { onConflict: "tenant_id" })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comms_settings"] }),
  });
}

// -------- Vaccination rules --------
export type VaccinationRule = Database["public"]["Tables"]["vaccination_rules"]["Row"];

export function useVaccinationRules(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["vaccination_rules", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vaccination_rules")
        .select("*")
        .eq("tenant_id", tenantId as string)
        .order("service_type")
        .order("vaccine_type");
      if (error) throw error;
      return (data ?? []) as VaccinationRule[];
    },
  });
}

export function useUpsertVaccinationRule(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Partial<VaccinationRule> & { service_type: VaccinationRule["service_type"]; vaccine_type: string; species: string }) => {
      const { data, error } = await supabase
        .from("vaccination_rules")
        .upsert({ tenant_id: tenantId, ...row } as any, { onConflict: "tenant_id,service_type,vaccine_type,species" })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vaccination_rules"] }),
  });
}

export function useDeleteVaccinationRule(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vaccination_rules").delete().eq("id", id).eq("tenant_id", tenantId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vaccination_rules"] }),
  });
}

// -------- Pet vaccinations --------
export type PetVaccination = Database["public"]["Tables"]["vaccinations"]["Row"];

export function usePetVaccinations(tenantId: string | null, petId: string | null | undefined) {
  return useQuery({
    queryKey: ["pet_vaccinations", tenantId, petId],
    enabled: Boolean(tenantId && petId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vaccinations")
        .select("*")
        .eq("tenant_id", tenantId as string)
        .eq("pet_id", petId as string)
        .order("expiry_date", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as PetVaccination[];
    },
  });
}

export function useUpsertPetVaccination(tenantId: string, petId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Partial<PetVaccination> & { vaccination_type: string }) => {
      const payload: any = { tenant_id: tenantId, pet_id: petId, ...row };
      const { data, error } = row.id
        ? await supabase.from("vaccinations").update(payload).eq("id", row.id).select().single()
        : await supabase.from("vaccinations").insert(payload).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pet_vaccinations"] });
    },
  });
}

export function useDeletePetVaccination(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vaccinations").delete().eq("id", id).eq("tenant_id", tenantId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pet_vaccinations"] }),
  });
}

// -------- Vax status helper --------
export type VaxCheckResult = {
  ok: boolean;
  missing: string[];
  expired: { vaccine_type: string; expiry_date: string | null }[];
};

export async function checkPetVaccinations(
  tenantId: string,
  petId: string,
  serviceType: Database["public"]["Enums"]["service_type"],
  species: string,
): Promise<VaxCheckResult> {
  const [rulesRes, vaxRes] = await Promise.all([
    supabase.from("vaccination_rules").select("*").eq("tenant_id", tenantId).eq("service_type", serviceType).eq("species", species).eq("required", true),
    supabase.from("vaccinations").select("vaccination_type, expiry_date").eq("tenant_id", tenantId).eq("pet_id", petId),
  ]);
  if (rulesRes.error) throw rulesRes.error;
  if (vaxRes.error) throw vaxRes.error;
  const rules = rulesRes.data ?? [];
  const vax = vaxRes.data ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const missing: string[] = [];
  const expired: { vaccine_type: string; expiry_date: string | null }[] = [];
  for (const r of rules) {
    const match = vax.find((v) => v.vaccination_type.toLowerCase() === r.vaccine_type.toLowerCase());
    if (!match) { missing.push(r.vaccine_type); continue; }
    if (match.expiry_date && match.expiry_date < today) {
      expired.push({ vaccine_type: r.vaccine_type, expiry_date: match.expiry_date });
    }
  }
  return { ok: missing.length === 0 && expired.length === 0, missing, expired };
}

export function usePetVaxCheck(
  tenantId: string | null,
  petId: string | null | undefined,
  serviceType: Database["public"]["Enums"]["service_type"] | null | undefined,
  species: string | null | undefined,
) {
  return useQuery({
    queryKey: ["vax_check", tenantId, petId, serviceType, species],
    enabled: Boolean(tenantId && petId && serviceType && species),
    queryFn: () => checkPetVaccinations(tenantId as string, petId as string, serviceType as any, species as string),
  });
}