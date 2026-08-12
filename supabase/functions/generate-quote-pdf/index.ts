// Branded PDF for a hotel quote (estimates row) — same layout as the invoice.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { PDFDocument, rgb, type PDFFont, type RGB } from "https://esm.sh/pdf-lib@1.17.1";
import {
  embedFonts, makeSafe, hexToRgb, tint, PALETTE, fmtZar, fmtDate,
  wrapText, wrapMultiline, embedTenantLogo,
} from "../_shared/pdf-brand.ts";

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

  const [{ data: items }, { data: customer }, { data: settings }, { data: tenant }] = await Promise.all([
    admin.from("estimate_items").select("*").eq("estimate_id", quoteId).order("sort_order"),
    admin.from("customers")
      .select("id, full_name, customer_number, email, mobile, phone_alt, address_line_1, address_line_2, suburb, city, province, postcode")
      .eq("id", q.customer_id).maybeSingle(),
    admin.from("invoicing_settings").select("*").eq("tenant_id", q.tenant_id).maybeSingle(),
    admin.from("tenants").select("id, name, primary_colour, logo_url, contact_email, contact_phone").eq("id", q.tenant_id).maybeSingle(),
  ]);

  try {
    const brand = hexToRgb(tenant?.primary_colour);
    const brandSoft = tint(brand, 0.85);
    const { text, muted, line, white } = PALETTE;

    const pdf = await PDFDocument.create();
    const { reg, bold, unicode } = await embedFonts(pdf);
    const safe = makeSafe(unicode);
    const logoImg = await embedTenantLogo(pdf, admin, tenant?.logo_url);

    const page = pdf.addPage([595, 842]);
    const { width, height } = page.getSize();
    const M = 40;

    const draw = (t: string, x: number, y: number, size = 9, font: PDFFont = reg, color: RGB = text) =>
      page.drawText(safe(t), { x, y, size, font, color });
    const drawRight = (t: string, xRight: number, y: number, size: number, font: PDFFont, color: RGB) => {
      const s = safe(t);
      page.drawText(s, { x: xRight - font.widthOfTextAtSize(s, size), y, size, font, color });
    };

    // ── Top brand bar ───────────────────────────────────────────────────────
    page.drawRectangle({ x: 0, y: height - 4, width, height: 4, color: brand });

    // ── Header ──────────────────────────────────────────────────────────────
    let cursorY = height - 30;
    if (logoImg) {
      const scale = Math.min(1, 60 / logoImg.height);
      page.drawImage(logoImg, { x: M, y: cursorY - logoImg.height * scale, width: logoImg.width * scale, height: logoImg.height * scale });
    } else {
      draw(settings?.company_name || tenant?.name || "Sloppy Kisses", M, cursorY - 16, 16, bold, brand);
    }
    drawRight("QUOTE", width - M, cursorY - 4, 20, bold, text);
    drawRight(`# ${q.estimate_number ?? ""}`, width - M, cursorY - 22, 11, reg, muted);

    cursorY -= 80;

    // ── From / Quote for ────────────────────────────────────────────────────
    const colW = (width - 2 * M - 20) / 2;
    const boxTop = cursorY;
    const boxH = 110;

    page.drawRectangle({ x: M, y: boxTop - boxH, width: colW, height: boxH, borderColor: line, borderWidth: 0.8, color: brandSoft, opacity: 0.4 });
    draw("FROM", M + 10, boxTop - 15, 8, bold, muted);
    let y1 = boxTop - 30;
    draw(settings?.company_name || tenant?.name || "-", M + 10, y1, 11, bold); y1 -= 14;
    if (settings?.vat_number) { draw(`VAT ${settings.vat_number}`, M + 10, y1, 9, reg, muted); y1 -= 12; }
    if (settings?.address) y1 = wrapText(page, safe(settings.address), M + 10, y1, colW - 20, 9, reg, text) - 2;
    if (tenant?.contact_email) { draw(tenant.contact_email, M + 10, y1, 9, reg, text); y1 -= 12; }
    if (tenant?.contact_phone) { draw(tenant.contact_phone, M + 10, y1, 9, reg, text); }

    const x2 = M + colW + 20;
    page.drawRectangle({ x: x2, y: boxTop - boxH, width: colW, height: boxH, borderColor: line, borderWidth: 0.8 });
    draw("QUOTE FOR", x2 + 10, boxTop - 15, 8, bold, muted);
    let y2 = boxTop - 30;
    draw(customer?.full_name || "-", x2 + 10, y2, 11, bold); y2 -= 14;
    if (customer?.customer_number) { draw(customer.customer_number, x2 + 10, y2, 9, reg, muted); y2 -= 12; }
    const addr = [
      customer?.address_line_1, customer?.address_line_2, customer?.suburb,
      [customer?.city, customer?.postcode].filter(Boolean).join(" ").trim(), customer?.province,
    ].filter((s) => s && String(s).trim().length > 0).join(", ");
    if (addr) y2 = wrapText(page, safe(addr), x2 + 10, y2, colW - 20, 9, reg, text) - 2;
    if (customer?.email) { draw(customer.email, x2 + 10, y2, 9, reg, text); y2 -= 12; }
    const phone = customer?.mobile || customer?.phone_alt;
    if (phone) { draw(phone, x2 + 10, y2, 9, reg, text); }

    cursorY = boxTop - boxH - 18;

    // ── Metadata strip ──────────────────────────────────────────────────────
    const stripH = 34;
    page.drawRectangle({ x: M, y: cursorY - stripH, width: width - 2 * M, height: stripH, color: brand, opacity: 0.08, borderColor: line, borderWidth: 0.6 });
    const stripW = (width - 2 * M) / 4;
    const strip: Array<[string, string]> = [
      ["QUOTE #", q.estimate_number ?? "-"],
      ["ISSUED", fmtDate(q.issue_date)],
      ["VALID UNTIL", fmtDate(q.hold_until ?? q.expiry_date)],
      ["STATUS", String(q.status ?? "").toUpperCase()],
    ];
    strip.forEach(([label, val], i) => {
      const x = M + i * stripW + 10;
      draw(label, x, cursorY - 12, 7, bold, muted);
      draw(val, x, cursorY - 25, 10, bold, text);
    });
    cursorY -= stripH + 18;

    // ── Stay summary ────────────────────────────────────────────────────────
    const extras = (q.extras ?? {}) as any;
    const stayBits: string[] = [];
    if (q.start_at || q.end_at) stayBits.push(`${fmtDate(q.start_at)} to ${fmtDate(q.end_at)}`);
    if (q.accommodation_type) stayBits.push(String(q.accommodation_type));
    if (extras?.check_in_window) stayBits.push(`Arrival ${extras.check_in_window}`);
    if (extras?.check_out_window) stayBits.push(`Collection ${extras.check_out_window}`);
    const groomPets: string[] = (extras?.pets ?? [])
      .filter((p: any) => p?.grooming_required)
      .map((p: any) => p?.name ?? "Pet");
    if (groomPets.length) stayBits.push(`Grooming: ${groomPets.join(", ")}`);

    if (stayBits.length) {
      const stayH = 42;
      page.drawRectangle({ x: M, y: cursorY - stayH, width: width - 2 * M, height: stayH, color: brandSoft, opacity: 0.5, borderColor: line, borderWidth: 0.6 });
      draw("YOUR STAY", M + 10, cursorY - 14, 7, bold, muted);
      wrapText(page, safe(stayBits.join("   |   ")), M + 10, cursorY - 28, width - 2 * M - 20, 9.5, reg, text);
      cursorY -= stayH + 18;
    }

    // ── Items table ─────────────────────────────────────────────────────────
    const cols = [
      { label: "DESCRIPTION", w: 300, align: "left" as const },
      { label: "QTY", w: 45, align: "right" as const },
      { label: "UNIT", w: 85, align: "right" as const },
      { label: "TOTAL", w: width - 2 * M - 300 - 45 - 85, align: "right" as const },
    ];
    const headerH = 22;
    page.drawRectangle({ x: M, y: cursorY - headerH, width: width - 2 * M, height: headerH, color: brand });
    let cx = M;
    cols.forEach((c) => {
      if (c.align === "right") drawRight(c.label, cx + c.w - 8, cursorY - 15, 8, bold, white);
      else draw(c.label, cx + 8, cursorY - 15, 8, bold, white);
      cx += c.w;
    });
    cursorY -= headerH;

    const rowH = 20;
    for (const it of (items ?? [])) {
      if (cursorY - rowH < 210) break;
      page.drawLine({ start: { x: M, y: cursorY }, end: { x: width - M, y: cursorY }, thickness: 0.4, color: line });
      let x = M;
      const cells = [
        String(it.description ?? "").slice(0, 70),
        String(Number(it.quantity)),
        fmtZar(Number(it.unit_price)),
        fmtZar(Number(it.line_total)),
      ];
      cols.forEach((c, i) => {
        if (c.align === "right") drawRight(cells[i], x + c.w - 8, cursorY - 14, 9, reg, text);
        else draw(cells[i], x + 8, cursorY - 14, 9, reg, text);
        x += c.w;
      });
      cursorY -= rowH;
    }
    page.drawLine({ start: { x: M, y: cursorY }, end: { x: width - M, y: cursorY }, thickness: 0.4, color: line });
    cursorY -= 20;

    // ── Totals + deposit ────────────────────────────────────────────────────
    const total = Number(q.total ?? 0);
    const deposit = Math.round(total * 50) / 100;
    const totalsW = 230;
    const totalsX = width - M - totalsW;
    const rows: Array<[string, string, boolean]> = [
      ["Subtotal", fmtZar(Number(q.subtotal ?? total)), false],
      ["Total (VAT incl.)", fmtZar(total), true],
      ["50% deposit to secure", fmtZar(deposit), false],
      ["Balance before arrival", fmtZar(total - deposit), false],
    ];
    let ty = cursorY;
    for (const [label, val, emph] of rows) {
      const f = emph ? bold : reg;
      const size = emph ? 11 : 10;
      if (emph) page.drawRectangle({ x: totalsX, y: ty - 18, width: totalsW, height: 18, color: brand, opacity: 0.1 });
      draw(label, totalsX + 10, ty - 13, size, f, text);
      drawRight(val, totalsX + totalsW - 10, ty - 13, size, f, text);
      ty -= 20;
    }

    // Banking (left of totals)
    if (settings?.banking_details) {
      const bkW = totalsX - M - 20;
      page.drawRectangle({ x: M, y: ty, width: bkW, height: cursorY - ty, borderColor: line, borderWidth: 0.6 });
      draw("BANKING DETAILS", M + 10, cursorY - 12, 8, bold, muted);
      wrapMultiline(page, safe(settings.banking_details), M + 10, cursorY - 26, bkW - 20, 9, reg, text);
    }
    cursorY = ty - 18;

    // ── Notes / footer ──────────────────────────────────────────────────────
    const holdNote = q.hold_until
      ? `These dates are pencilled in for you until ${fmtDate(q.hold_until)}. A 50% deposit secures the booking; the balance is due before arrival.`
      : "A 50% deposit secures the booking; the balance is due before arrival.";
    const notes = [holdNote, q.notes, settings?.footer_notes].filter(Boolean).join("\n\n");
    draw("NOTES", M, cursorY, 8, bold, muted);
    wrapMultiline(page, safe(notes), M, cursorY - 14, width - 2 * M, 9, reg, muted);

    page.drawRectangle({ x: 0, y: 0, width, height: 3, color: brand });
    draw(`${tenant?.contact_email ?? ""}   ${tenant?.contact_phone ?? ""}`.trim(), M, 16, 8, reg, muted);

    const bytes = await pdf.save();
    return new Response(bytes, {
      headers: { ...cors, "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${q.estimate_number ?? "quote"}.pdf"` },
    });
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    console.error("generate-quote-pdf failed:", msg);
    return jerr(500, `PDF build failed: ${msg}`);
  }
});