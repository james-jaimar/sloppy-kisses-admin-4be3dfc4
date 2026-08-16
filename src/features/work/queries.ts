import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import type { BookingStatus, ServiceType } from "@/features/bookings/queries";

const sb = supabase as any;

export function isoDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const GROOMING_SERVICES: ServiceType[] = ["grooming_inhouse", "grooming_mobile"];
export const GROOMING_INHOUSE_SERVICES: ServiceType[] = ["grooming_inhouse"];
export const GROOMING_MOBILE_SERVICES: ServiceType[] = ["grooming_mobile"];
export const HOTEL_SERVICES: ServiceType[] = ["hotel_dog", "hotel_cat"];
export const DAYCARE_SERVICES: ServiceType[] = ["daycare", "daycare_assessment"];
export const TRANSPORT_SERVICES: ServiceType[] = ["pickup_dropoff"];

export type WorkDept = "grooming" | "grooming_mobile" | "hotel" | "daycare" | "transport";

export const DEPT_SERVICES: Record<WorkDept, ServiceType[]> = {
  grooming: GROOMING_INHOUSE_SERVICES,
  grooming_mobile: GROOMING_MOBILE_SERVICES,
  hotel: HOTEL_SERVICES,
  daycare: DAYCARE_SERVICES,
  transport: TRANSPORT_SERVICES,
};

export const DEPT_LABEL: Record<WorkDept, string> = {
  grooming: "In-house grooming",
  grooming_mobile: "Mobile grooming",
  hotel: "Hotel & cattery",
  daycare: "Daycare",
  transport: "Transport",
};

export function deptForService(s: ServiceType): WorkDept {
  if (s === "grooming_mobile") return "grooming_mobile";
  if (GROOMING_SERVICES.includes(s)) return "grooming";
  if (HOTEL_SERVICES.includes(s)) return "hotel";
  if (DAYCARE_SERVICES.includes(s)) return "daycare";
  return "transport";
}

export interface WorkJob {
  id: string;
  booking_number: string;
  status: BookingStatus;
  service_type: ServiceType;
  start_at: string | null;
  end_at: string | null;
  customer: { id: string; full_name: string | null; mobile: string | null } | null;
  pets: WorkJobPet[];
  resource: { id: string; name: string } | null;
  signed_off: boolean;
}

export interface WorkJobPet {
  id: string;
  name: string | null;
  breed: string | null;
  species: string | null;
  sex?: string | null;
  size?: string | null;
  size_override?: string | null;
  date_of_birth?: string | null;
  medical_notes?: string | null;
  behaviour_notes?: string | null;
  behaviour_aggressive_history?: boolean | null;
  behaviour_nervous?: boolean | null;
  behaviour_barker?: boolean | null;
  behaviour_jumps?: boolean | null;
  behaviour_social?: boolean | null;
}

export interface WorkJobAddress {
  address_line_1: string | null;
  address_line_2: string | null;
  suburb: string | null;
  city: string | null;
  province: string | null;
  postcode: string | null;
  formatted_address: string | null;
  access_notes: string | null;
  latitude: number | null;
  longitude: number | null;
}

export const WORK_JOB_ADDRESS_COLUMNS = `
  address_line_1, address_line_2, suburb, city, province, postcode,
  formatted_address, access_notes, latitude, longitude
`;

export interface WorkJobAddon {
  id: string;
  addon_name: string | null;
  qty: number | null;
  price_zar_snapshot: number | null;
  note: string | null;
}

export interface WorkJobGroomingDetails {
  actual_start_at: string | null;
  actual_end_at: string | null;
  service_package: string | null;
  groomer_name: string | null;
  duration_minutes: number | null;
  travel_fee: number | null;
  grooming_notes: string | null;
  stay_and_play_after: boolean | null;
  pensioner_discount_applied: boolean | null;
  matted_surcharge_zar: number | null;
  sedation_surcharge_zar: number | null;
  hotel_checkout_discount_pct: number | null;
}

const JOB_SELECT = `
  id, booking_number, status, service_type, start_at, end_at,
  customer:customers(id, full_name, mobile),
  resource:resources(id, name),
  booking_pets(pet:pets(
    id, name, breed, species, sex, size, size_override, date_of_birth,
    medical_notes, behaviour_notes, behaviour_aggressive_history,
    behaviour_nervous, behaviour_barker, behaviour_jumps, behaviour_social
  )),
  signoff:booking_signoffs(id)
`;

function mapJob(b: any): WorkJob {
  return {
    id: b.id,
    booking_number: b.booking_number,
    status: b.status,
    service_type: b.service_type,
    start_at: b.start_at,
    end_at: b.end_at,
    customer: b.customer ?? null,
    resource: b.resource ?? null,
    pets: (b.booking_pets ?? []).map((bp: any) => bp.pet).filter(Boolean),
    signed_off: Array.isArray(b.signoff) ? b.signoff.length > 0 : Boolean(b.signoff),
  };
}

/** Jobs for a given department + day. Hotel includes any stay overlapping the day. */
export function useWorkJobs(params: {
  tenantId: string | null | undefined;
  depts: WorkDept[];
  day: Date;
  /** When set (non-empty), only jobs on these resources — plus unassigned jobs — are returned. */
  resourceIds?: string[] | null;
}) {
  const { tenantId, depts, day, resourceIds } = params;
  const dayIso = isoDay(day);
  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const services = Array.from(new Set(depts.flatMap((d) => DEPT_SERVICES[d])));
  const scoped = (resourceIds ?? []).slice().sort();

  return useQuery({
    queryKey: ["work_jobs", tenantId, dayIso, services.join(","), scoped.join(",")],
    enabled: Boolean(tenantId) && services.length > 0,
    refetchInterval: 60_000,
    queryFn: async (): Promise<WorkJob[]> => {
      let q = sb
        .from("bookings")
        .select(JOB_SELECT)
        .eq("tenant_id", tenantId as string)
        .in("service_type", services)
        .not("status", "in", "(cancelled,no_show)")
        .lt("start_at", end.toISOString())
        .gte("end_at", start.toISOString());
      if (scoped.length) {
        q = q.or(`resource_id.in.(${scoped.join(",")}),resource_id.is.null`);
      }
      const { data, error } = await q
        .order("start_at", { ascending: true })
        .limit(300);
      if (error) throw error;
      return (data ?? []).map(mapJob);
    },
  });
}

export function useWorkJob(bookingId: string | undefined, tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["work_job", tenantId, bookingId],
    enabled: Boolean(bookingId && tenantId),
    queryFn: async () => {
      const { data, error } = await sb
        .from("bookings")
        .select(`${JOB_SELECT}, customer_id, notes_internal, notes_customer,
          service_address_text,
          address:customer_addresses!bookings_service_address_id_fkey(
            ${WORK_JOB_ADDRESS_COLUMNS}
          ),
          addons:grooming_booking_addons(id, addon_name, qty, price_zar_snapshot, note),
          gdetails:grooming_booking_details(
            actual_start_at, actual_end_at, service_package, groomer_name, duration_minutes,
            travel_fee, grooming_notes, stay_and_play_after, pensioner_discount_applied,
            matted_surcharge_zar, sedation_surcharge_zar, hotel_checkout_discount_pct
          )`)
        .eq("id", bookingId as string)
        .eq("tenant_id", tenantId as string)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const g = Array.isArray((data as any).gdetails) ? (data as any).gdetails[0] : (data as any).gdetails;
      const addr = Array.isArray((data as any).address) ? (data as any).address[0] : (data as any).address;
      return {
        ...mapJob(data),
        customer_id: (data as any).customer_id as string,
        notes_internal: (data as any).notes_internal as string | null,
        notes_customer: (data as any).notes_customer as string | null,
        actual_start_at: (g?.actual_start_at ?? null) as string | null,
        actual_end_at: (g?.actual_end_at ?? null) as string | null,
        service_address_text: ((data as any).service_address_text ?? null) as string | null,
        address: (addr ?? null) as WorkJobAddress | null,
        addons: ((data as any).addons ?? []) as WorkJobAddon[],
        details: (g ?? null) as WorkJobGroomingDetails | null,
      };
    },
  });
}

/** Move a booking to a new status, stamping grooming timers and logging the event. */
export function useSetJobStatus(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      bookingId,
      status,
      fromStatus,
      note,
    }: { bookingId: string; status: BookingStatus; fromStatus?: BookingStatus; note?: string }) => {
      const { error } = await sb
        .from("bookings")
        .update({ status })
        .eq("id", bookingId)
        .eq("tenant_id", tenantId);
      if (error) throw error;

      const now = new Date().toISOString();
      if (status === "grooming" || status === "in_progress") {
        await sb.from("grooming_booking_details").update({ actual_start_at: now })
          .eq("booking_id", bookingId).is("actual_start_at", null);
      } else if (status === "ready" || status === "completed") {
        await sb.from("grooming_booking_details").update({ actual_end_at: now })
          .eq("booking_id", bookingId).is("actual_end_at", null);
      }

      if (note) {
        await sb.from("booking_status_events").insert({
          tenant_id: tenantId, booking_id: bookingId,
          from_status: fromStatus ?? null, to_status: status,
          event_kind: "work_status", note,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["work_jobs"] });
      qc.invalidateQueries({ queryKey: ["work_job"] });
      qc.invalidateQueries({ queryKey: ["grooming_board"] });
      qc.invalidateQueries({ queryKey: ["bookings"] });
    },
  });
}

// ---------------- Checklist ----------------

export interface ChecklistItem {
  id: string;
  booking_id: string;
  label: string;
  sort_order: number;
  done: boolean;
  done_at: string | null;
  note: string | null;
}

export interface ChecklistTemplate {
  id: string;
  tenant_id: string;
  service_type: ServiceType;
  label: string;
  sort_order: number;
  requires_note: boolean;
  is_active: boolean;
}

export function useChecklistTemplates(tenantId: string | null | undefined, serviceType?: ServiceType) {
  return useQuery({
    queryKey: ["job_checklist_templates", tenantId, serviceType ?? "all"],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<ChecklistTemplate[]> => {
      let q = sb.from("job_checklist_templates").select("*")
        .eq("tenant_id", tenantId as string)
        .order("service_type", { ascending: true })
        .order("sort_order", { ascending: true });
      if (serviceType) q = q.eq("service_type", serviceType);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ChecklistTemplate[];
    },
  });
}

export function useUpsertChecklistTemplate(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Partial<ChecklistTemplate> & { service_type: ServiceType; label: string }) => {
      const payload = { ...row, tenant_id: tenantId };
      const { error } = row.id
        ? await sb.from("job_checklist_templates").update(payload).eq("id", row.id)
        : await sb.from("job_checklist_templates").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["job_checklist_templates"] }),
  });
}

export function useDeleteChecklistTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("job_checklist_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["job_checklist_templates"] }),
  });
}

/** Reads the booking's checklist, materialising it from the templates on first open. */
export function useJobChecklist(params: {
  tenantId: string | null | undefined;
  bookingId: string | undefined;
  serviceType: ServiceType | undefined;
}) {
  const { tenantId, bookingId, serviceType } = params;
  return useQuery({
    queryKey: ["job_checklist", bookingId],
    enabled: Boolean(tenantId && bookingId && serviceType),
    queryFn: async (): Promise<ChecklistItem[]> => {
      const existing = await sb
        .from("booking_checklist_items").select("*")
        .eq("booking_id", bookingId as string)
        .order("sort_order", { ascending: true });
      if (existing.error) throw existing.error;
      if ((existing.data ?? []).length) return existing.data as ChecklistItem[];

      const tpl = await sb
        .from("job_checklist_templates").select("*")
        .eq("tenant_id", tenantId as string)
        .eq("service_type", serviceType as string)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (tpl.error) throw tpl.error;
      if (!(tpl.data ?? []).length) return [];

      const rows = (tpl.data as ChecklistTemplate[]).map((t) => ({
        tenant_id: tenantId,
        booking_id: bookingId,
        template_id: t.id,
        label: t.label,
        sort_order: t.sort_order,
      }));
      const ins = await sb.from("booking_checklist_items").insert(rows).select("*");
      if (ins.error) throw ins.error;
      return (ins.data ?? []) as ChecklistItem[];
    },
  });
}

export function useToggleChecklistItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, done, note }: { id: string; done: boolean; note?: string | null }) => {
      const patch: Record<string, unknown> = { done, done_at: done ? new Date().toISOString() : null };
      if (note !== undefined) patch.note = note;
      const { error } = await sb.from("booking_checklist_items").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["job_checklist"] }),
  });
}

// ---------------- Notes / timeline ----------------

export interface JobEvent {
  id: string;
  booking_id: string;
  from_status: string | null;
  to_status: string | null;
  event_kind: string | null;
  note: string | null;
  created_at: string;
}

export function useJobEvents(bookingId: string | undefined) {
  return useQuery({
    queryKey: ["job_events", bookingId],
    enabled: Boolean(bookingId),
    queryFn: async (): Promise<JobEvent[]> => {
      const { data, error } = await sb
        .from("booking_status_events").select("*")
        .eq("booking_id", bookingId as string)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as JobEvent[];
    },
  });
}

export function useAddJobNote(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ bookingId, note, status }: { bookingId: string; note: string; status: BookingStatus }) => {
      const { error } = await sb.from("booking_status_events").insert({
        tenant_id: tenantId, booking_id: bookingId,
        to_status: status, event_kind: "job_note", note,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["job_events"] }),
  });
}

// ---------------- Photos ----------------

export type PhotoKind = "before" | "after" | "incident" | "general";

export interface JobPhoto {
  id: string;
  booking_id: string;
  document_id: string | null;
  kind: PhotoKind;
  caption: string | null;
  created_at: string;
}

export function useJobPhotos(bookingId: string | undefined) {
  return useQuery({
    queryKey: ["job_photos", bookingId],
    enabled: Boolean(bookingId),
    queryFn: async (): Promise<JobPhoto[]> => {
      const { data, error } = await sb
        .from("booking_photos").select("*")
        .eq("booking_id", bookingId as string)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as JobPhoto[];
    },
  });
}

export function useLinkJobPhoto(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { bookingId: string; petId?: string | null; documentId: string; kind: PhotoKind }) => {
      const { error } = await sb.from("booking_photos").insert({
        tenant_id: tenantId,
        booking_id: input.bookingId,
        pet_id: input.petId ?? null,
        document_id: input.documentId,
        kind: input.kind,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["job_photos"] }),
  });
}

// ---------------- Sign-off ----------------

export interface JobSignoff {
  id: string;
  booking_id: string;
  signed_name: string;
  signed_at: string;
  summary_note: string | null;
}

export function useJobSignoff(bookingId: string | undefined) {
  return useQuery({
    queryKey: ["job_signoff", bookingId],
    enabled: Boolean(bookingId),
    queryFn: async (): Promise<JobSignoff | null> => {
      const { data, error } = await sb
        .from("booking_signoffs").select("*")
        .eq("booking_id", bookingId as string)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as JobSignoff | null;
    },
  });
}

export function useSignOffJob(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      bookingId: string;
      profileId: string | null;
      signedName: string;
      summaryNote?: string | null;
      status: BookingStatus;
    }) => {
      const { error } = await sb.from("booking_signoffs").upsert(
        {
          tenant_id: tenantId,
          booking_id: input.bookingId,
          profile_id: input.profileId,
          signed_name: input.signedName,
          signed_at: new Date().toISOString(),
          summary_note: input.summaryNote ?? null,
        },
        { onConflict: "booking_id" },
      );
      if (error) throw error;

      const upd = await sb.from("bookings").update({ status: "completed" })
        .eq("id", input.bookingId).eq("tenant_id", tenantId);
      if (upd.error) throw upd.error;

      await sb.from("grooming_booking_details").update({ actual_end_at: new Date().toISOString() })
        .eq("booking_id", input.bookingId).is("actual_end_at", null);

      await sb.from("booking_status_events").insert({
        tenant_id: tenantId, booking_id: input.bookingId,
        from_status: input.status, to_status: "completed",
        event_kind: "job_signoff",
        note: `Signed off by ${input.signedName}${input.summaryNote ? ` — ${input.summaryNote}` : ""}`,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["job_signoff"] });
      qc.invalidateQueries({ queryKey: ["job_events"] });
      qc.invalidateQueries({ queryKey: ["work_job"] });
      qc.invalidateQueries({ queryKey: ["work_jobs"] });
      qc.invalidateQueries({ queryKey: ["bookings"] });
    },
  });
}

// ---------------- Care rounds ----------------

export type CareRoundKind = "fed_am" | "fed_pm" | "meds" | "walk" | "play" | "crate_clean" | "other";

export const CARE_ROUNDS: { key: CareRoundKind; label: string }[] = [
  { key: "fed_am", label: "Fed AM" },
  { key: "fed_pm", label: "Fed PM" },
  { key: "meds", label: "Meds" },
  { key: "walk", label: "Walk" },
  { key: "play", label: "Play" },
  { key: "crate_clean", label: "Clean" },
];

export interface CareRoundRow {
  id: string;
  booking_id: string;
  pet_id: string | null;
  round_date: string;
  round_kind: CareRoundKind;
  done_at: string;
  note: string | null;
}

export function useCareRounds(tenantId: string | null | undefined, day: Date) {
  const dayIso = isoDay(day);
  return useQuery({
    queryKey: ["care_rounds", tenantId, dayIso],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<CareRoundRow[]> => {
      const { data, error } = await sb
        .from("care_rounds").select("*")
        .eq("tenant_id", tenantId as string)
        .eq("round_date", dayIso);
      if (error) throw error;
      return (data ?? []) as CareRoundRow[];
    },
  });
}

export function useToggleCareRound(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      existingId?: string | null;
      bookingId: string;
      petId: string | null;
      dayIso: string;
      kind: CareRoundKind;
    }) => {
      if (input.existingId) {
        const { error } = await sb.from("care_rounds").delete().eq("id", input.existingId);
        if (error) throw error;
        return;
      }
      const { error } = await sb.from("care_rounds").insert({
        tenant_id: tenantId,
        booking_id: input.bookingId,
        pet_id: input.petId,
        round_date: input.dayIso,
        round_kind: input.kind,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["care_rounds"] }),
  });
}

// ---------------- Incidents ----------------

export type IncidentSeverity = "note" | "concern" | "urgent";
export type IncidentCategory = "vet" | "injury" | "escape" | "behaviour" | "illness" | "other";
export type IncidentState = "open" | "acknowledged" | "resolved";

export interface IncidentRow {
  id: string;
  tenant_id: string;
  booking_id: string | null;
  pet_id: string | null;
  customer_id: string | null;
  severity: IncidentSeverity;
  category: IncidentCategory;
  description: string;
  state: IncidentState;
  acknowledged_at: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  created_at: string;
  pet?: { id: string; name: string | null } | null;
  customer?: { id: string; full_name: string | null } | null;
  booking?: { id: string; booking_number: string } | null;
}

export const INCIDENT_CATEGORIES: { key: IncidentCategory; label: string }[] = [
  { key: "injury", label: "Injury" },
  { key: "illness", label: "Illness" },
  { key: "vet", label: "Vet needed" },
  { key: "behaviour", label: "Behaviour" },
  { key: "escape", label: "Escape" },
  { key: "other", label: "Other" },
];

export function useIncidents(params: {
  tenantId: string | null | undefined;
  states?: IncidentState[];
  bookingId?: string | null;
}) {
  const { tenantId, states, bookingId } = params;
  return useQuery({
    queryKey: ["incidents", tenantId, states?.join(",") ?? "all", bookingId ?? "any"],
    enabled: Boolean(tenantId),
    refetchInterval: 60_000,
    queryFn: async (): Promise<IncidentRow[]> => {
      let q = sb
        .from("incidents")
        .select(`*, pet:pets(id, name), customer:customers(id, full_name), booking:bookings(id, booking_number)`)
        .eq("tenant_id", tenantId as string)
        .order("created_at", { ascending: false })
        .limit(300);
      if (states?.length) q = q.in("state", states);
      if (bookingId) q = q.eq("booking_id", bookingId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as IncidentRow[];
    },
  });
}

export function useRaiseIncident(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      bookingId?: string | null;
      petId?: string | null;
      customerId?: string | null;
      severity: IncidentSeverity;
      category: IncidentCategory;
      description: string;
      raisedBy?: string | null;
    }) => {
      const { data, error } = await sb.from("incidents").insert({
        tenant_id: tenantId,
        booking_id: input.bookingId ?? null,
        pet_id: input.petId ?? null,
        customer_id: input.customerId ?? null,
        severity: input.severity,
        category: input.category,
        description: input.description,
        raised_by: input.raisedBy ?? null,
      }).select("id").maybeSingle();
      if (error) throw error;
      return data?.id as string | undefined;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["incidents"] });
      qc.invalidateQueries({ queryKey: ["nav-badges"] });
    },
  });
}

export function useUpdateIncident(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; state: IncidentState; profileId?: string | null; resolutionNote?: string | null }) => {
      const patch: Record<string, unknown> = { state: input.state };
      if (input.state === "acknowledged") {
        patch.acknowledged_at = new Date().toISOString();
        patch.acknowledged_by = input.profileId ?? null;
      }
      if (input.state === "resolved") {
        patch.resolved_at = new Date().toISOString();
        patch.resolution_note = input.resolutionNote ?? null;
      }
      const { error } = await sb.from("incidents").update(patch).eq("id", input.id).eq("tenant_id", tenantId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["incidents"] });
      qc.invalidateQueries({ queryKey: ["nav-badges"] });
    },
  });
}