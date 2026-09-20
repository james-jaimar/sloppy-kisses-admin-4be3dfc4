export const CUSTOMER_TYPES = [
  "daycare",
  "hotel",
  "cattery",
  "grooming",
  "mobile_grooming",
  "transport",
  "shop",
] as const;

export type CustomerTypeCode = (typeof CUSTOMER_TYPES)[number];

export const CUSTOMER_TYPE_META: Record<string, { label: string; className: string }> = {
  daycare: { label: "Daycare", className: "bg-sk-turquoise-soft text-sk-turquoise-dark" },
  hotel: { label: "Hotel", className: "bg-sk-coral-soft text-sk-coral-dark" },
  cattery: { label: "Cattery", className: "bg-sk-orange-soft text-sk-orange" },
  grooming: { label: "Grooming", className: "bg-sk-green-soft text-sk-green" },
  mobile_grooming: { label: "Mobile grooming", className: "bg-sk-green-soft text-sk-green" },
  transport: { label: "Transport", className: "bg-muted text-muted-foreground" },
  shop: { label: "Shop", className: "bg-sk-surface-muted text-foreground" },
};

export function customerTypeLabel(code: string) {
  return CUSTOMER_TYPE_META[code]?.label ?? code.replace(/_/g, " ");
}
