export type HotelListScope = "month" | "today" | "tomorrow" | "week" | "weekend";
export type HotelMovement = "arrival" | "departure";
export type HotelMovementFilter = "all" | "inhouse" | HotelMovement;
export type HotelListSort = "in" | "out" | "client" | "pet";

export function hotelLocalDay(value: Date | string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

export function hotelListRange(scope: HotelListScope, month: Date, now = new Date()) {
  const day = hotelLocalDay(now);
  if (scope !== "month") {
    const start = new Date(`${day}T00:00:00+02:00`);
    let length = 1;
    if (scope === "tomorrow") start.setUTCDate(start.getUTCDate() + 1);
    if (scope === "week") length = 7;
    if (scope === "weekend") {
      const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
      // The current Saturday/Sunday weekend, or the next one on weekdays.
      start.setUTCDate(start.getUTCDate() + (weekday === 0 ? -1 : (6 - weekday + 7) % 7));
      length = 2;
    }
    return { start: start.toISOString(), end: new Date(start.getTime() + length * 86400000).toISOString() };
  }
  const y = month.getFullYear(), m = month.getMonth();
  return { start: new Date(Date.UTC(y, m, 1, -2)).toISOString(), end: new Date(Date.UTC(y, m + 1, 1, -2)).toISOString() };
}

type StayRow = { b: { start_at: string; end_at: string | null; status?: string; customer?: { full_name?: string | null } | null }; pets?: { name?: string | null }[] };
export function hotelRegisterRows<T extends StayRow>(rows: T[], range: { start: string; end: string }, filter: HotelMovementFilter, daySheet = false): (T & { movement?: HotelMovement })[] {
  const start = Date.parse(range.start), end = Date.parse(range.end);
  const within = (value: string | null) => value != null && Date.parse(value) >= start && Date.parse(value) < end;
  const overlapping = rows.filter(r => Date.parse(r.b.start_at) < end && (!r.b.end_at || Date.parse(r.b.end_at) >= start));
  if (filter === "inhouse") return overlapping.filter(r => ["checked_in", "in_progress", "grooming"].includes(r.b.status ?? ""));
  if (filter === "all" && !daySheet) return overlapping;
  return overlapping.flatMap(r => {
    const result: (T & { movement: HotelMovement })[] = [];
    if ((filter === "all" || filter === "arrival") && within(r.b.start_at)) result.push({ ...r, movement: "arrival" });
    if ((filter === "all" || filter === "departure") && within(r.b.end_at)) result.push({ ...r, movement: "departure" });
    return result;
  });
}

export function sortHotelRegister<T extends StayRow & { movement?: HotelMovement }>(rows: T[], key: HotelListSort, descending = false): T[] {
  const value = (r: T): string | number => {
    if (key === "client") return r.b.customer?.full_name ?? "";
    if (key === "pet") return (r.pets ?? []).map(p => p.name ?? "").join(", ");
    const timestamp = key === "out" ? r.b.end_at : r.b.start_at;
    return timestamp ? Date.parse(timestamp) : Number.POSITIVE_INFINITY;
  };
  return [...rows].sort((a, b) => {
    const av = value(a), bv = value(b);
    // Undated departures stay last in either direction.
    if (av === Number.POSITIVE_INFINITY || bv === Number.POSITIVE_INFINITY) return av === bv ? 0 : av === Number.POSITIVE_INFINITY ? 1 : -1;
    const comparison = typeof av === "string" && typeof bv === "string" ? av.localeCompare(bv, "en", { sensitivity: "base", numeric: true }) : Number(av) - Number(bv);
    return (descending ? -1 : 1) * comparison;
  });
}

export function hotelTodayRows<T extends { start_at: string; end_at: string | null; status: string }>(bookings: T[], today: Date) {
  const { start, end } = hotelListRange("today", today, today);
  const from = Date.parse(start), to = Date.parse(end);
  const within = (value: string | null) => value != null && Date.parse(value) >= from && Date.parse(value) < to;
  return {
    arrivals: bookings.filter(b => within(b.start_at) && ["confirmed", "approved", "requested", "pending_payment"].includes(b.status)),
    departures: bookings.filter(b => within(b.end_at) && !["checked_out", "cancelled", "completed", "no_show"].includes(b.status)),
    inHouse: bookings.filter(b => Date.parse(b.start_at) < to && (!b.end_at || Date.parse(b.end_at) > from) && ["checked_in", "in_progress", "grooming"].includes(b.status)),
  };
}

export function hotelMovements<T extends { b: { start_at: string; end_at: string | null } }>(rows: T[], now: Date) {
  const day = hotelLocalDay(now);
  return rows.flatMap((row) => {
    const movements: (T & { movement: HotelMovement })[] = [];
    if (hotelLocalDay(row.b.start_at) === day) movements.push({ ...row, movement: "arrival" });
    if (row.b.end_at && hotelLocalDay(row.b.end_at) === day) movements.push({ ...row, movement: "departure" });
    return movements;
  }).sort((a, b) => {
    const aTime = a.movement === "arrival" ? a.b.start_at : a.b.end_at;
    const bTime = b.movement === "arrival" ? b.b.start_at : b.b.end_at;
    return new Date(aTime ?? a.b.start_at).getTime() - new Date(bTime ?? b.b.start_at).getTime();
  });
}