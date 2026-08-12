// Generates a branded PDF for a hotel quote (estimates row).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { PDFDocument, StandardFonts, rgb, type RGB } from "https://esm.sh/pdf-lib@1.17.1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const jerr = (s: number, msg: string) =>
  new Response(JSON.stringify({ error: msg }), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const fmtZar = (n: number) => "R " + (Number.isFinite(n) ? n : 0).toFixed(2);
const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" }) : "—";

// The standard PDF fonts used here can only encode WinAnsi. Anything outside
// that set (arrows, emoji, smart quotes from pasted text) throws and kills the
// whole PDF, so every string is downgraded to a safe equivalent first.
const SAFE_MAP: Record<string, string> = {
  "\u2192": "to", "\u2190": "to", "\u21d2": "to",
  "\u2018": "'", "\u2019": "'", "\u201c": '"', "\u201d": '"',
  "\u2026": "...", "\u00a0": " ", "\u2022": "-", "\u2713": "y", "\u2717": "x",
};
function safe(v: unknown): string {
  let s = String(v ?? "");
  for (const [k, r] of Object.entries(SAFE_MAP)) s = s.split(k).join(r);
  // Drop anything the WinAnsi encoder still cannot represent.
  return s.replace(/[^\x20-\x7E\xA0-\xFF]/g, "");
}

function hexToRgb(hex?: string | null): RGB {
  const fallback = rgb(1.0, 0.35, 0.35);
  if (!hex) return fallback;
  const m = hex.replace("#", "").match(/^([\da-f]{6})$/i);
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return jerr(405, "Method not allowed");
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth) return jerr(401, "Missing Authorization");

  const isServiceCall = auth.includes(SERVICE_KEY);
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  if (!isServiceCall) {
    const caller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
    const { data: u } = await caller.auth.getUser();
    if (!u?.user) return jerr(401, "Not authenticated");
  }

  let body: any;
  try { body = await req.json(); } catch { return jerr(400, "Invalid JSON"); }
  const quoteId: string | undefined = body?.quote_id;
  if (!quoteId) return jerr(400, "quote_id required");

  const { data: q } = await admin.from("estimates").select("*").eq("id", quoteId).maybeSingle();
  if (!q) return jerr(404, "Quote not found");

  const [{ data: items }, { data: customer }, { data: tenant }] = await Promise.all([
    admin.from("estimate_items").select("*").eq("estimate_id", quoteId).order("sort_order"),
    admin.from("customers").select("full_name, customer_number, email, mobile").eq("id", q.customer_id).maybeSingle(),
    admin.from("tenants").select("name, primary_colour, contact_email, contact_phone").eq("id", q.tenant_id).maybeSingle(),
  ]);

  const brand = hexToRgb(tenant?.primary_colour);
  const text = rgb(0.1, 0.1, 0.15);
  const muted = rgb(0.45, 0.45, 0.5);
  const line = rgb(0.85, 0.85, 0.87);

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const reg = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const M = 44;
  let y = 800;

  page.drawRectangle({ x: 0, y: 806, width: 595, height: 36, color: brand });
  page.drawText(safe(tenant?.name ?? "Quote"), { x: M, y: 818, size: 14, font: bold, color: rgb(1, 1, 1) });

  y = 770;
  page.drawText(safe(`Quote ${q.estimate_number ?? ""}`), { x: M, y, size: 20, font: bold, color: text });
  y -= 20;
  page.drawText(safe(`Issued ${fmtDate(q.issue_date)}${q.expiry_date ? `  ·  valid until ${fmtDate(q.expiry_date)}` : ""}`),
    { x: M, y, size: 10, font: reg, color: muted });

  y -= 34;
  page.drawText(safe("For"), { x: M, y, size: 9, font: bold, color: muted });
  y -= 14;
  page.drawText(safe(customer?.full_name ?? "—"), { x: M, y, size: 11, font: bold, color: text });
  y -= 13;
  if (customer?.email) { page.drawText(safe(customer.email), { x: M, y, size: 9, font: reg, color: muted }); y -= 12; }
  if (customer?.mobile) { page.drawText(safe(customer.mobile), { x: M, y, size: 9, font: reg, color: muted }); y -= 12; }

  if (q.start_at || q.end_at) {
    y -= 8;
    page.drawText(
      safe(`Stay: ${fmtDate(q.start_at)} to ${fmtDate(q.end_at)}${q.accommodation_type ? `  ·  ${q.accommodation_type}` : ""}`),
      { x: M, y, size: 10, font: reg, color: text });
    y -= 12;
  }

  y -= 18;
  page.drawLine({ start: { x: M, y }, end: { x: 595 - M, y }, thickness: 1, color: line });
  y -= 16;
  page.drawText(safe("Description"), { x: M, y, size: 9, font: bold, color: muted });
  page.drawText(safe("Qty"), { x: 360, y, size: 9, font: bold, color: muted });
  page.drawText(safe("Unit"), { x: 410, y, size: 9, font: bold, color: muted });
  page.drawText(safe("Total"), { x: 495, y, size: 9, font: bold, color: muted });
  y -= 8;
  page.drawLine({ start: { x: M, y }, end: { x: 595 - M, y }, thickness: 1, color: line });
  y -= 18;

  for (const it of items ?? []) {
    const desc = String(it.description ?? "").slice(0, 60);
    page.drawText(safe(desc), { x: M, y, size: 10, font: reg, color: text });
    page.drawText(safe(String(Number(it.quantity))), { x: 360, y, size: 10, font: reg, color: text });
    page.drawText(safe(fmtZar(Number(it.unit_price))), { x: 410, y, size: 10, font: reg, color: text });
    page.drawText(safe(fmtZar(Number(it.line_total))), { x: 480, y, size: 10, font: reg, color: text });
    y -= 18;
    if (y < 140) break;
  }

  y -= 6;
  page.drawLine({ start: { x: 340, y }, end: { x: 595 - M, y }, thickness: 1, color: line });
  y -= 18;
  page.drawText(safe("Total"), { x: 400, y, size: 11, font: bold, color: text });
  page.drawText(safe(fmtZar(Number(q.total ?? 0))), { x: 480, y, size: 11, font: bold, color: text });

  if (q.notes) {
    y -= 34;
    page.drawText(safe("Notes"), { x: M, y, size: 9, font: bold, color: muted });
    y -= 14;
    for (const ln of String(q.notes).match(/.{1,90}/g) ?? []) {
      page.drawText(safe(ln), { x: M, y, size: 9, font: reg, color: text });
      y -= 12;
    }
  }

  page.drawText(
    safe(`${tenant?.contact_email ?? ""}   ${tenant?.contact_phone ?? ""}`.trim()),
    { x: M, y: 40, size: 8, font: reg, color: muted });

  const bytes = await pdf.save();
  return new Response(bytes, {
    headers: { ...cors, "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${q.estimate_number ?? "quote"}.pdf"` },
  });
});
