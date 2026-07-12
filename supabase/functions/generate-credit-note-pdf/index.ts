// Generate a branded credit-note PDF for the given credit_note_id.
// Mirrors the invoice PDF layout with a "CREDIT NOTE" banner and reference
// to the source invoice number when present.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "https://esm.sh/pdf-lib@1.17.1";
import fontkit from "https://esm.sh/@pdf-lib/fontkit@1.1.1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const FONT_REG_URL = "https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io@main/fonts/NotoSans/hinted/ttf/NotoSans-Regular.ttf";
const FONT_BOLD_URL = "https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io@main/fonts/NotoSans/hinted/ttf/NotoSans-Bold.ttf";
let _reg: Uint8Array | null = null;
let _bold: Uint8Array | null = null;
async function loadFontBytes(url: string): Promise<Uint8Array | null> {
  try { const r = await fetch(url); if (!r.ok) return null; return new Uint8Array(await r.arrayBuffer()); } catch { return null; }
}
async function getFonts() {
  if (!_reg) _reg = await loadFontBytes(FONT_REG_URL);
  if (!_bold) _bold = await loadFontBytes(FONT_BOLD_URL);
  return { reg: _reg, bold: _bold };
}

const jerr = (s: number, msg: string) =>
  new Response(JSON.stringify({ error: msg }), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const fmtZar = (n: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", minimumFractionDigits: 2 }).format(Number.isFinite(n) ? n : 0);
const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" }) : "—";

function hexToRgb(hex?: string | null): RGB {
  const fallback = rgb(1.0, 0.35, 0.35);
  if (!hex) return fallback;
  const m = hex.replace("#", "").match(/^([\da-f]{6})$/i);
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}
function tint(c: RGB, t: number): RGB {
  return rgb(c.red + (1 - c.red) * t, c.green + (1 - c.green) * t, c.blue + (1 - c.blue) * t);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return jerr(405, "Method not allowed");
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth) return jerr(401, "Missing Authorization");

  const caller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: u } = await caller.auth.getUser();
  if (!u?.user) return jerr(401, "Not authenticated");

  let body: any;
  try { body = await req.json(); } catch { return jerr(400, "Invalid JSON"); }
  const cnId: string | undefined = body?.credit_note_id;
  if (!cnId) return jerr(400, "credit_note_id required");

  const { data: cn, error: cnErr } = await caller.from("credit_notes").select("*").eq("id", cnId).maybeSingle();
  if (cnErr) return jerr(500, cnErr.message);
  if (!cn) return jerr(404, "Credit note not found or access denied");

  const [{ data: items }, { data: customer }, { data: settings }, { data: tenant }, { data: sourceInv }] = await Promise.all([
    admin.from("credit_note_items").select("*").eq("credit_note_id", cnId).order("sort_order"),
    admin.from("customers").select("id, full_name, customer_number, email, mobile, phone_alt, address_line_1, address_line_2, suburb, city, province, postcode").eq("id", cn.customer_id).maybeSingle(),
    admin.from("invoicing_settings").select("*").eq("tenant_id", cn.tenant_id).maybeSingle(),
    admin.from("tenants").select("id, name, primary_colour, logo_url, contact_email, contact_phone").eq("id", cn.tenant_id).maybeSingle(),
    cn.invoice_id
      ? admin.from("invoices").select("id, invoice_number, issue_date").eq("id", cn.invoice_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const brand = hexToRgb(tenant?.primary_colour);
  const brandSoft = tint(brand, 0.85);
  const line = rgb(0.85, 0.85, 0.87);
  const text = rgb(0.1, 0.1, 0.15);
  const muted = rgb(0.45, 0.45, 0.5);

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const { reg: regBytes, bold: boldBytes } = await getFonts();
  const reg = regBytes ? await pdf.embedFont(regBytes, { subset: true }) : await pdf.embedFont(StandardFonts.Helvetica);
  const bold = boldBytes ? await pdf.embedFont(boldBytes, { subset: true }) : await pdf.embedFont(StandardFonts.HelveticaBold);

  let logoImg: any = null;
  if (tenant?.logo_url) {
    try {
      const { data: signed } = await admin.storage.from("tenant-branding").createSignedUrl(tenant.logo_url, 60);
      if (signed?.signedUrl) {
        const r = await fetch(signed.signedUrl);
        if (r.ok) {
          const bytes = new Uint8Array(await r.arrayBuffer());
          const ct = r.headers.get("content-type") || "";
          try {
            logoImg = ct.includes("jpeg") || ct.includes("jpg") ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes);
          } catch { logoImg = null; }
        }
      }
    } catch { /* ignore */ }
  }

  const page: PDFPage = pdf.addPage([595, 842]);
  const { width, height } = page.getSize();
  const M = 40;

  const drawText = (t: string, x: number, y: number, size = 9, font: PDFFont = reg, color: RGB = text) =>
    page.drawText(t, { x, y, size, font, color });
  const drawWrapped = (t: string, x: number, y: number, w: number, size: number, font: PDFFont, color: RGB) => {
    const words = (t ?? "").split(/\s+/);
    let cur = "";
    const lh = size * 1.25;
    for (const word of words) {
      const trial = cur ? cur + " " + word : word;
      if (font.widthOfTextAtSize(trial, size) > w) {
        page.drawText(cur, { x, y, size, font, color });
        y -= lh; cur = word;
      } else cur = trial;
    }
    if (cur) { page.drawText(cur, { x, y, size, font, color }); y -= lh; }
    return y;
  };
  const drawMultilineWrapped = (t: string, x: number, y: number, w: number, size: number, font: PDFFont, color: RGB) => {
    const lh = size * 1.25;
    for (const ln of (t ?? "").split(/\r?\n/)) {
      if (ln.trim() === "") { y -= lh; continue; }
      y = drawWrapped(ln, x, y, w, size, font, color);
    }
    return y;
  };

  page.drawRectangle({ x: 0, y: height - 4, width, height: 4, color: brand });

  let cursorY = height - 30;
  if (logoImg) {
    const scale = Math.min(1, 60 / logoImg.height);
    page.drawImage(logoImg, { x: M, y: cursorY - logoImg.height * scale, width: logoImg.width * scale, height: logoImg.height * scale });
  } else {
    drawText(settings?.company_name || tenant?.name || "Sloppy Kisses", M, cursorY - 16, 16, bold, brand);
  }

  const titleText = "CREDIT NOTE";
  const tw = bold.widthOfTextAtSize(titleText, 20);
  drawText(titleText, width - M - tw, cursorY - 4, 20, bold, text);
  const cnLabel = `# ${cn.credit_note_number}`;
  const iw = reg.widthOfTextAtSize(cnLabel, 11);
  drawText(cnLabel, width - M - iw, cursorY - 22, 11, reg, muted);
  if (sourceInv) {
    const ref = `Against invoice ${sourceInv.invoice_number}`;
    const rw = reg.widthOfTextAtSize(ref, 9);
    drawText(ref, width - M - rw, cursorY - 36, 9, reg, muted);
  }

  cursorY -= 80;

  const colW = (width - 2 * M - 20) / 2;
  const boxTop = cursorY;
  const boxH = 110;

  page.drawRectangle({ x: M, y: boxTop - boxH, width: colW, height: boxH, borderColor: line, borderWidth: 0.8, color: brandSoft, opacity: 0.4 });
  drawText("FROM", M + 10, boxTop - 15, 8, bold, muted);
  let y1 = boxTop - 30;
  drawText(settings?.company_name || tenant?.name || "—", M + 10, y1, 11, bold); y1 -= 14;
  if (settings?.vat_number) { drawText(`VAT ${settings.vat_number}`, M + 10, y1, 9, reg, muted); y1 -= 12; }
  if (settings?.address) y1 = drawWrapped(settings.address, M + 10, y1, colW - 20, 9, reg, text) - 2;
  if (tenant?.contact_email) { drawText(tenant.contact_email, M + 10, y1, 9, reg, text); y1 -= 12; }
  if (tenant?.contact_phone) { drawText(tenant.contact_phone, M + 10, y1, 9, reg, text); }

  const x2 = M + colW + 20;
  page.drawRectangle({ x: x2, y: boxTop - boxH, width: colW, height: boxH, borderColor: line, borderWidth: 0.8 });
  drawText("CREDIT TO", x2 + 10, boxTop - 15, 8, bold, muted);
  let y2 = boxTop - 30;
  drawText(customer?.full_name || "—", x2 + 10, y2, 11, bold); y2 -= 14;
  if (customer?.customer_number) { drawText(customer.customer_number, x2 + 10, y2, 9, reg, muted); y2 -= 12; }
  const addr = [customer?.address_line_1, customer?.address_line_2, customer?.suburb,
    [customer?.city, customer?.postcode].filter(Boolean).join(" ").trim(), customer?.province]
    .filter((s) => s && String(s).trim().length > 0).join(", ");
  if (addr) y2 = drawWrapped(addr, x2 + 10, y2, colW - 20, 9, reg, text) - 2;
  if (customer?.email) { drawText(customer.email, x2 + 10, y2, 9, reg, text); y2 -= 12; }
  const phone = customer?.mobile || customer?.phone_alt;
  if (phone) drawText(phone, x2 + 10, y2, 9, reg, text);

  cursorY = boxTop - boxH - 18;

  const stripH = 34;
  page.drawRectangle({ x: M, y: cursorY - stripH, width: width - 2 * M, height: stripH, color: brand, opacity: 0.08, borderColor: line, borderWidth: 0.6 });
  const stripW = (width - 2 * M) / 4;
  const stripLabels: Array<[string, string]> = [
    ["CREDIT NOTE #", cn.credit_note_number],
    ["ISSUED", fmtDate(cn.issue_date)],
    ["AGAINST", sourceInv?.invoice_number ?? "—"],
    ["STATUS", (cn.status || "").toUpperCase()],
  ];
  stripLabels.forEach(([label, val], i) => {
    const x = M + i * stripW + 10;
    drawText(label, x, cursorY - 12, 7, bold, muted);
    drawText(val, x, cursorY - 25, 10, bold, text);
  });
  cursorY -= stripH + 18;

  const cols = [
    { label: "DESCRIPTION", w: 300, align: "left" as const },
    { label: "QTY", w: 45, align: "right" as const },
    { label: "UNIT", w: 80, align: "right" as const },
    { label: "TOTAL", w: width - 2 * M - 300 - 45 - 80, align: "right" as const },
  ];
  const headerH = 22;
  page.drawRectangle({ x: M, y: cursorY - headerH, width: width - 2 * M, height: headerH, color: brand });
  let cx = M;
  cols.forEach((c) => {
    const tx = c.align === "right" ? cx + c.w - bold.widthOfTextAtSize(c.label, 8) - 8 : cx + 8;
    drawText(c.label, tx, cursorY - 15, 8, bold, rgb(1, 1, 1));
    cx += c.w;
  });
  cursorY -= headerH;

  const rowH = 20;
  for (const it of (items ?? [])) {
    if (cursorY - rowH < 200) break;
    page.drawLine({ start: { x: M, y: cursorY }, end: { x: width - M, y: cursorY }, thickness: 0.4, color: line });
    let x = M;
    const cells = [it.description || "", String(it.quantity), fmtZar(Number(it.unit_price)), fmtZar(Number(it.line_total))];
    cols.forEach((c, i) => {
      const val = cells[i];
      const tx = c.align === "right" ? x + c.w - reg.widthOfTextAtSize(val, 9) - 8 : x + 8;
      drawText(val.slice(0, 80), tx, cursorY - 14, 9, reg, text);
      x += c.w;
    });
    cursorY -= rowH;
  }
  page.drawLine({ start: { x: M, y: cursorY }, end: { x: width - M, y: cursorY }, thickness: 0.4, color: line });

  cursorY -= 20;

  const totalsW = 220;
  const totalsX = width - M - totalsW;
  const rows: Array<[string, string, boolean]> = [
    ["Subtotal", fmtZar(Number(cn.subtotal)), false],
    ["Total credit", fmtZar(Number(cn.total)), true],
    ["Applied", fmtZar(Number(cn.amount_applied)), false],
    ["Available", fmtZar(Number(cn.balance)), true],
  ];
  let ty = cursorY;
  for (const [label, val, emph] of rows) {
    const f = emph ? bold : reg;
    const size = emph ? 11 : 10;
    if (emph) page.drawRectangle({ x: totalsX, y: ty - 18, width: totalsW, height: 18, color: brand, opacity: 0.1 });
    drawText(label, totalsX + 10, ty - 13, size, f, text);
    const vw = f.widthOfTextAtSize(val, size);
    drawText(val, totalsX + totalsW - vw - 10, ty - 13, size, f, text);
    ty -= 20;
  }
  cursorY = ty - 18;

  if (cn.reason || cn.notes || settings?.footer_notes) {
    const combined = [cn.reason ? `Reason: ${cn.reason}` : null, cn.notes, settings?.footer_notes].filter(Boolean).join("\n\n");
    drawText("NOTES", M, cursorY, 8, bold, muted);
    drawMultilineWrapped(combined, M, cursorY - 14, width - 2 * M, 9, reg, muted);
  }

  const bytes = await pdf.save();
  return new Response(bytes, {
    status: 200,
    headers: { ...cors, "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${cn.credit_note_number}.pdf"` },
  });
});