export type HotelListScope = "month" | "today";
export type HotelMovement = "arrival" | "departure";
export type HotelMovementFilter = "all" | HotelMovement;

export function hotelLocalDay(value: Date | string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

export function hotelListRange(scope: HotelListScope, month: Date, now = new Date()) {
  const day = hotelLocalDay(now);
  if (scope === "today") {
    const start = new Date(`${day}T00:00:00+02:00`);
    return { start: start.toISOString(), end: new Date(start.getTime() + 86400000).toISOString() };
  }
  const y = month.getFullYear(), m = month.getMonth();
  return { start: new Date(Date.UTC(y, m, 1, -2)).toISOString(), end: new Date(Date.UTC(y, m + 1, 1, -2)).toISOString() };
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