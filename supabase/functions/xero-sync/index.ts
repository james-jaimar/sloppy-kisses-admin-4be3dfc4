// One entry point for all Xero pushes: connection test, contacts, invoices,
// payments, credit notes, plus the queue worker used by auto-push.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { pace, xero, xeroConnections, xeroDate } from "../_shared/xero.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const j = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

type Settings = {
  tenant_id: string;
  enabled: boolean;
  auto_push: boolean;
  xero_tenant_id: string | null;
  default_sales_account: string;
  service_account_codes: Record<string, string>;
  default_tax_type: string;
  zero_rated_tax_type: string;
  line_amount_type: string;
  payment_accounts: Record<string, string>;
};

async function logSync(row: Record<string, unknown>) {
  await admin.from("xero_sync_log").insert(row);
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isGuid = (v: unknown) => typeof v === "string" && GUID.test(v.trim());
const esc = (v: string) => v.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

/** Look for an existing Xero contact before creating a new one. */
async function findContact(ctx: { tenantId: string }, c: any): Promise<string | null> {
  const tries: string[] = [];
  if (c.customer_number) tries.push(`AccountNumber=="${esc(String(c.customer_number))}"`);
  if (c.email) tries.push(`EmailAddress=="${esc(String(c.email))}"`);
  const name = c.full_name || [c.first_name, c.last_name].filter(Boolean).join(" ");
  if (name) tries.push(`Name=="${esc(name)}"`);

  for (const where of tries) {
    const found = await xero(ctx, `Contacts?where=${encodeURIComponent(where)}`);
    const id = found?.Contacts?.[0]?.ContactID;
    if (id) return id as string;
  }
  return null;
}

async function getSettings(tenantId: string): Promise<Settings> {
  const { data, error } = await admin.from("xero_settings").select("*").eq("tenant_id", tenantId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Xero is not configured for this tenant yet.");
  if (!data.xero_tenant_id) throw new Error("Pick a Xero organisation in Settings → Xero first.");
  return data as unknown as Settings;
}

// ---------- Contacts ----------
async function pushCustomer(s: Settings, customerId: string, actor: string | null) {
  const ctx = { tenantId: s.xero_tenant_id! };
  const { data: c, error } = await admin
    .from("customers")
    .select("id, tenant_id, full_name, first_name, last_name, email, mobile, phone_alt, address_line_1, address_line_2, suburb, city, province, postcode, customer_number, xero_customer_id")
    .eq("id", customerId).single();
  if (error || !c) throw new Error(error?.message ?? "Customer not found");

  // Legacy imports stored names in this column — only trust a real Xero GUID.
  let contactId = isGuid(c.xero_customer_id) ? String(c.xero_customer_id).trim() : null;
  if (!contactId) contactId = await findContact(ctx, c);

  const contact: Record<string, unknown> = {
    Name: c.full_name || [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || "Customer",
    FirstName: c.first_name ?? undefined,
    LastName: c.last_name ?? undefined,
    EmailAddress: c.email ?? undefined,
    AccountNumber: c.customer_number ?? undefined,
    Phones: [
      c.mobile ? { PhoneType: "MOBILE", PhoneNumber: c.mobile } : null,
      c.phone_alt ? { PhoneType: "DEFAULT", PhoneNumber: c.phone_alt } : null,
    ].filter(Boolean),
    Addresses: [{
      AddressType: "STREET",
      AddressLine1: c.address_line_1 ?? undefined,
      AddressLine2: c.address_line_2 ?? undefined,
      City: c.city ?? c.suburb ?? undefined,
      Region: c.province ?? undefined,
      PostalCode: c.postcode ?? undefined,
      Country: "South Africa",
    }],
  };
  if (contactId) contact.ContactID = contactId;

  const res = await xero(ctx, "Contacts", { method: "POST", body: { Contacts: [contact] } });
  const saved = res?.Contacts?.[0];
  if (!saved?.ContactID) throw new Error(`Xero did not return a contact: ${JSON.stringify(res).slice(0, 400)}`);

  await admin.from("customers").update({ xero_customer_id: saved.ContactID }).eq("id", c.id);
  await logSync({
    tenant_id: s.tenant_id, entity_type: "customer", entity_id: c.id, entity_label: contact.Name,
    action: contactId ? "update" : "create", status: "success", xero_id: saved.ContactID, triggered_by: actor,
  });
  return saved.ContactID as string;
}

// ---------- Invoices ----------
const PUSHABLE_INVOICE_STATUSES = ["issued", "sent", "part_paid", "paid", "overdue"];

// Xero rejects a line whose ItemCode does not exist, so cache what the org has.
const itemCodeCache = new Map<string, Set<string>>();
async function knownItemCodes(ctx: { tenantId: string }): Promise<Set<string>> {
  const hit = itemCodeCache.get(ctx.tenantId);
  if (hit) return hit;
  const set = new Set<string>();
  try {
    const res = await xero(ctx, "Items");
    for (const it of res?.Items ?? []) if (it?.Code) set.add(String(it.Code));
  } catch { /* item lookup is best-effort; lines just go without a code */ }
  itemCodeCache.set(ctx.tenantId, set);
  return set;
}

/** Create/update Xero Items from the tenant's billing item codes. */
async function pushItemCodes(s: Settings, actor: string | null) {
  const ctx = { tenantId: s.xero_tenant_id! };
  const { data: rows } = await admin
    .from("billing_item_codes").select("id, code, label, ref_key")
    .eq("tenant_id", s.tenant_id).eq("active", true);
  const wanted = (rows ?? []).filter((r) => r.code);
  if (!wanted.length) return { pushed: 0 };

  const existing = await knownItemCodes(ctx);
  const items = wanted.map((r) => ({
    Code: r.code,
    Name: (r.label ?? r.code).slice(0, 50),
    SalesDetails: { AccountCode: s.default_sales_account, TaxType: s.default_tax_type },
    IsSold: true,
  }));
  await xero(ctx, "Items", { method: "POST", body: { Items: items } });
  for (const r of wanted) existing.add(String(r.code));
  await logSync({
    tenant_id: s.tenant_id, entity_type: "item", action: "push", status: "success",
    entity_label: `${items.length} item codes`, triggered_by: actor,
  });
  return { pushed: items.length };
}

async function pushInvoice(s: Settings, invoiceId: string, actor: string | null) {
  const ctx = { tenantId: s.xero_tenant_id! };
  const { data: inv, error } = await admin
    .from("invoices")
    .select("id, tenant_id, invoice_number, status, issue_date, due_date, notes, customer_id, xero_invoice_id, invoice_items(id, description, quantity, unit_price, line_total, xero_account_code, item_code, vat_rate, sort_order, booking_id)")
    .eq("id", invoiceId).single();
  if (error || !inv) throw new Error(error?.message ?? "Invoice not found");
  if (!PUSHABLE_INVOICE_STATUSES.includes(String(inv.status))) {
    await logSync({ tenant_id: s.tenant_id, entity_type: "invoice", entity_id: inv.id, entity_label: inv.invoice_number,
      action: "skip", status: "skipped", error_message: `Status ${inv.status} is not pushed to Xero`, triggered_by: actor });
    return { skipped: true };
  }

  const contactId = await ensureContact(s, inv.customer_id as string, actor);

  // Service-level account codes come from the booking behind each line, when there is one.
  const bookingIds = (inv.invoice_items ?? []).map((l: any) => l.booking_id).filter(Boolean);
  const serviceByBooking: Record<string, string> = {};
  if (bookingIds.length) {
    const { data: bks } = await admin.from("bookings").select("id, service_type").in("id", bookingIds);
    for (const b of bks ?? []) serviceByBooking[b.id] = b.service_type;
  }

  // SKUs: per-service item codes configured in Settings → Billing item codes.
  const { data: codeRows } = await admin
    .from("billing_item_codes").select("kind, ref_key, code")
    .eq("tenant_id", s.tenant_id).eq("active", true);
  const serviceItemCode: Record<string, string> = {};
  for (const r of codeRows ?? []) if (r.kind === "service" && r.code) serviceItemCode[r.ref_key] = r.code;

  const validCodes = await knownItemCodes(ctx);

  const lines = (inv.invoice_items ?? [])
    .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((l: any) => {
      const wanted = l.item_code
        || (l.booking_id ? serviceItemCode[serviceByBooking[l.booking_id]] : null)
        || undefined;
      const itemCode = wanted && validCodes.has(String(wanted)) ? String(wanted) : undefined;
      return {
        Description: l.description || "Service",
        Quantity: Number(l.quantity ?? 1),
        UnitAmount: Number(l.unit_price ?? 0),
        ItemCode: itemCode,
        AccountCode: l.xero_account_code
          || (l.booking_id ? s.service_account_codes?.[serviceByBooking[l.booking_id]] : null)
          || s.default_sales_account,
        TaxType: Number(l.vat_rate ?? 0) > 0 ? s.default_tax_type : s.zero_rated_tax_type,
      };
    });
  if (!lines.length) throw new Error("Invoice has no line items");

  const payload: Record<string, unknown> = {
    Type: "ACCREC",
    Contact: { ContactID: contactId },
    Date: xeroDate(inv.issue_date),
    DueDate: xeroDate(inv.due_date),
    InvoiceNumber: inv.invoice_number,
    Reference: inv.invoice_number,
    LineAmountTypes: s.line_amount_type,
    Status: "AUTHORISED",
    LineItems: lines,
  };
  if (inv.xero_invoice_id) payload.InvoiceID = inv.xero_invoice_id;

  const res = await xero(ctx, "Invoices", { method: "POST", body: { Invoices: [payload] } });
  const saved = res?.Invoices?.[0];
  if (!saved?.InvoiceID) throw new Error(`Xero did not return an invoice: ${JSON.stringify(res).slice(0, 400)}`);

  await admin.from("invoices")
    .update({ xero_invoice_id: saved.InvoiceID, xero_invoice_number: saved.InvoiceNumber ?? inv.invoice_number })
    .eq("id", inv.id);
  await logSync({
    tenant_id: s.tenant_id, entity_type: "invoice", entity_id: inv.id, entity_label: inv.invoice_number,
    action: inv.xero_invoice_id ? "update" : "create", status: "success", xero_id: saved.InvoiceID, triggered_by: actor,
  });
  return { xero_id: saved.InvoiceID };
}

async function ensureContact(s: Settings, customerId: string, actor: string | null) {
  const cached = contactCache.get(customerId);
  if (cached) return cached;
  const { data } = await admin.from("customers").select("xero_customer_id").eq("id", customerId).maybeSingle();
  // Legacy imports left non-GUID text here; only a real Xero id is usable.
  if (isGuid(data?.xero_customer_id)) {
    const id = String(data!.xero_customer_id).trim();
    contactCache.set(customerId, id);
    return id;
  }
  const id = await pushCustomer(s, customerId, actor);
  contactCache.set(customerId, id);
  return id;
}

/** Per-invocation contact cache — avoids re-searching Xero for the same customer. */
const contactCache = new Map<string, string>();

// ---------- Payments ----------
async function pushPayment(s: Settings, paymentId: string, actor: string | null) {
  const ctx = { tenantId: s.xero_tenant_id! };
  const { data: p, error } = await admin
    .from("payments")
    .select("id, tenant_id, invoice_id, amount, paid_at, payment_method, payment_reference, xero_payment_id, status")
    .eq("id", paymentId).single();
  if (error || !p) throw new Error(error?.message ?? "Payment not found");
  if (p.xero_payment_id) return { skipped: true, reason: "already in Xero" };
  if (!p.invoice_id) {
    await logSync({ tenant_id: s.tenant_id, entity_type: "payment", entity_id: p.id, action: "skip", status: "skipped",
      error_message: "Payment is not linked to an invoice", triggered_by: actor });
    return { skipped: true };
  }

  const { data: inv } = await admin.from("invoices").select("id, xero_invoice_id, invoice_number").eq("id", p.invoice_id).maybeSingle();
  let xeroInvoiceId = inv?.xero_invoice_id as string | null;
  if (!xeroInvoiceId) {
    await pushInvoice(s, p.invoice_id as string, actor);
    const { data: again } = await admin.from("invoices").select("xero_invoice_id").eq("id", p.invoice_id).maybeSingle();
    xeroInvoiceId = again?.xero_invoice_id ?? null;
  }
  if (!xeroInvoiceId) throw new Error("Invoice could not be created in Xero, so the payment was not posted");

  const accountCode = s.payment_accounts?.[String(p.payment_method)] ?? s.payment_accounts?.default;
  if (!accountCode) throw new Error(`No Xero bank account mapped for payment method "${p.payment_method}" — set it in Settings → Xero`);

  const res = await xero(ctx, "Payments", {
    method: "PUT",
    body: {
      Payments: [{
        Invoice: { InvoiceID: xeroInvoiceId },
        Account: { Code: accountCode },
        Date: xeroDate(p.paid_at ?? new Date().toISOString()),
        Amount: Number(p.amount ?? 0),
        Reference: p.payment_reference ?? undefined,
      }],
    },
  });
  const saved = res?.Payments?.[0];
  if (!saved?.PaymentID) throw new Error(`Xero did not return a payment: ${JSON.stringify(res).slice(0, 400)}`);

  await admin.from("payments").update({ xero_payment_id: saved.PaymentID }).eq("id", p.id);
  await logSync({ tenant_id: s.tenant_id, entity_type: "payment", entity_id: p.id, entity_label: inv?.invoice_number,
    action: "create", status: "success", xero_id: saved.PaymentID, triggered_by: actor });
  return { xero_id: saved.PaymentID };
}

// ---------- Credit notes ----------
async function pushCreditNote(s: Settings, creditNoteId: string, actor: string | null) {
  const ctx = { tenantId: s.xero_tenant_id! };
  const { data: cn, error } = await admin
    .from("credit_notes")
    .select("id, tenant_id, credit_note_number, status, issue_date, customer_id, invoice_id, total, xero_credit_note_id, credit_note_items(description, quantity, unit_price, line_total, sort_order)")
    .eq("id", creditNoteId).single();
  if (error || !cn) throw new Error(error?.message ?? "Credit note not found");
  if (!["issued", "applied"].includes(String(cn.status))) {
    await logSync({ tenant_id: s.tenant_id, entity_type: "credit_note", entity_id: cn.id, entity_label: cn.credit_note_number,
      action: "skip", status: "skipped", error_message: `Status ${cn.status} is not pushed`, triggered_by: actor });
    return { skipped: true };
  }

  const contactId = await ensureContact(s, cn.customer_id as string, actor);
  const lines = (cn.credit_note_items ?? [])
    .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((l: any) => ({
      Description: l.description || "Credit",
      Quantity: Number(l.quantity ?? 1),
      UnitAmount: Number(l.unit_price ?? 0),
      AccountCode: s.default_sales_account,
      TaxType: s.default_tax_type,
    }));
  if (!lines.length) {
    lines.push({ Description: `Credit note ${cn.credit_note_number}`, Quantity: 1, UnitAmount: Number(cn.total ?? 0), AccountCode: s.default_sales_account, TaxType: s.default_tax_type });
  }

  const payload: Record<string, unknown> = {
    Type: "ACCRECCREDIT",
    Contact: { ContactID: contactId },
    Date: xeroDate(cn.issue_date),
    CreditNoteNumber: cn.credit_note_number,
    LineAmountTypes: s.line_amount_type,
    Status: "AUTHORISED",
    LineItems: lines,
  };
  if (cn.xero_credit_note_id) payload.CreditNoteID = cn.xero_credit_note_id;

  const res = await xero(ctx, "CreditNotes", { method: "POST", body: { CreditNotes: [payload] } });
  const saved = res?.CreditNotes?.[0];
  if (!saved?.CreditNoteID) throw new Error(`Xero did not return a credit note: ${JSON.stringify(res).slice(0, 400)}`);

  await admin.from("credit_notes")
    .update({ xero_credit_note_id: saved.CreditNoteID, xero_credit_note_number: saved.CreditNoteNumber ?? cn.credit_note_number })
    .eq("id", cn.id);

  // Allocate to the originating invoice when we know it in Xero.
  if (cn.invoice_id) {
    const { data: inv } = await admin.from("invoices").select("xero_invoice_id").eq("id", cn.invoice_id).maybeSingle();
    if (inv?.xero_invoice_id) {
      try {
        await xero(ctx, `CreditNotes/${saved.CreditNoteID}/Allocations`, {
          method: "PUT",
          body: { Allocations: [{ Invoice: { InvoiceID: inv.xero_invoice_id }, Amount: Number(cn.total ?? 0), Date: xeroDate(cn.issue_date) }] },
        });
      } catch (e) {
        await logSync({ tenant_id: s.tenant_id, entity_type: "credit_note", entity_id: cn.id, entity_label: cn.credit_note_number,
          action: "allocate", status: "error", error_message: String((e as Error).message), triggered_by: actor });
      }
    }
  }

  await logSync({ tenant_id: s.tenant_id, entity_type: "credit_note", entity_id: cn.id, entity_label: cn.credit_note_number,
    action: cn.xero_credit_note_id ? "update" : "create", status: "success", xero_id: saved.CreditNoteID, triggered_by: actor });
  return { xero_id: saved.CreditNoteID };
}

async function pushOne(s: Settings, type: string, id: string, actor: string | null) {
  if (type === "customer") return await pushCustomer(s, id, actor);
  if (type === "invoice") return await pushInvoice(s, id, actor);
  if (type === "payment") return await pushPayment(s, id, actor);
  if (type === "credit_note") return await pushCreditNote(s, id, actor);
  throw new Error(`Unknown entity type ${type}`);
}

// ---------- Contact reconciliation ----------
const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();
const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "").slice(-9);
/** Quote a value for a PostgREST `in.(...)` list. */
const quoteIn = (v: string) => `"${String(v).replace(/["\\]/g, "")}"`;

/**
 * Pull a slice of Xero contacts into staging. Resumable: a few pages per call so
 * the worker never runs out of memory/CPU on large orgs. Returns next_page.
 */
async function pullContacts(s: Settings, actor: string | null, startPage = 1, maxPages = 1) {
  const ctx = { tenantId: s.xero_tenant_id! };
  let pulled = 0;
  let nextPage: number | null = null;
  for (let i = 0; i < maxPages; i++) {
    const page = startPage + i;
    const res = await xero(ctx, `Contacts?page=${page}&includeArchived=false`);
    const batch = res?.Contacts ?? [];
    if (!batch.length) { nextPage = null; break; }
    const rows = batch.map((c: any) => ({
        tenant_id: s.tenant_id,
        xero_contact_id: c.ContactID,
        name: c.Name ?? null,
        first_name: c.FirstName ?? null,
        last_name: c.LastName ?? null,
        email: c.EmailAddress ?? null,
        phone: (c.Phones ?? []).map((p: any) => p.PhoneNumber).filter(Boolean)[0] ?? null,
        account_number: c.AccountNumber ?? null,
        contact_status: c.ContactStatus ?? null,
        pulled_at: new Date().toISOString(),
    }));
    const { error } = await admin.from("xero_contacts_staging")
      .upsert(rows, { onConflict: "tenant_id,xero_contact_id" });
    if (error) throw new Error(error.message);
    pulled += rows.length;
    if (batch.length < 100) { nextPage = null; break; }
    nextPage = page + 1;
    await pace();
  }

  if (!nextPage) {
    await logSync({
      tenant_id: s.tenant_id, entity_type: "contact", action: "pull", status: "success",
      entity_label: `contact pull finished (last page ${startPage + maxPages - 1})`, triggered_by: actor,
    });
  }
  return { pulled, next_page: nextPage };
}

/** Score a batch of staged contacts against customers. Resumable via cursor. */
async function autoMatchContacts(s: Settings, cursor: string | null = null, limit = 100) {
  let q = admin.from("xero_contacts_staging")
    .select("id, xero_contact_id, name, email, phone, account_number, matched_customer_id, match_state")
    .eq("tenant_id", s.tenant_id).eq("match_state", "unmatched")
    .order("id", { ascending: true }).limit(limit);
  if (cursor) q = q.gt("id", cursor);
  const { data: staged } = await q;
  if (!staged?.length) return { matched: 0, next_cursor: null as string | null };

  // Only load the customers that could match this batch — loading all 4k rows
  // per call blew the worker's memory budget (and hit PostgREST's 1000-row cap).
  const numbers = staged.map((r) => r.account_number).filter(Boolean) as string[];
  const emails = staged.map((r) => r.email).filter(Boolean) as string[];
  const names = staged.map((r) => r.name).filter(Boolean) as string[];
  const filters: string[] = [];
  if (numbers.length) filters.push(`customer_number.in.(${numbers.map(quoteIn).join(",")})`);
  if (emails.length) filters.push(`email.in.(${emails.map(quoteIn).join(",")})`);
  if (names.length) filters.push(`full_name.in.(${names.map(quoteIn).join(",")})`);
  let cq = admin.from("customers")
    .select("id, customer_number, full_name, first_name, last_name, email, mobile, phone_alt")
    .eq("tenant_id", s.tenant_id).neq("status", "archived").limit(1000);
  if (filters.length) cq = cq.or(filters.join(","));
  const { data: customers } = await cq;

  const byNumber = new Map<string, string>();
  const byEmail = new Map<string, string>();
  const byPhone = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const c of customers ?? []) {
    if (c.customer_number) byNumber.set(norm(c.customer_number), c.id);
    if (c.email) byEmail.set(norm(c.email), c.id);
    for (const p of [c.mobile, c.phone_alt]) if (digits(p).length >= 8) byPhone.set(digits(p), c.id);
    const n = norm(c.full_name || [c.first_name, c.last_name].filter(Boolean).join(" "));
    if (n) byName.set(n, c.id);
  }

  let matched = 0;
  const updates: any[] = [];
  for (const row of staged) {
    let customerId: string | null = null;
    let type: string | null = null;
    if (row.account_number && byNumber.has(norm(row.account_number))) {
      customerId = byNumber.get(norm(row.account_number))!; type = "account_number";
    } else if (row.email && byEmail.has(norm(row.email))) {
      customerId = byEmail.get(norm(row.email))!; type = "email";
    } else if (digits(row.phone).length >= 8 && byPhone.has(digits(row.phone))) {
      customerId = byPhone.get(digits(row.phone))!; type = "phone";
    } else if (row.name && byName.has(norm(row.name))) {
      customerId = byName.get(norm(row.name))!; type = "name";
    }
    if (!customerId) continue;
    updates.push({
      id: row.id,
      tenant_id: s.tenant_id,
      xero_contact_id: row.xero_contact_id,
      matched_customer_id: customerId,
      match_type: type,
      // Account number and email are safe to trust; name/phone need a human eye.
      match_state: type === "account_number" || type === "email" ? "suggested" : "review",
    });
    matched++;
  }
  if (updates.length) {
    const { error } = await admin.from("xero_contacts_staging").upsert(updates, { onConflict: "id" });
    if (error) throw new Error(error.message);
  }
  return { matched, next_cursor: staged.length < limit ? null : staged[staged.length - 1].id };
}

/** Confirm links: write the Xero contact id onto the customer and push SK numbers back. */
async function linkContacts(s: Settings, stagingIds: string[], actor: string | null) {
  const ctx = { tenantId: s.xero_tenant_id! };
  // Hard cap per invocation — the browser chunks larger selections. Doing
  // hundreds of sequential round-trips here blew the 150s idle timeout.
  const ids = stagingIds.slice(0, 50);
  const remaining = stagingIds.length - ids.length;
  const { data: rows } = await admin.from("xero_contacts_staging")
    .select("id, xero_contact_id, matched_customer_id, name")
    .eq("tenant_id", s.tenant_id).in("id", ids);

  const usable = (rows ?? []).filter((r) => r.matched_customer_id);
  const customerIds = usable.map((r) => r.matched_customer_id as string);
  const { data: custs } = customerIds.length
    ? await admin.from("customers").select("id, customer_number").in("id", customerIds)
    : { data: [] as any[] };
  const numberById = new Map<string, string>((custs ?? []).map((c: any) => [c.id, c.customer_number]));

  // Parallel, bounded writes instead of one round-trip per row per step.
  await Promise.all(usable.map((r) =>
    admin.from("customers").update({ xero_customer_id: r.xero_contact_id }).eq("id", r.matched_customer_id!)
  ));
  if (usable.length) {
    await admin.from("xero_contacts_staging").update({ match_state: "linked" })
      .in("id", usable.map((r) => r.id));
  }
  const contactUpdates = usable
    .filter((r) => numberById.get(r.matched_customer_id as string))
    .map((r) => ({ ContactID: r.xero_contact_id, AccountNumber: numberById.get(r.matched_customer_id as string) }));
  const linked = usable.length;

  // Keep the SK customer number visible in Xero as the account number.
  for (let i = 0; i < contactUpdates.length; i += 50) {
    try {
      await xero(ctx, "Contacts", { method: "POST", body: { Contacts: contactUpdates.slice(i, i + 50) } });
      await pace();
    } catch (e) {
      await logSync({ tenant_id: s.tenant_id, entity_type: "contact", action: "account_number", status: "error",
        error_message: String((e as Error).message), triggered_by: actor });
    }
  }

  await logSync({ tenant_id: s.tenant_id, entity_type: "contact", action: "link", status: "success",
    entity_label: `${linked} contacts linked`, triggered_by: actor });
  return { linked, remaining };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return j(405, { error: "Method not allowed" });

  let body: any;
  try { body = await req.json(); } catch { return j(400, { error: "Invalid JSON" }); }
  const action: string = body?.action ?? "";
  const tenantId: string | undefined = body?.tenant_id;
  if (!tenantId) return j(400, { error: "tenant_id required" });

  // Auth: service-role (cron/worker) calls skip the permission check.
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  let actor: string | null = null;
  const cronSecret = Deno.env.get("XERO_CRON_SECRET");
  const isCronCall = Boolean(cronSecret) && req.headers.get("x-cron-secret") === cronSecret;
  const isServiceCall = token === SERVICE_KEY || isCronCall;
  // The scheduled drain may only run the queue — never arbitrary pushes.
  if (isCronCall && action !== "run_queue") return j(403, { error: "Scheduled calls may only run the queue" });
  if (!isServiceCall) {
    if (!token) return j(401, { error: "Unauthorized" });
    const asUser = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: authErr } = await asUser.auth.getUser(token);
    if (authErr || !userData?.user) {
      console.error("auth check failed", { hasToken: Boolean(token), tokenLen: token.length, authErr: authErr?.message });
      return j(401, { error: "Unauthorized" });
    }
    const userId = userData.user.id;
    const { data: prof } = await admin.from("profiles").select("id, user_type").eq("user_id", userId).maybeSingle();
    actor = prof?.id ?? null;
    if (prof?.user_type !== "platform") {
      const { data: allowed } = await asUser.rpc("user_has_permission", { target_tenant_id: tenantId, permission_code: "settings.xero.manage" });
      if (!allowed) return j(403, { error: "You do not have permission to manage the Xero integration" });
    }
  }

  try {
    if (action === "connections") {
      const conns = await xeroConnections();
      return j(200, { connections: conns });
    }

    if (action === "test") {
      const s = await getSettings(tenantId);
      const org = await xero({ tenantId: s.xero_tenant_id! }, "Organisation");
      const name = org?.Organisations?.[0]?.Name ?? "Unknown";
      await admin.from("xero_settings")
        .update({ last_test_at: new Date().toISOString(), last_test_result: `Connected to ${name}` })
        .eq("tenant_id", tenantId);
      return j(200, { ok: true, organisation: name });
    }

    if (action === "push") {
      const s = await getSettings(tenantId);
      const type: string = body?.entity_type;
      const requestedIds: string[] = body?.entity_ids ?? (body?.entity_id ? [body.entity_id] : []);
      if (!type || !requestedIds.length) return j(400, { error: "entity_type and entity_id(s) required" });
      // An invoice can require several Xero and database round-trips (contact,
      // item lookup, invoice write and logging). Keep each HTTP invocation well
      // below Supabase's idle timeout; callers continue in chunks. We also stop
      // early on a wall-clock budget so the function always answers.
      const ids = requestedIds.slice(0, type === "invoice" ? 2 : 5);
      const deadline = Date.now() + 60_000;
      const results: any[] = [];
      let stoppedEarly = false;
      for (const id of ids) {
        if (Date.now() > deadline) { stoppedEarly = true; break; }
        try {
          const r = await pushOne(s, type, id, actor);
          results.push({ id, ok: true, ...(typeof r === "object" ? r : { xero_id: r }) });
          await pace();
        } catch (e) {
          const msg = String((e as Error).message);
          results.push({ id, ok: false, error: msg });
          await logSync({ tenant_id: tenantId, entity_type: type, entity_id: id, action: "push", status: "error", error_message: msg, triggered_by: actor });
          if (msg.includes("[429]")) break; // back off; the rest stay for a retry
        }
      }
      const attempted = results.length;
      return j(200, {
        results,
        succeeded: results.filter((r) => r.ok).length,
        failed: results.filter((r) => !r.ok).length,
        stopped_early: stoppedEarly,
        remaining: Math.max(0, requestedIds.length - attempted),
      });
    }

    if (action === "tax_rates") {
      const s = await getSettings(tenantId);
      const res = await xero({ tenantId: s.xero_tenant_id! }, "TaxRates");
      const rates = (res?.TaxRates ?? [])
        .filter((r: any) => r.Status === "ACTIVE" && r.CanApplyToRevenue)
        .map((r: any) => ({ name: r.Name, taxType: r.TaxType, rate: Number(r.DisplayTaxRate ?? 0) }));
      return j(200, { rates });
    }

    if (action === "push_item_codes") {
      const s = await getSettings(tenantId);
      return j(200, await pushItemCodes(s, actor));
    }

    if (action === "pull_contacts") {
      const s = await getSettings(tenantId);
      const startPage = Math.max(1, Number(body?.page ?? 1));
      return j(200, await pullContacts(s, actor, startPage));
    }

    if (action === "match_contacts") {
      const s = await getSettings(tenantId);
      return j(200, await autoMatchContacts(s, body?.cursor ?? null));
    }

    if (action === "link_contacts") {
      const s = await getSettings(tenantId);
      const ids: string[] = body?.staging_ids ?? [];
      if (!ids.length) return j(400, { error: "staging_ids required" });
      return j(200, await linkContacts(s, ids, actor));
    }

    if (action === "run_queue") {
      const s = await getSettings(tenantId);
      // Queue items execute the same multi-call Xero workflow as manual pushes.
      // Process a short slice so the request always returns before the edge
      // runtime's idle timeout; subsequent runs drain the remaining rows.
      const limit = Math.min(Math.max(1, Number(body?.limit ?? 5)), 5);
      const deadline = Date.now() + 60_000;
      const { data: items } = await admin.from("xero_sync_queue")
        .select("*").eq("tenant_id", tenantId).eq("status", "pending")
        .lte("run_after", new Date().toISOString())
        .order("created_at", { ascending: true }).limit(limit);
      let done = 0, failed = 0;
      for (const item of items ?? []) {
        if (Date.now() > deadline) break;
        try {
          await pushOne(s, item.entity_type, item.entity_id, null);
          await admin.from("xero_sync_queue").update({ status: "done", last_error: null }).eq("id", item.id);
          done++;
        } catch (e) {
          const msg = String((e as Error).message);
          const attempts = (item.attempts ?? 0) + 1;
          await admin.from("xero_sync_queue").update({
            status: attempts >= 5 ? "failed" : "pending",
            attempts,
            last_error: msg,
            run_after: new Date(Date.now() + Math.min(attempts, 5) * 5 * 60_000).toISOString(),
          }).eq("id", item.id);
          await logSync({ tenant_id: tenantId, entity_type: item.entity_type, entity_id: item.entity_id, action: "queue", status: "error", error_message: msg });
          failed++;
          if (msg.includes("[429]")) break;
        }
      }
      return j(200, { processed: (items ?? []).length, done, failed });
    }

    return j(400, { error: `Unknown action "${action}"` });
  } catch (e) {
    const msg = String((e as Error).message);
    await logSync({ tenant_id: tenantId, entity_type: "system", action, status: "error", error_message: msg, triggered_by: actor });
    return j(400, { error: msg });
  }
});
