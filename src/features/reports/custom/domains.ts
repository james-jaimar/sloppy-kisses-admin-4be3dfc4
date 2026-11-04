// Report domains: each defines the fields Charlotte can pick and how to load flat rows.
import { supabase } from "@/integrations/supabase/client";
import type { FieldDef, Row } from "./engine";

export interface DomainDef {
  key: string;
  label: string;
  description: string;
  /** Field used for the date-range filter (null = no date filter). */
  dateField: string | null;
  dateLabel: string | null;
  fields: FieldDef[];
  defaultFields: string[];
  load: (tenantId: string, from: string, to: string) => Promise<Row[]>;
}

const MAX_ROWS = 20000;

async function fetchAll(build: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>) {
  const out: any[] = [];
  const page = 1000;
  for (let i = 0; i < MAX_ROWS; i += page) {
    const { data, error } = await build(i, i + page - 1);
    if (error) throw error;
    const d = (data ?? []) as any[];
    out.push(...d);
    if (d.length < page) break;
  }
  return out;
}

const one = (v: any) => (Array.isArray(v) ? v[0] : v) ?? null;
const SERVICE_LABEL: Record<string, string> = {
  daycare: "Daycare",
  daycare_assessment: "Daycare assessment",
  hotel_dog: "Hotel (dog)",
  hotel_cat: "Cattery",
  grooming_inhouse: "Grooming (in-house)",
  grooming_mobile: "Grooming (mobile)",
  pickup_dropoff: "Transport",
};
const nights = (a?: string | null, b?: string | null) => {
  if (!a || !b) return null;
  const n = Math.round((new Date(b.slice(0, 10)).getTime() - new Date(a.slice(0, 10)).getTime()) / 86400000);
  return n >= 0 ? n : null;
};
const ageYears = (dob?: string | null) =>
  dob ? Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 86400000)) : null;
const startTs = (d: string) => `${d}T00:00:00+02:00`;
const endTs = (d: string) => `${d}T23:59:59+02:00`;

const f = (group: string, key: string, label: string, type: FieldDef["type"] = "text"): FieldDef => ({ key, label, group, type });

const CUSTOMER_FIELDS = (p = "customer_"): FieldDef[] => [
  f("Customer", `${p}number`, "SK number"),
  f("Customer", `${p}name`, "Customer name"),
  f("Customer", `${p}email`, "Customer email"),
  f("Customer", `${p}mobile`, "Customer mobile"),
  f("Customer", `${p}suburb`, "Customer suburb"),
  f("Customer", `${p}city`, "Customer city"),
  f("Customer", `${p}types`, "Customer types"),
];
const CUSTOMER_SELECT = "customer_number, full_name, first_name, last_name, email, mobile, suburb, city, customer_types";
const customerCols = (c: any, p = "customer_"): Row => ({
  [`${p}number`]: c?.customer_number ?? null,
  [`${p}name`]: c?.full_name || [c?.first_name, c?.last_name].filter(Boolean).join(" ") || null,
  [`${p}email`]: c?.email ?? null,
  [`${p}mobile`]: c?.mobile ?? null,
  [`${p}suburb`]: c?.suburb ?? null,
  [`${p}city`]: c?.city ?? null,
  [`${p}types`]: Array.isArray(c?.customer_types) ? c.customer_types.join(", ") : null,
});

const PET_FIELDS: FieldDef[] = [
  f("Pet", "pet_number", "SP number"),
  f("Pet", "pet_name", "Pet name"),
  f("Pet", "pet_species", "Species"),
  f("Pet", "pet_breed", "Breed"),
  f("Pet", "pet_size", "Size"),
  f("Pet", "pet_sex", "Sex"),
  f("Pet", "pet_age", "Age (years)", "number"),
  f("Pet", "pet_sterilised", "Sterilised"),
  f("Pet", "pet_power_breed", "Power breed", "bool"),
  f("Pet", "pet_nervous", "Nervous", "bool"),
];
const PET_SELECT = "pet_number, name, species, breed, size, size_override, sex, date_of_birth, sterilised_status, is_power_breed, behaviour_nervous, nervous";
const petCols = (p: any): Row => ({
  pet_number: p?.pet_number ?? null,
  pet_name: p?.name ?? null,
  pet_species: p?.species ?? null,
  pet_breed: p?.breed ?? null,
  pet_size: p?.size_override ?? p?.size ?? null,
  pet_sex: p?.sex ?? null,
  pet_age: ageYears(p?.date_of_birth),
  pet_sterilised: p?.sterilised_status ?? null,
  pet_power_breed: p?.is_power_breed ?? null,
  pet_nervous: p?.behaviour_nervous ?? p?.nervous ?? null,
});

const bookingsDomain: DomainDef = {
  key: "bookings",
  label: "Bookings & services (one row per pet)",
  description: "Every booking across grooming, mobile, hotel, cattery, daycare and transport — with pet, customer, grooming package and hotel stay details.",
  dateField: "start_at",
  dateLabel: "Service date",
  fields: [
    f("Booking", "booking_number", "Booking #"),
    f("Booking", "service", "Service"),
    f("Booking", "status", "Status"),
    f("Booking", "source", "Source"),
    f("Booking", "start_at", "Start", "date"),
    f("Booking", "end_at", "End", "date"),
    f("Booking", "resource", "Station / van / room"),
    f("Booking", "service_suburb", "Service suburb"),
    f("Booking", "pets_on_booking", "Pets on booking", "number"),
    f("Booking", "cancellation_reason", "Cancellation reason"),
    f("Booking", "cancellation_fee", "Cancellation fee (R)", "number"),
    f("Booking", "requires_transport", "Needs transport", "bool"),
    f("Booking", "created_at", "Booked on", "date"),
    f("Grooming", "groom_package", "Package"),
    f("Grooming", "groom_mode", "Grooming mode"),
    f("Grooming", "groomer_name", "Groomer"),
    f("Grooming", "groom_minutes", "Duration (min)", "number"),
    f("Grooming", "groom_overtime", "Overtime (min)", "number"),
    f("Grooming", "travel_fee", "Travel fee (R)", "number"),
    f("Grooming", "matted_surcharge", "Matted surcharge (R)", "number"),
    f("Grooming", "pensioner", "Pensioner discount", "bool"),
    f("Grooming", "free_groom", "Daycare free groom", "bool"),
    f("Grooming", "stay_and_play", "Stay & Play after", "bool"),
    f("Hotel", "nights", "Nights", "number"),
    f("Hotel", "accommodation", "Accommodation"),
    f("Hotel", "separate_rooms", "Separate rooms", "bool"),
    f("Hotel", "hotel_grooming", "Checkout grooming", "bool"),
    f("Hotel", "pickup", "Pickup", "bool"),
    f("Hotel", "dropoff", "Drop-off", "bool"),
    f("Hotel", "hotel_discount", "Hotel discount %", "number"),
    ...PET_FIELDS,
    ...CUSTOMER_FIELDS(),
  ],
  defaultFields: ["booking_number", "service", "status", "start_at", "pet_name", "pet_breed", "customer_name"],
  load: async (tenantId, from, to) => {
    const data = await fetchAll((a, b) =>
      supabase!
        .from("bookings")
        .select(
          `id, booking_number, service_type, status, source, start_at, end_at, service_suburb, cancellation_reason, cancellation_fee_zar, requires_transport, created_at,
           resource:resources(name),
           customer:customers(${CUSTOMER_SELECT}),
           booking_pets(accommodation_type, pet:pets(${PET_SELECT})),
           grooming_booking_details(service_package, grooming_mode, groomer_name, duration_minutes, overtime_minutes, travel_fee, matted_surcharge_zar, pensioner_discount_applied, loyalty_free_groom, stay_and_play_after, package:grooming_packages(name)),
           hotel_booking_details(accommodation_type, separate_rooms, grooming_required, pickup_required, dropoff_required, discount_pct)`,
        )
        .eq("tenant_id", tenantId)
        .gte("start_at", startTs(from))
        .lte("start_at", endTs(to))
        .order("start_at")
        .range(a, b) as any,
    );
    const out: Row[] = [];
    for (const bk of data) {
      const g = one(bk.grooming_booking_details);
      const h = one(bk.hotel_booking_details);
      const pets = (bk.booking_pets ?? []) as any[];
      const base: Row = {
        booking_number: bk.booking_number,
        service: SERVICE_LABEL[bk.service_type] ?? bk.service_type,
        status: bk.status,
        source: bk.source,
        start_at: bk.start_at,
        end_at: bk.end_at,
        resource: one(bk.resource)?.name ?? null,
        service_suburb: bk.service_suburb,
        pets_on_booking: pets.length,
        cancellation_reason: bk.cancellation_reason,
        cancellation_fee: bk.cancellation_fee_zar,
        requires_transport: bk.requires_transport,
        created_at: bk.created_at,
        groom_package: g ? one(g.package)?.name ?? g.service_package : null,
        groom_mode: g?.grooming_mode ?? null,
        groomer_name: g?.groomer_name ?? null,
        groom_minutes: g?.duration_minutes ?? null,
        groom_overtime: g?.overtime_minutes ?? null,
        travel_fee: g?.travel_fee ?? null,
        matted_surcharge: g?.matted_surcharge_zar ?? null,
        pensioner: g?.pensioner_discount_applied ?? null,
        free_groom: g?.loyalty_free_groom ?? null,
        stay_and_play: g?.stay_and_play_after ?? null,
        nights: bk.service_type.startsWith("hotel") ? nights(bk.start_at, bk.end_at) : null,
        separate_rooms: h?.separate_rooms ?? null,
        hotel_grooming: h?.grooming_required ?? null,
        pickup: h?.pickup_required ?? null,
        dropoff: h?.dropoff_required ?? null,
        hotel_discount: h?.discount_pct ?? null,
        ...customerCols(one(bk.customer)),
      };
      if (!pets.length) out.push({ ...base, accommodation: h?.accommodation_type ?? null, ...petCols(null) });
      for (const bp of pets) out.push({ ...base, accommodation: bp.accommodation_type ?? h?.accommodation_type ?? null, ...petCols(one(bp.pet)) });
    }
    return out;
  },
};

const invoiceLinesDomain: DomainDef = {
  key: "invoice_lines",
  label: "Invoice lines (sales & revenue)",
  description: "Every line on every invoice — packages, add-ons, hotel nights, shop items — with VAT, discounts and the invoice it belongs to.",
  dateField: "issue_date",
  dateLabel: "Invoice date",
  fields: [
    f("Invoice", "invoice_number", "Invoice #"),
    f("Invoice", "invoice_status", "Invoice status"),
    f("Invoice", "invoice_kind", "Invoice type"),
    f("Invoice", "issue_date", "Issue date", "date"),
    f("Invoice", "due_date", "Due date", "date"),
    f("Invoice", "invoice_total", "Invoice total (R)", "number"),
    f("Invoice", "invoice_balance", "Invoice balance (R)", "number"),
    f("Line", "description", "Line description"),
    f("Line", "item_code", "Item code"),
    f("Line", "account_code", "Account code"),
    f("Line", "source_type", "Line source"),
    f("Line", "product_category", "Product category"),
    f("Line", "quantity", "Quantity", "number"),
    f("Line", "unit_price", "Unit price (R)", "number"),
    f("Line", "discount_amount", "Discount (R)", "number"),
    f("Line", "vat_amount", "VAT (R)", "number"),
    f("Line", "line_total", "Line total (R)", "number"),
    ...CUSTOMER_FIELDS(),
  ],
  defaultFields: ["invoice_number", "issue_date", "description", "quantity", "line_total", "customer_name"],
  load: async (tenantId, from, to) => {
    const data = await fetchAll((a, b) =>
      supabase!
        .from("invoice_items")
        .select(
          `description, item_code, xero_account_code, source_type, quantity, unit_price, discount_amount, vat_amount, line_total,
           product:products(category),
           invoice:invoices!inner(invoice_number, status, invoice_kind, issue_date, due_date, total, balance_due, customer:customers(${CUSTOMER_SELECT}))`,
        )
        .eq("tenant_id", tenantId)
        .gte("invoice.issue_date", from)
        .lte("invoice.issue_date", to)
        .range(a, b) as any,
    );
    return data.map((li: any) => {
      const inv = one(li.invoice);
      return {
        invoice_number: inv?.invoice_number,
        invoice_status: inv?.status,
        invoice_kind: inv?.invoice_kind,
        issue_date: inv?.issue_date,
        due_date: inv?.due_date,
        invoice_total: inv?.total,
        invoice_balance: inv?.balance_due,
        description: li.description,
        item_code: li.item_code,
        account_code: li.xero_account_code,
        source_type: li.source_type,
        product_category: one(li.product)?.category ?? null,
        quantity: li.quantity,
        unit_price: li.unit_price,
        discount_amount: li.discount_amount,
        vat_amount: li.vat_amount,
        line_total: li.line_total,
        ...customerCols(one(inv?.customer)),
      };
    });
  },
};

const invoicesDomain: DomainDef = {
  key: "invoices",
  label: "Invoices & balances",
  description: "One row per invoice — totals, paid, outstanding and due dates.",
  dateField: "issue_date",
  dateLabel: "Invoice date",
  fields: [
    f("Invoice", "invoice_number", "Invoice #"),
    f("Invoice", "status", "Status"),
    f("Invoice", "invoice_kind", "Invoice type"),
    f("Invoice", "issue_date", "Issue date", "date"),
    f("Invoice", "due_date", "Due date", "date"),
    f("Invoice", "subtotal", "Subtotal (R)", "number"),
    f("Invoice", "discount_total", "Discounts (R)", "number"),
    f("Invoice", "tax_total", "VAT (R)", "number"),
    f("Invoice", "total", "Total (R)", "number"),
    f("Invoice", "amount_paid", "Paid (R)", "number"),
    f("Invoice", "balance_due", "Balance (R)", "number"),
    f("Invoice", "send_count", "Times sent", "number"),
    ...CUSTOMER_FIELDS(),
  ],
  defaultFields: ["invoice_number", "status", "issue_date", "total", "balance_due", "customer_name"],
  load: async (tenantId, from, to) => {
    const data = await fetchAll((a, b) =>
      supabase!
        .from("invoices")
        .select(`invoice_number, status, invoice_kind, issue_date, due_date, subtotal, discount_total, tax_total, total, amount_paid, balance_due, send_count, customer:customers(${CUSTOMER_SELECT})`)
        .eq("tenant_id", tenantId)
        .gte("issue_date", from)
        .lte("issue_date", to)
        .order("issue_date")
        .range(a, b) as any,
    );
    return data.map((i: any) => {
      const { customer, ...rest } = i;
      return { ...rest, ...customerCols(one(customer)) };
    });
  },
};

const daycareDomain: DomainDef = {
  key: "daycare_attendance",
  label: "Daycare attendance",
  description: "Each recorded daycare day — expected vs walk-in, check-in and check-out times.",
  dateField: "attendance_date",
  dateLabel: "Attendance date",
  fields: [
    f("Attendance", "attendance_date", "Date", "date"),
    f("Attendance", "status", "Status"),
    f("Attendance", "expected", "Scheduled", "bool"),
    f("Attendance", "checked_in_at", "Checked in", "date"),
    f("Attendance", "checked_out_at", "Checked out", "date"),
    f("Attendance", "hours", "Hours on site", "number"),
    f("Attendance", "notes", "Notes"),
    ...PET_FIELDS,
    ...CUSTOMER_FIELDS(),
  ],
  defaultFields: ["attendance_date", "status", "expected", "pet_name", "customer_name"],
  load: async (tenantId, from, to) => {
    const data = await fetchAll((a, b) =>
      supabase!
        .from("daycare_attendance")
        .select(`attendance_date, status, expected, checked_in_at, checked_out_at, notes, pet:pets(${PET_SELECT}), customer:customers(${CUSTOMER_SELECT})`)
        .eq("tenant_id", tenantId)
        .gte("attendance_date", from)
        .lte("attendance_date", to)
        .order("attendance_date")
        .range(a, b) as any,
    );
    return data.map((d: any) => ({
      attendance_date: d.attendance_date,
      status: d.status,
      expected: d.expected,
      checked_in_at: d.checked_in_at,
      checked_out_at: d.checked_out_at,
      hours:
        d.checked_in_at && d.checked_out_at
          ? Math.round(((new Date(d.checked_out_at).getTime() - new Date(d.checked_in_at).getTime()) / 3600000) * 10) / 10
          : null,
      notes: d.notes,
      ...petCols(one(d.pet)),
      ...customerCols(one(d.customer)),
    }));
  },
};

const petsDomain: DomainDef = {
  key: "pets",
  label: "Pets",
  description: "Every pet on file with breed, size, temperament flags and owner.",
  dateField: null,
  dateLabel: null,
  fields: [...PET_FIELDS, f("Pet", "pet_status", "Pet status"), f("Pet", "pet_added", "Added on", "date"), ...CUSTOMER_FIELDS()],
  defaultFields: ["pet_number", "pet_name", "pet_species", "pet_breed", "pet_size", "customer_name"],
  load: async (tenantId) => {
    const data = await fetchAll((a, b) =>
      supabase!
        .from("pets")
        .select(`${PET_SELECT}, status, created_at, customer:customers(${CUSTOMER_SELECT})`)
        .eq("tenant_id", tenantId)
        .order("name")
        .range(a, b) as any,
    );
    return data.map((p: any) => ({ ...petCols(p), pet_status: p.status, pet_added: p.created_at, ...customerCols(one(p.customer)) }));
  },
};

const customersDomain: DomainDef = {
  key: "customers",
  label: "Customers",
  description: "Every customer with contact details, suburb, types and pet count.",
  dateField: null,
  dateLabel: null,
  fields: [
    ...CUSTOMER_FIELDS(),
    f("Customer", "status", "Status"),
    f("Customer", "pet_count", "Number of pets", "number"),
    f("Customer", "notify_email", "Email notifications", "bool"),
    f("Customer", "portal", "Portal enabled", "bool"),
    f("Customer", "collections_hold", "Collections hold", "bool"),
    f("Customer", "created_at", "Added on", "date"),
  ],
  defaultFields: ["customer_number", "customer_name", "customer_suburb", "customer_types", "pet_count"],
  load: async (tenantId) => {
    const data = await fetchAll((a, b) =>
      supabase!
        .from("customers")
        .select(`${CUSTOMER_SELECT}, status, notify_email, portal_access_enabled, collections_hold, created_at, pets(count)`)
        .eq("tenant_id", tenantId)
        .order("full_name")
        .range(a, b) as any,
    );
    return data.map((c: any) => ({
      ...customerCols(c),
      status: c.status,
      pet_count: one(c.pets)?.count ?? 0,
      notify_email: c.notify_email,
      portal: c.portal_access_enabled,
      collections_hold: c.collections_hold,
      created_at: c.created_at,
    }));
  },
};

const productsDomain: DomainDef = {
  key: "products",
  label: "Shop products",
  description: "Product catalogue with codes, prices, margin and reorder levels.",
  dateField: null,
  dateLabel: null,
  fields: [
    f("Product", "name", "Product"),
    f("Product", "external_code", "Xero code"),
    f("Product", "barcode", "Barcode"),
    f("Product", "category", "Category"),
    f("Product", "species", "Species"),
    f("Product", "cost_price", "Cost (R)", "number"),
    f("Product", "sell_price", "Price (R)", "number"),
    f("Product", "margin", "Margin (R)", "number"),
    f("Product", "reorder_level", "Reorder level", "number"),
    f("Product", "active", "Active", "bool"),
  ],
  defaultFields: ["name", "external_code", "category", "sell_price", "margin"],
  load: async (tenantId) => {
    const data = await fetchAll((a, b) =>
      supabase!
        .from("products")
        .select("name, external_code, barcode, category, species, cost_price, sell_price, reorder_level, active")
        .eq("tenant_id", tenantId)
        .order("name")
        .range(a, b) as any,
    );
    return data.map((p: any) => ({
      ...p,
      margin: p.sell_price != null && p.cost_price != null ? Math.round((p.sell_price - p.cost_price) * 100) / 100 : null,
    }));
  },
};

export const DOMAINS: DomainDef[] = [bookingsDomain, invoiceLinesDomain, invoicesDomain, daycareDomain, petsDomain, customersDomain, productsDomain];
