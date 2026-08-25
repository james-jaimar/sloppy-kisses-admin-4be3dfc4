// Emails a hotel quote PDF to the customer via the tenant's SMTP settings.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { guardSend } from "../_shared/send-guard.ts";
import { buildQuoteEmail, DEFAULT_QUOTE_INTRO, fmtZar, fmtDate as fmtD } from "../_shared/quote-email.ts";
import { resolveQuoteEmailSettings } from "../_shared/quote-email-defaults.ts";
import { publicBrandLogoUrl } from "../_shared/public-brand-logo.ts";

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

const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" }) : "—";

/** Replace {{token}} placeholders from a flat/nested context. */
function render(tpl: string, ctx: Record<string, any>): string {
  return String(tpl ?? "").replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, path) => {
    let cur: any = ctx;
    for (const p of String(path).split(".")) { if (cur == null) return ""; cur = cur[p]; }
    return cur == null ? "" : String(cur);
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return j(405, { error: "Method not allowed" });

  let body: any;
  try { body = await req.json(); } catch { return j(400, { error: "Invalid JSON" }); }
  const quoteId: string | undefined = body?.quote_id;
  const overrideTo: string | undefined = body?.to;
  if (!quoteId) return j(400, { error: "quote_id required" });

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return j(401, { error: "Missing Authorization" });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: q } = await admin.from("estimates").select("*").eq("id", quoteId).maybeSingle();
  if (!q) return j(404, { error: "Quote not found" });

  const isServiceCall = authHeader.includes(SERVICE_KEY);
  if (!isServiceCall) {
    const caller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: u } = await caller.auth.getUser();
    if (!u?.user) return j(401, { error: "Not authenticated" });
    const { data: allowed } = await caller.rpc("user_has_permission", {
      target_tenant_id: q.tenant_id,
      permission_code: "invoices.send",
    });
    if (!allowed) return j(403, { error: "Missing invoices.send permission" });
  }

  const [{ data: customer }, { data: smtp }, { data: tenant }] = await Promise.all([
    admin.from("customers").select("id, full_name, email, notify_email").eq("id", q.customer_id).maybeSingle(),
    admin.from("email_transport_settings").select("*").eq("tenant_id", q.tenant_id).maybeSingle(),
    admin.from("tenants").select("id, name, primary_colour, logo_url, app_url, contact_email, contact_phone").eq("id", q.tenant_id).maybeSingle(),
  ]);

  const recipient = overrideTo || customer?.email;
  if (!recipient) return j(400, { error: "Customer has no email address on file." });
  if (!overrideTo && customer?.notify_email === false) {
    return j(400, { error: "Customer has opted out of email notifications." });
  }
  if (!smtp?.smtp_host || !smtp?.smtp_port || !smtp?.from_email) {
    return j(400, { error: "SMTP is not configured. Set it up in Settings → Email server." });
  }

  // ── Build the branded quote email ─────────────────────────────────────────
  const extras = (q.extras ?? {}) as any;
  const petIds: string[] = Array.isArray(q.pet_ids) ? q.pet_ids : [];
  const [{ data: pets }, { data: tpl }, { data: guidelinesRow }, { data: emailSettingsRow }] = await Promise.all([
    petIds.length
      ? admin.from("pets").select("id, name").in("id", petIds)
      : Promise.resolve({ data: [] as any[] }),
    admin.from("message_templates")
      .select("subject, body, is_active")
      .eq("tenant_id", q.tenant_id).eq("event_code", "quote_sent").eq("channel", "email")
      .maybeSingle(),
    admin.rpc("get_hotel_guidelines", { p_tenant: q.tenant_id }),
    admin.from("hotel_quote_email_settings").select("*").eq("tenant_id", q.tenant_id).maybeSingle(),
  ]);

  const petNames: string[] = (pets ?? []).map((p: any) => p.name).filter(Boolean);
  const nights = q.start_at && q.end_at
    ? Math.max(1, Math.round((new Date(q.end_at).getTime() - new Date(q.start_at).getTime()) / 86400000))
    : null;
  const total = Number(q.total ?? 0);
  const isDaycare = q.service_type === "daycare";
  // Daycare places are billed in full for the first month — there is no 50% deposit.
  const deposit = isDaycare ? total : Math.round(total * 50) / 100;
  const daycarePlan = extras?.daycare_plan_name ?? null;
  const daycareDays: string[] = Array.isArray(extras?.weekdays) ? extras.weekdays : [];
  const validUntil = q.hold_until ?? q.expiry_date ?? null;
  const firstName = (customer?.full_name ?? "there").split(/\s+/)[0];

  const ctx = {
    customer: { first_name: firstName, full_name: customer?.full_name ?? "", email: customer?.email ?? "" },
    tenant: { name: tenant?.name ?? "" },
    pet: { names: petNames.length ? petNames.join(" and ") : "your dog" },
    quote: {
      number: q.estimate_number ?? "",
      dates: isDaycare
        ? (q.start_at ? `starting ${fmtD(q.start_at)}` : "your requested start date")
        : (q.start_at ? `${fmtD(q.start_at)} to ${fmtD(q.end_at)}` : "your requested dates"),
      nights: nights ?? "",
      accommodation: (isDaycare ? daycarePlan : q.accommodation_type) ?? "",
      total: fmtZar(total),
      deposit: fmtZar(deposit),
      valid_until: fmtD(validUntil),
    },
  };

  const useTpl = tpl && tpl.is_active !== false && String(tpl.body ?? "").trim().length > 0;
  const intro = render(useTpl ? String(tpl!.body) : DEFAULT_QUOTE_INTRO, ctx);
  const subject = useTpl && tpl!.subject
    ? render(String(tpl!.subject), ctx)
    : `Your stay quote ${q.estimate_number} from ${tenant?.name ?? "us"}`;

  // Use one stable public URL in previews and delivered mail. The SMTP library
  // exposes CID images as normal attachments and Outlook may then fail to show
  // them inline. The public endpoint safely proxies only the tenant logo.
  const logoUrl = publicBrandLogoUrl(SUPABASE_URL, q.tenant_id, tenant?.logo_url, (tenant as any)?.app_url);

  const guidelines = (Array.isArray(guidelinesRow) ? guidelinesRow[0] : guidelinesRow)?.guidelines_md ?? null;

  // Tenant-editable copy for the rest of the email, with tokens resolved.
  const baseSettings = resolveQuoteEmailSettings(emailSettingsRow);
  const settings = {
    ...baseSettings,
    hero_label: render(baseSettings.hero_label, ctx),
    hero_headline: render(baseSettings.hero_headline, ctx),
    total_label: render(baseSettings.total_label, ctx),
    deposit_label: render(baseSettings.deposit_label, ctx),
    hold_line: render(baseSettings.hold_line, ctx),
    cta_label: render(baseSettings.cta_label, ctx),
    cta_subtext: render(baseSettings.cta_subtext, ctx),
    section_heading: render(baseSettings.section_heading, ctx),
    signoff_html: render(baseSettings.signoff_html, ctx),
    cards: baseSettings.cards.map((c) => ({
      ...c,
      title: render(c.title ?? "", ctx),
      body_html: render(c.body_html ?? "", ctx),
    })),
  };

  const { html, text } = buildQuoteEmail({
    tenantName: tenant?.name ?? "Sloppy Kisses",
    brandColour: (tenant as any)?.primary_colour ?? "#FF5A5A",
    logoUrl,
    appUrl: (tenant as any)?.app_url ?? null,
    contactEmail: (tenant as any)?.contact_email ?? null,
    contactPhone: (tenant as any)?.contact_phone ?? null,
    customerFirstName: firstName,
    quoteNumber: q.estimate_number ?? "",
    startAt: q.start_at,
    endAt: q.end_at,
    nights: isDaycare ? null : nights,
    accommodationType: isDaycare
      ? [daycarePlan, daycareDays.length ? `${daycareDays.length} day${daycareDays.length === 1 ? "" : "s"} a week` : null]
          .filter(Boolean).join(" — ") || null
      : q.accommodation_type,
    petNames,
    checkInWindow: extras?.check_in_window ?? null,
    checkOutWindow: extras?.check_out_window ?? null,
    total,
    deposit,
    validUntil,
    publicToken: (q as any).public_token ?? null,
    intro,
    guidelines,
    settings,
  });

  const pdfRes = await fetch(`${SUPABASE_URL}/functions/v1/generate-quote-pdf`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
    },
    body: JSON.stringify({ quote_id: q.id }),
  });
  if (!pdfRes.ok) {
    let detail = await pdfRes.text();
    try { detail = JSON.parse(detail)?.error ?? detail; } catch { /* keep raw text */ }
    const reason = `PDF generation failed: ${detail}`;
    await admin.from("email_log").insert({
      tenant_id: q.tenant_id,
      customer_id: q.customer_id,
      template_code: "quote_send",
      to_email: recipient,
      subject,
      status: "failed",
      error_message: reason,
      sent_at: null,
    } as any);
    return j(200, { ok: false, error: reason });
  }
  const pdfBytes = new Uint8Array(await pdfRes.arrayBuffer());

  const gate = await guardSend(admin, {
    tenantId: q.tenant_id,
    recipient,
    subject,
    templateCode: "quote_send",
    customerId: q.customer_id ?? null,
  });
  if (!gate.allowed) return j(200, { ok: false, blocked: true, error: gate.reason });

  let ok = false;
  let error: string | null = null;
  try {
    const client = new SMTPClient({
      connection: {
        hostname: smtp.smtp_host,
        port: Number(smtp.smtp_port),
        tls: (smtp.smtp_secure ?? "starttls") === "ssl",
        auth: smtp.smtp_username && smtp.smtp_password
          ? { username: smtp.smtp_username, password: smtp.smtp_password }
          : undefined,
      },
    });
    await client.send({
      from: smtp.from_name ? `${smtp.from_name} <${smtp.from_email}>` : smtp.from_email,
      to: recipient,
      replyTo: smtp.reply_to ?? undefined,
      subject,
      content: text,
      html,
      attachments: [{
        filename: `${q.estimate_number ?? "quote"}.pdf`,
        content: pdfBytes,
        contentType: "application/pdf",
        encoding: "binary",
      }],
    });
    await client.close();
    ok = true;
  } catch (e) {
    error = (e as Error).message;
  }

  await admin.from("email_log").insert({
    tenant_id: q.tenant_id,
    customer_id: q.customer_id,
    template_code: "quote_send",
    to_email: recipient,
    subject,
    status: ok ? "sent" : "failed",
    error_message: error,
    sent_at: ok ? new Date().toISOString() : null,
  } as any);

  if (!ok) return j(502, { ok: false, error });

  // The hold on the dates starts the moment the quote is sent.
  const { data: wf } = await admin
    .from("hotel_workflow_settings")
    .select("quote_validity_days")
    .eq("tenant_id", q.tenant_id)
    .maybeSingle();
  const validityDays = Number((wf as any)?.quote_validity_days ?? 14) || 14;
  const holdUntil = new Date(Date.now() + validityDays * 86400000).toISOString().slice(0, 10);
  const firstSend = !q.sent_at;

  await admin.from("estimates").update({
    status: q.status === "draft" ? "sent" : q.status,
    sent_at: new Date().toISOString(),
    ...(firstSend || !q.hold_until ? { hold_until: holdUntil, expiry_date: holdUntil } : {}),
    updated_at: new Date().toISOString(),
  }).eq("id", q.id);

  return j(200, { ok: true });
});
