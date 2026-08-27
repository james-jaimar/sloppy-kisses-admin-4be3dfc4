// Data for the printable daily lists. Deliberately self-contained: the sheets
// need a flat, print-friendly shape (alerts, notes, addresses inline) rather
// than the interactive board view models.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

export function isoDay(d: Date): string {
  const c = new Date(d);
  c.setMinutes(c.getMinutes() - c.getTimezoneOffset());
  return c.toISOString().slice(0, 10);
}

export function dayBounds(day: Date): { startIso: string; endIso: string } {
  const s = new Date(day); s.setHours(0, 0, 0, 0);
  const e = new Date(s); e.setDate(e.getDate() + 1);
  return { startIso: s.toISOString(), endIso: e.toISOString() };
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export interface PetAlerts {
  pet_id: string;
  name: string;
  breed: string | null;
  size: string | null;
  alerts: string[];
  medical: string | null;
}

function alertsFor(p: any): string[] {
  const out: string[] = [];
  if (p.aggression_flag || p.behaviour_aggressive_history) out.push("Bite risk");
  if (p.special_handling_flag) out.push("Special handling");
  if (p.is_power_breed) out.push("Power breed");
  if (p.behaviour_nervous || p.nervous) out.push("Nervous");
  if (p.behaviour_jumps || p.jumper) out.push("Jumper");
  if (p.behaviour_barker || p.barker) out.push("Barker");
  return out;
}

/** Alert/medical flags for a set of pets, keyed by pet id. */
export function usePetAlerts(tenantId: string | null | undefined, petIds: string[]) {
  const key = [...new Set(petIds)].sort().join(",");
  return useQuery({
    queryKey: ["lists_pet_alerts", tenantId, key],
    enabled: Boolean(tenantId) && key.length > 0,
    queryFn: async (): Promise<Record<string, PetAlerts>> => {
      const { data, error } = await supabase
        .from("pets")
        .select(
          "id, name, breed, size, size_override, aggression_flag, special_handling_flag, is_power_breed, medical_notes, behaviour_notes, behaviour_nervous, behaviour_jumps, behaviour_barker, behaviour_aggressive_history, nervous, jumper, barker",
        )
        .eq("tenant_id", tenantId as string)
        .in("id", key.split(","));
      if (error) throw error;
      const map: Record<string, PetAlerts> = {};
      for (const p of data ?? []) {
        map[(p as any).id] = {
          pet_id: (p as any).id,
          name: (p as any).name ?? "Pet",
          breed: (p as any).breed ?? null,
          size: (p as any).size_override ?? (p as any).size ?? null,
          alerts: alertsFor(p),
          medical: (p as any).medical_notes ?? null,
        };
      }
      return map;
    },
  });
}

// -------------------- Daycare --------------------

export interface DaycareNoteRow {
  pet_id: string;
  body: string;
  office_flag: boolean;
}

export function useDayNotes(tenantId: string | null | undefined, day: Date) {
  const dateIso = isoDay(day);
  return useQuery({
    queryKey: ["lists_day_notes", tenantId, dateIso],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<DaycareNoteRow[]> => {
      const { data, error } = await supabase
        .from("daycare_day_notes")
        .select("pet_id, body, office_flag")
        .eq("tenant_id", tenantId as string)
        .eq("note_date", dateIso);
      if (error) throw error;
      return (data ?? []) as DaycareNoteRow[];
    },
  });
}

// -------------------- Grooming (in-house) --------------------

export interface GroomJobRow {
  id: string;
  booking_number: string;
  start_at: string | null;
  end_at: string | null;
  groomer: string;
  customer_name: string;
  customer_mobile: string | null;
  pets: { id: string; name: string | null; breed: string | null }[];
  package_name: string | null;
  duration_minutes: number | null;
  notes: string | null;
}

export function useGroomingSheet(tenantId: string | null | undefined, day: Date) {
  const { startIso, endIso } = dayBounds(day);
  return useQuery({
    queryKey: ["lists_grooming", tenantId, startIso],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<GroomJobRow[]> => {
      const { data, error } = await supabase
        .from("bookings")
        .select(`
          id, booking_number, start_at, end_at, status,
          resource:resources(name),
          customer:customers(full_name, mobile),
          booking_pets(pet:pets(id, name, breed)),
          details:grooming_booking_details(duration_minutes, grooming_notes, groomer_name, package:grooming_packages(name))
        `)
        .eq("tenant_id", tenantId as string)
        .eq("service_type", "grooming_inhouse")
        .gte("start_at", startIso)
        .lt("start_at", endIso)
        .order("start_at", { ascending: true });
      if (error) throw error;
      return (data ?? [])
        .filter((b: any) => b.status !== "cancelled")
        .map((b: any) => {
          const d = Array.isArray(b.details) ? b.details[0] : b.details;
          return {
            id: b.id,
            booking_number: b.booking_number,
            start_at: b.start_at,
            end_at: b.end_at,
            groomer: b.resource?.name ?? d?.groomer_name ?? "Unassigned",
            customer_name: b.customer?.full_name ?? "—",
            customer_mobile: b.customer?.mobile ?? null,
            pets: (b.booking_pets ?? []).map((bp: any) => bp.pet).filter(Boolean),
            package_name: d?.package?.name ?? null,
            duration_minutes: d?.duration_minutes ?? null,
            notes: d?.grooming_notes ?? null,
          };
        });
    },
  });
}

// -------------------- Hotel & cattery --------------------

export interface HotelStayRow {
  id: string;
  booking_number: string;
  start_at: string;
  end_at: string | null;
  room: string;
  customer_name: string;
  customer_mobile: string | null;
  pets: { id: string; name: string | null; breed: string | null }[];
  feeding: string | null;
  medication: string | null;
  notes: string | null;
  arrivingToday: boolean;
  leavingToday: boolean;
}

export function useHotelSheet(tenantId: string | null | undefined, day: Date) {
  const { startIso, endIso } = dayBounds(day);
  return useQuery({
    queryKey: ["lists_hotel", tenantId, startIso],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<HotelStayRow[]> => {
      const { data, error } = await supabase
        .from("bookings")
        .select(`
          id, booking_number, start_at, end_at, status,
          resource:resources(name),
          customer:customers(full_name, mobile),
          booking_pets(pet:pets(id, name, breed)),
          details:hotel_booking_details(feeding_instructions, medication_instructions, additional_notes)
        `)
        .eq("tenant_id", tenantId as string)
        .in("service_type", ["hotel_dog", "hotel_cat"])
        .lt("start_at", endIso)
        .order("start_at", { ascending: true });
      if (error) throw error;
      return (data ?? [])
        .filter((b: any) => b.status !== "cancelled" && (!b.end_at || b.end_at > startIso))
        .map((b: any) => {
          const d = Array.isArray(b.details) ? b.details[0] : b.details;
          return {
            id: b.id,
            booking_number: b.booking_number,
            start_at: b.start_at,
            end_at: b.end_at,
            room: b.resource?.name ?? "Unassigned",
            customer_name: b.customer?.full_name ?? "—",
            customer_mobile: b.customer?.mobile ?? null,
            pets: (b.booking_pets ?? []).map((bp: any) => bp.pet).filter(Boolean),
            feeding: d?.feeding_instructions ?? null,
            medication: d?.medication_instructions ?? null,
            notes: d?.additional_notes ?? null,
            arrivingToday: b.start_at >= startIso && b.start_at < endIso,
            leavingToday: Boolean(b.end_at && b.end_at >= startIso && b.end_at < endIso),
          };
        });
    },
  });
}

// -------------------- Mobile vans --------------------

export interface VanStopRow {
  id: string;
  booking_number: string;
  start_at: string;
  van: string;
  customer_name: string;
  customer_mobile: string | null;
  pets: { id: string; name: string | null; breed: string | null }[];
  package_name: string | null;
  address: string;
  access_notes: string | null;
  notes: string | null;
}

export function useVanSheet(tenantId: string | null | undefined, day: Date) {
  const { startIso, endIso } = dayBounds(day);
  return useQuery({
    queryKey: ["lists_vans", tenantId, startIso],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<VanStopRow[]> => {
      const { data, error } = await supabase
        .from("bookings")
        .select(`
          id, booking_number, start_at, status,
          resource:resources(name),
          customer:customers(full_name, mobile, suburb),
          address:customer_addresses!bookings_service_address_id_fkey(formatted_address, address_line_1, address_line_2, suburb, access_notes, gate_code),
          booking_pets(pet:pets(id, name, breed)),
          details:grooming_booking_details(grooming_notes, package:grooming_packages(name))
        `)
        .eq("tenant_id", tenantId as string)
        .eq("service_type", "grooming_mobile")
        .gte("start_at", startIso)
        .lt("start_at", endIso)
        .order("start_at", { ascending: true });
      if (error) throw error;
      return (data ?? [])
        .filter((b: any) => b.status !== "cancelled")
        .map((b: any) => {
          const d = Array.isArray(b.details) ? b.details[0] : b.details;
          const a = Array.isArray(b.address) ? b.address[0] : b.address;
          const addr =
            a?.formatted_address ??
            [a?.address_line_1, a?.address_line_2, a?.suburb].filter(Boolean).join(", ") ??
            "";
          return {
            id: b.id,
            booking_number: b.booking_number,
            start_at: b.start_at,
            van: b.resource?.name ?? "Unassigned",
            customer_name: b.customer?.full_name ?? "—",
            customer_mobile: b.customer?.mobile ?? null,
            pets: (b.booking_pets ?? []).map((bp: any) => bp.pet).filter(Boolean),
            package_name: d?.package?.name ?? null,
            address: addr || (b.customer?.suburb ?? "No address on file"),
            access_notes: [a?.access_notes, a?.gate_code ? `Gate code ${a.gate_code}` : null]
              .filter(Boolean)
              .join(" · ") || null,
            notes: d?.grooming_notes ?? null,
          };
        });
    },
  });
}
