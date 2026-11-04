export interface VolumeBooking {
  id: string; service_type: string; start_at: string | null; end_at: string | null;
  customer_id?: string | null; service_address_id?: string | null; resource_id?: string | null;
  booking_group_id?: string | null; pet_count: number;
}
export function saDay(iso: string) { return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" }); }
export function mobileStopKey(b: VolumeBooking) {
  return [b.start_at ? saDay(b.start_at) : "", b.resource_id ?? "unassigned", b.customer_id ?? b.id, b.service_address_id ?? b.booking_group_id ?? b.id].join("|");
}
export function hotelDayCounts(rows: VolumeBooking[], start: string, end: string) {
  const count = (f: (b: VolumeBooking) => boolean) => rows.filter(f).reduce((n, b) => n + b.pet_count, 0);
  return { dogsIn: count(() => true), checkingIn: count(b => Boolean(b.start_at && b.start_at >= start && b.start_at < end)), checkingOut: count(b => Boolean(b.end_at && b.end_at >= start && b.end_at < end)) };
}