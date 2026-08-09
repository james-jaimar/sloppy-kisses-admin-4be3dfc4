export interface AddressLike {
  address_line_1?: string | null;
  address_line_2?: string | null;
  suburb?: string | null;
  city?: string | null;
  province?: string | null;
  postcode?: string | null;
  formatted_address?: string | null;
  access_notes?: string | null;
  gate_code?: string | null;
}

/** The street address Google knows about (never includes the unit line). */
export function streetLine(a: AddressLike): string {
  return (
    (a.formatted_address || "").trim() ||
    [a.address_line_1, a.suburb, a.city, a.province, a.postcode].filter(Boolean).join(", ")
  );
}

/** The customer's own unit / complex detail, e.g. "7 Bryanston Villa". */
export function unitLine(a: AddressLike): string {
  return (a.address_line_2 || "").trim();
}

/** Access notes plus gate code, as one muted helper line. */
export function accessLine(a: AddressLike): string {
  return [
    (a.access_notes || "").trim(),
    (a.gate_code || "").trim() ? `Gate code: ${(a.gate_code || "").trim()}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** unit / street / notes, in the order every surface should render them. */
export function addressLines(a: AddressLike): { unit: string; street: string; access: string } {
  return { unit: unitLine(a), street: streetLine(a), access: accessLine(a) };
}

/** Single-line form for compact places (lists, tooltips, exports). */
export function addressOneLine(a: AddressLike): string {
  const { unit, street } = addressLines(a);
  return [unit, street].filter(Boolean).join(", ") || "—";
}
