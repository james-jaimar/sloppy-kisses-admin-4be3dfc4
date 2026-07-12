import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const yStart = new Date(start);
  yStart.setDate(yStart.getDate() - 1);
  return {
    startISO: start.toISOString(),
    endISO: end.toISOString(),
    ydayStartISO: yStart.toISOString(),
    ydayEndISO: start.toISOString(),
    dateStr: start.toISOString().slice(0, 10),
  };
}

async function countBookings(
  tenantId: string,
  from: string,
  to: string,
  serviceTypes: string[],
) {
  const { count, error } = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .in("service_type", serviceTypes as any)
    .gte("start_at", from)
    .lt("start_at", to)
    .not("status", "in", "(cancelled,no_show)");
  if (error) throw error;
  return count ?? 0;
}

async function countHotelOverlap(tenantId: string, dayStart: string, dayEnd: string) {
  const { count, error } = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .in("service_type", ["hotel_dog", "hotel_cat"] as any)
    .lt("start_at", dayEnd)
    .gt("end_at", dayStart)
    .not("status", "in", "(cancelled,no_show)");
  if (error) throw error;
  return count ?? 0;
}

export interface DashboardTodayStats {
  grooming: { today: number; yday: number };
  mobile: { today: number; yday: number };
  daycare: { today: number; yday: number };
  hotel: { today: number; yday: number };
  transport: { today: number; yday: number };
}

export function useDashboardTodayStats(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["dashboard", "today-stats", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<DashboardTodayStats> => {
      const t = tenantId as string;
      const { startISO, endISO, ydayStartISO, ydayEndISO } = todayRange();

      const [gT, gY, mT, mY, dT, dY, hT, hY, pT, pY] = await Promise.all([
        countBookings(t, startISO, endISO, ["grooming_inhouse"]),
        countBookings(t, ydayStartISO, ydayEndISO, ["grooming_inhouse"]),
        countBookings(t, startISO, endISO, ["grooming_mobile"]),
        countBookings(t, ydayStartISO, ydayEndISO, ["grooming_mobile"]),
        countBookings(t, startISO, endISO, ["daycare", "daycare_assessment"]),
        countBookings(t, ydayStartISO, ydayEndISO, ["daycare", "daycare_assessment"]),
        countHotelOverlap(t, startISO, endISO),
        countHotelOverlap(t, ydayStartISO, ydayEndISO),
        countBookings(t, startISO, endISO, ["pickup_dropoff"]),
        countBookings(t, ydayStartISO, ydayEndISO, ["pickup_dropoff"]),
      ]);

      return {
        grooming: { today: gT, yday: gY },
        mobile: { today: mT, yday: mY },
        daycare: { today: dT, yday: dY },
        hotel: { today: hT, yday: hY },
        transport: { today: pT, yday: pY },
      };
    },
  });
}

export interface ScheduleRow {
  id: string;
  start_at: string | null;
  service_type: string;
  status: string;
  customer: { full_name: string | null } | null;
  resource: { name: string | null } | null;
  booking_pets: { pet: { name: string | null } | null }[];
}

export function useTodaysSchedule(tenantId: string | null | undefined, limit = 8) {
  return useQuery({
    queryKey: ["dashboard", "today-schedule", tenantId, limit],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<ScheduleRow[]> => {
      const { startISO, endISO } = todayRange();
      const { data, error } = await supabase
        .from("bookings")
        .select(
          "id, start_at, service_type, status, customer:customers(full_name), resource:resources(name), booking_pets(pet:pets(name))",
        )
        .eq("tenant_id", tenantId as string)
        .gte("start_at", startISO)
        .lt("start_at", endISO)
        .not("status", "in", "(cancelled,no_show)")
        .order("start_at", { ascending: true })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as ScheduleRow[];
    },
  });
}

export interface DaycareCheckinSummary {
  expected: number;
  checkedIn: number;
  notArrived: number;
  walkIns: number;
}

export function useDaycareCheckinSummary(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["dashboard", "daycare-checkin", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<DaycareCheckinSummary> => {
      const { dateStr } = todayRange();
      const { data, error } = await supabase
        .from("daycare_attendance")
        .select("id, expected, status, checked_in_at")
        .eq("tenant_id", tenantId as string)
        .eq("attendance_date", dateStr);
      if (error) throw error;
      const rows = (data ?? []) as { expected: boolean; status: string; checked_in_at: string | null }[];
      const expected = rows.filter((r) => r.expected).length;
      const checkedIn = rows.filter((r) => r.checked_in_at !== null).length;
      const walkIns = rows.filter((r) => !r.expected).length;
      const notArrived = Math.max(0, expected - checkedIn);
      return { expected, checkedIn, notArrived, walkIns };
    },
  });
}

export interface ActivityRow {
  id: string;
  activity_type: string;
  title: string | null;
  description: string | null;
  created_at: string;
  actor: { full_name: string | null; email: string | null } | null;
}

export function useRecentActivity(tenantId: string | null | undefined, limit = 8) {
  return useQuery({
    queryKey: ["dashboard", "activity", tenantId, limit],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<ActivityRow[]> => {
      const { data, error } = await supabase
        .from("activity_log")
        .select("id, activity_type, title, description, created_at, actor:profiles!activity_log_actor_profile_id_fkey(full_name, email)")
        .eq("tenant_id", tenantId as string)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as ActivityRow[];
    },
  });
}