import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAttendanceForRange, useDaycareEnrolments, useDaySwapsForRange } from "@/features/daycare/queries";
import { weekDays, weeklyDaycareRows, type WeeklyVisit } from "./weeklyDaycare";
import { Sheet, TABLE, TD, TH, Tick } from "./sheetUi";

export function WeeklyDaycareSheet({ tenantId, day }: { tenantId: string | null; day: Date }) {
  const days = weekDays(day); const from = days[0]; const to = days[5];
  const enrolments = useDaycareEnrolments(tenantId, { activeOnly: true });
  const swaps = useDaySwapsForRange(tenantId, from, to);
  const attendance = useAttendanceForRange(tenantId, from, to);
  const visits = useQuery({ queryKey: ["daycare_weekly_visits", tenantId, from, to], enabled: Boolean(tenantId), queryFn: async () => {
    if (!tenantId) return [];
    const [sp, trials] = await Promise.all([
      supabase.from("stay_play_sessions").select("pet_id,session_date,origin,pet:pets(name),customer:customers(full_name),booking:bookings(status)").eq("tenant_id", tenantId).gte("session_date", from).lte("session_date", to),
      supabase.from("bookings").select("start_at,booking_pets(pet_id,pet:pets(name)),customer:customers(full_name)").eq("tenant_id", tenantId).eq("service_type", "daycare_assessment").not("status", "in", "(cancelled,no_show)").gte("start_at", `${from}T00:00:00+02:00`).lte("start_at", `${to}T23:59:59+02:00`),
    ]);
    if (sp.error) throw sp.error; if (trials.error) throw trials.error;
    const out: WeeklyVisit[] = [];
    for (const s of sp.data ?? []) if (s.booking?.status !== "cancelled") out.push({ petId: s.pet_id, pet: s.pet?.name ?? "Pet", owner: s.customer?.full_name ?? "", date: s.session_date, label: s.origin === "hotel" ? "Hotel S&P" : "Grooming S&P" });
    for (const b of trials.data ?? []) for (const p of b.booking_pets) out.push({ petId: p.pet_id, pet: p.pet?.name ?? "Pet", owner: b.customer?.full_name ?? "", date: new Date(b.start_at ?? "").toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" }), label: "Trial" });
    return out;
  }});
  const recorded = (attendance.data ?? []).filter(a => a.status !== "cancelled").map(a => ({ petId: a.pet_id, pet: a.pet?.name ?? "Pet", owner: a.customer?.full_name ?? "", date: a.attendance_date, label: a.expected ? "Daycare" : "Unscheduled" }));
  const rows = weeklyDaycareRows(days, enrolments.data ?? [], swaps.data ?? [], [...visits.data ?? [], ...recorded]);
  const error = enrolments.error || swaps.error || attendance.error || visits.error;
  const loading = enrolments.isLoading || swaps.isLoading || attendance.isLoading || visits.isLoading;
  return <Sheet title="Daycare weekly register" subtitle={`${new Date(`${from}T12:00:00`).toLocaleDateString("en-ZA", { day: "2-digit", month: "short" })} – ${new Date(`${to}T12:00:00`).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" })}`} meta={<div>{rows.length} dogs · Staff: __________</div>}>
    {error ? <p role="alert" className="text-destructive">Unable to load the complete register.</p> : loading ? <p>Loading…</p> : <div className="overflow-x-auto print:overflow-visible"><table className={`${TABLE} min-w-[700px] print:min-w-0`}><thead><tr><th className={`${TH} w-48`}>Dog / owner</th>{days.map((date, i) => <th key={date} className={TH}>{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][i]} {date.slice(8)}</th>)}</tr></thead><tbody>{rows.map(r => <tr key={r.petId} className="break-inside-avoid"><td className={TD}><div className="font-bold">{r.pet}</div><div className="text-xs">{r.owner}</div></td>{days.map(date => <td key={date} className={`${TD} ${r.days[date] ? "bg-muted print:bg-muted" : ""}`}><div className="min-h-14">{r.days[date] && <><div className="mb-2 text-[10px] font-semibold">{r.days[date].join(" / ")}</div><Tick /> <span className="text-[10px]">In</span> <Tick /> <span className="text-[10px]">Out</span></>}</div></td>)}</tr>)}</tbody></table></div>}
  </Sheet>;
}