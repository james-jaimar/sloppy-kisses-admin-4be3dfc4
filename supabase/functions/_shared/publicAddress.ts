// Sanitises the structured address sent by the public booking pages.
const s = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const num = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null;

export function cleanPublicAddress(raw: unknown) {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  const place = s(a.google_place_id, 300);
  const lat = num(a.latitude, -90, 90);
  const lng = num(a.longitude, -180, 180);
  return {
    verified: Boolean(place && lat !== null && lng !== null),
    google_place_id: place || null,
    formatted_address: s(a.formatted_address, 300) || null,
    address_line_1: s(a.address_line_1, 200) || null,
    address_line_2: s(a.address_line_2, 200) || null,
    suburb: s(a.suburb, 80) || null,
    city: s(a.city, 80) || null,
    province: s(a.province, 80) || null,
    postcode: s(a.postcode, 12) || null,
    latitude: lat,
    longitude: lng,
    access_notes: s(a.access_notes, 500) || null,
  };
}
