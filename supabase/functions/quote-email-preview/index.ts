// Renders the hotel quote email with sample data so the team can preview their
// edits, and optionally sends that exact email to the test recipient.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildQuoteEmail, DEFAULT_QUOTE_INTRO, fmtDate } from "../_shared/quote-email.ts";
import { resolveQuoteEmailSettings } from "../_shared/quote-email-defaults.ts";
import { loadTransport, sendMail } from "../_shared/comms-transport.ts";

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

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return j(401, { error: "Missing Authorization" });

  let body: any;
  try { body = await req.json(); } catch { return j(400, { error: "Invalid JSON" }); }
  const tenantId: string | undefined = body?.tenant_id;
  if (!tenantId) return j(400, { error: "tenant_id required" });
  const sendTest = Boolean(body?.send_test);

  const caller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: u } = await caller.auth.getUser();
  if (!u?.user) return j(401, { error: "Not authenticated" });
  const { data: allowed } = await caller.rpc("user_has_permission", {
    target_tenant_id: tenantId, permission_code: "settings.hotel.manage",
  });
  if (!allowed) return j(403, { error: "Missing settings.hotel.manage permission" });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const [{ data: tenant }, { data: guidelinesRow }, { data: tpl }, { data: commsRow }] = await Promise.all([
    admin.from("tenants").select("name, primary_colour, logo_url, app_url, contact_email, contact_phone")
      .eq("id", tenantId).maybeSingle(),
    admin.rpc("get_hotel_guidelines", { p_tenant: tenantId }),
    admin.from("message_templates").select("body, is_active")
      .eq("tenant_id", tenantId).eq("event_code", "quote_sent").eq("channel", "email").maybeSingle(),
    admin.from("comms_settings").select("test_recipient").eq("tenant_id", tenantId).maybeSingle(),
  ]);

  // Sample stay, four nights from next Monday-ish, so the preview looks real.
  const start = new Date(Date.now() + 7 * 86400000);
  const end = new Date(start.getTime() + 4 * 86400000);
  const total = 2400;
  const deposit = 1200;
  const validUntil = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const petNames = ["Charlie", "Maia"];

  const ctx = {
    customer: { first_name: "Sample", full_name: "Sample Customer", email: "sample@example.com" },
    tenant: { name: tenant?.name ?? "Sloppy Kisses" },
    pet: { names: petNames.join(" and ") },
    quote: {
      number: "QU-00001",
      dates: `${fmtDate(start.toISOString())} to ${fmtDate(end.toISOString())}`,
      nights: 4,
      accommodation: "Barkside Inn - Cabanas",
      total: "R 2 400.00",
      deposit: "R 1 200.00",
      valid_until: fmtDate(validUntil),
    },
  };

  const base = resolveQuoteEmailSettings(body?.settings ?? null);
  const settings = {
    ...base,
    hero_label: render(base.hero_label, ctx),
    hero_headline: render(base.hero_headline, ctx),
    total_label: render(base.total_label, ctx),
    deposit_label: render(base.deposit_label, ctx),
    hold_line: render(base.hold_line, ctx),
    cta_label: render(base.cta_label, ctx),
    cta_subtext: render(base.cta_subtext, ctx),
    section_heading: render(base.section_heading, ctx),
    signoff_html: render(base.signoff_html, ctx),
    cards: base.cards.map((c) => ({
      ...c,
      title: render(c.title ?? "", ctx),
      body_html: render(c.body_html ?? "", ctx),
    })),
  };

  let logoUrl: string | null = null;
  let logoAttachment: {
    filename: string;
    content: Uint8Array;
    contentType: string;
    encoding: "binary";
    contentID: string;
  } | null = null;
  if (tenant?.logo_url) {
    try {
      let bytes: Uint8Array;
      let contentType = "image/png";
      if (/^https?:\/\//i.test(tenant.logo_url)) {
        const logoRes = await fetch(tenant.logo_url);
        if (!logoRes.ok) throw new Error(`logo fetch failed [${logoRes.status}]`);
        bytes = new Uint8Array(await logoRes.arrayBuffer());
        contentType = logoRes.headers.get("content-type")?.split(";")[0] || contentType;
      } else {
        const { data: logoBlob, error: downloadError } = await admin.storage
          .from("tenant-branding")
          .download(tenant.logo_url);
        if (downloadError || !logoBlob) throw new Error(downloadError?.message ?? "logo download returned no data");
        bytes = new Uint8Array(await logoBlob.arrayBuffer());
        contentType = logoBlob.type || contentType;
      }
      if (bytes.byteLength > 0) {
        logoUrl = "cid:tenant-logo";
        logoAttachment = {
          filename: `tenant-logo.${contentType.includes("jpeg") ? "jpg" : contentType.includes("svg") ? "svg" : "png"}`,
          content: bytes,
          contentType,
          encoding: "binary",
          contentID: "tenant-logo",
        };
      }
    } catch (e) {
      console.error("logo embed failed:", (e as Error).message);
    }
  }

  const introTpl = tpl && tpl.is_active !== false && String(tpl.body ?? "").trim()
    ? String(tpl.body) : DEFAULT_QUOTE_INTRO;

  const { html, text } = buildQuoteEmail({
    tenantName: tenant?.name ?? "Sloppy Kisses",
    brandColour: (tenant as any)?.primary_colour ?? "#FF5A5A",
    logoUrl,
    appUrl: (tenant as any)?.app_url ?? null,
    contactEmail: (tenant as any)?.contact_email ?? null,
    contactPhone: (tenant as any)?.contact_phone ?? null,
    customerFirstName: "Sample",
    quoteNumber: "QU-00001",
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    nights: 4,
    accommodationType: "Barkside Inn - Cabanas",
    petNames,
    checkInWindow: "Mon–Sat, 09:00–11:00",
    checkOutWindow: "09:00–09:30 daily",
    total,
    deposit,
    validUntil,
    publicToken: "sample-token",
    intro: render(introTpl, ctx),
    guidelines: (Array.isArray(guidelinesRow) ? guidelinesRow[0] : guidelinesRow)?.guidelines_md ?? null,
    settings,
  });

  if (!sendTest) return j(200, { ok: true, html });

  const recipient = typeof body?.to === "string" && body.to.trim()
    ? body.to.trim() : (commsRow?.test_recipient ?? null);
  if (!recipient) return j(400, { error: "No test recipient — set one in Settings → Comms" });

  const transport = await loadTransport(admin, tenantId);
  if (!transport) return j(400, { error: "SMTP not configured — Settings → Email server" });

  const subject = `[TEST] Your stay quote QU-00001 from ${tenant?.name ?? "us"}`;
  const result = await sendMail(transport, recipient, subject, text, html, {
    admin, tenantId, templateCode: "test.quote_email",
  }, logoAttachment ? [logoAttachment] : undefined);
  if (!result.ok && (result as any).blocked) {
    // guardSend already wrote the [BLOCKED] email_log row.
    return j(200, { ok: false, blocked: true, error: result.error, html });
  }
  await admin.from("email_log").insert({
    tenant_id: tenantId, to_email: recipient, subject,
    status: result.ok ? "sent" : "failed",
    error_message: result.ok ? null : result.error,
    template_code: "test.quote_email",
    sent_at: result.ok ? new Date().toISOString() : null,
  } as any);
  if (!result.ok) return j(200, { ok: false, error: result.error, html });
  return j(200, { ok: true, recipient, html });
});
