// Sample context + variable reference for message templates.
// Used by the template preview and the "Send test" edge function so
// admins can see what {{...}} tokens resolve to before saving.

export interface TemplateVariable {
  path: string;
  label: string;
  sample: string;
}

const CUSTOMER_VARS: TemplateVariable[] = [
  { path: "customer.full_name", label: "Customer full name", sample: "Sample Customer" },
  { path: "customer.first_name", label: "Customer first name", sample: "Sample" },
  { path: "customer.email", label: "Customer email", sample: "sample@example.com" },
  { path: "tenant.name", label: "Business name", sample: "Sloppy Kisses" },
];

const BOOKING_VARS: TemplateVariable[] = [
  { path: "booking.booking_number", label: "Booking number", sample: "BK-1042" },
  { path: "booking.service_type", label: "Service", sample: "grooming_inhouse" },
  { path: "booking.start_at", label: "Start", sample: "31 Jul 2026 09:00" },
  { path: "booking.end_at", label: "End", sample: "31 Jul 2026 10:30" },
  { path: "pet.name", label: "Pet name", sample: "Charlie" },
];

const INVOICE_VARS: TemplateVariable[] = [
  { path: "invoice.invoice_number", label: "Invoice number", sample: "INV-2026-0142" },
  { path: "invoice.total", label: "Invoice total (ZAR)", sample: "1250.00" },
  { path: "invoice.balance_due", label: "Balance due (ZAR)", sample: "1250.00" },
  { path: "invoice.due_date", label: "Due date", sample: "01 Aug 2026" },
  { path: "invoice.public_url", label: "Public view URL", sample: "https://sloppykisses.co.za/i/abc123" },
];

const QUOTE_VARS: TemplateVariable[] = [
  { path: "quote.number", label: "Quote number", sample: "QU-00001" },
  { path: "quote.dates", label: "Stay dates", sample: "20 Aug 2026 to 24 Aug 2026" },
  { path: "quote.nights", label: "Nights", sample: "4" },
  { path: "quote.accommodation", label: "Accommodation area", sample: "Barkside Inn - Cabanas" },
  { path: "quote.total", label: "Quote total", sample: "R 2 400.00" },
  { path: "quote.deposit", label: "50% deposit", sample: "R 1 200.00" },
  { path: "quote.valid_until", label: "Dates held until", sample: "26 Aug 2026" },
  { path: "pet.names", label: "Pet name(s)", sample: "Charlie and Maia" },
];

export const TEMPLATE_VARIABLE_MAP: Record<string, TemplateVariable[]> = {
  booking_created: [...CUSTOMER_VARS, ...BOOKING_VARS],
  booking_reminder_24h: [...CUSTOMER_VARS, ...BOOKING_VARS],
  booking_cancelled: [...CUSTOMER_VARS, ...BOOKING_VARS],
  booking_rescheduled: [...CUSTOMER_VARS, ...BOOKING_VARS],
  booking_status_changed: [...CUSTOMER_VARS, ...BOOKING_VARS],
  invoice_issued: [...CUSTOMER_VARS, ...INVOICE_VARS],
  invoice_reminder: [...CUSTOMER_VARS, ...INVOICE_VARS],
  invoice_paid: [...CUSTOMER_VARS, ...INVOICE_VARS],
  quote_sent: [...CUSTOMER_VARS, ...QUOTE_VARS],
  vax_expiring_30d: [...CUSTOMER_VARS, { path: "pet.name", label: "Pet name", sample: "Charlie" }, { path: "vaccine.name", label: "Vaccine", sample: "Rabies" }, { path: "vaccine.expires_on", label: "Expires", sample: "20 Aug 2026" }],
  vax_expiring_7d: [...CUSTOMER_VARS, { path: "pet.name", label: "Pet name", sample: "Charlie" }, { path: "vaccine.name", label: "Vaccine", sample: "Rabies" }, { path: "vaccine.expires_on", label: "Expires", sample: "20 Aug 2026" }],
  vax_expired: [...CUSTOMER_VARS, { path: "pet.name", label: "Pet name", sample: "Charlie" }, { path: "vaccine.name", label: "Vaccine", sample: "Rabies" }, { path: "vaccine.expires_on", label: "Expires", sample: "20 Jul 2026" }],
  manual_message: CUSTOMER_VARS,
};

export function getVariablesFor(eventCode: string | null | undefined): TemplateVariable[] {
  if (!eventCode) return CUSTOMER_VARS;
  return TEMPLATE_VARIABLE_MAP[eventCode] ?? CUSTOMER_VARS;
}

export function buildSampleContext(eventCode: string | null | undefined): Record<string, any> {
  const vars = getVariablesFor(eventCode);
  const ctx: Record<string, any> = {};
  for (const v of vars) {
    const parts = v.path.split(".");
    let cur = ctx;
    for (let i = 0; i < parts.length - 1; i++) {
      cur[parts[i]] = cur[parts[i]] ?? {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = v.sample;
  }
  return ctx;
}

export function renderTemplate(tpl: string, ctx: Record<string, any>): string {
  return tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path) => {
    const parts = String(path).split(".");
    let cur: any = ctx;
    for (const p of parts) { if (cur == null) return ""; cur = cur[p]; }
    return cur == null ? "" : String(cur);
  });
}