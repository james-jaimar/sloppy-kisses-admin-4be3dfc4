// One entry point for all Xero pushes: connection test, contacts, invoices,
// payments, credit notes, plus the queue worker used by auto-push.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { xero, xeroConnections, xeroDate } from "../_shared/xero.ts";

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

  let contactId = c.xero_customer_id as string | null;

  // Match on email first so we never duplicate an existing Xero contact.
  if (!contactId && c.email) {
    const found = await xero(ctx, `Contacts?where=${encodeURIComponent(`EmailAddress=="${c.email}"`)}`);
    contactId = found?.Contacts?.[0]?.ContactID ?? null;
  }

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

async function pushInvoice(s: Settings, invoiceId: string, actor: string | null) {
  const ctx = { tenantId: s.xero_tenant_id! };
  const { data: inv, error } = await admin
    .from("invoices")
    .select("id, tenant_id, invoice_number, status, issue_date, due_date, notes, customer_id, xero_invoice_id, invoice_items(id, description, quantity, unit_price, line_total, xero_account_code, vat_rate, sort_order, booking_id)")
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

  const lines = (inv.invoice_items ?? [])
    .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((l: any) => ({
      Description: l.description || "Service",
      Quantity: Number(l.quantity ?? 1),
      UnitAmount: Number(l.unit_price ?? 0),
      AccountCode: l.xero_account_code
        || (l.booking_id ? s.service_account_codes?.[serviceByBooking[l.booking_id]] : null)
        || s.default_sales_account,
      TaxType: Number(l.vat_rate ?? 0) > 0 ? s.default_tax_type : s.zero_rated_tax_type,
    }));
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
  const { data } = await admin.from("customers").select("xero_customer_id").eq("id", customerId).maybeSingle();
  if (data?.xero_customer_id) return data.xero_customer_id as string;
  return await pushCustomer(s, customerId, actor);
}

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
  const isServiceCall = token === SERVICE_KEY;
  if (!isServiceCall) {
    if (!token) return j(401, { error: "Unauthorized" });
    const asUser = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: claims, error: authErr } = await asUser.auth.getClaims(token);
    if (authErr || !claims?.claims) return j(401, { error: "Unauthorized" });
    const userId = claims.claims.sub as string;
    const { data: prof } = await admin.from("profiles").select("id, user_type").eq("user_id", userId).maybeSingle();
    actor = prof?.id ?? null;
    if (prof?.user_type !== "platform") {
      const { data: allowed } = await asUser.rpc("user_has_permission", { _tenant_id: tenantId, _code: "settings.xero.manage" });
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
      const ids: string[] = body?.entity_ids ?? (body?.entity_id ? [body.entity_id] : []);
      if (!type || !ids.length) return j(400, { error: "entity_type and entity_id(s) required" });
      const results: any[] = [];
      for (const id of ids) {
        try {
          const r = await pushOne(s, type, id, actor);
          results.push({ id, ok: true, ...(typeof r === "object" ? r : { xero_id: r }) });
        } catch (e) {
          const msg = String((e as Error).message);
          results.push({ id, ok: false, error: msg });
          await logSync({ tenant_id: tenantId, entity_type: type, entity_id: id, action: "push", status: "error", error_message: msg, triggered_by: actor });
          if (msg.includes("[429]")) break; // back off; the rest stay for a retry
        }
      }
      return j(200, {
        results,
        succeeded: results.filter((r) => r.ok).length,
        failed: results.filter((r) => !r.ok).length,
      });
    }

    if (action === "run_queue") {
      const s = await getSettings(tenantId);
      const limit = Math.min(Number(body?.limit ?? 40), 100);
      const { data: items } = await admin.from("xero_sync_queue")
        .select("*").eq("tenant_id", tenantId).eq("status", "pending")
        .lte("run_after", new Date().toISOString())
        .order("created_at", { ascending: true }).limit(limit);
      let done = 0, failed = 0;
      for (const item of items ?? []) {
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
