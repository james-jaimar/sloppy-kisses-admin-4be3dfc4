// Shared branded-document primitives for the PDF generators (invoice, quote,
// credit note). Keeps layout and font handling in one place so the documents
// stay visually identical.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "https://esm.sh/pdf-lib@1.17.1";
import fontkit from "https://esm.sh/@pdf-lib/fontkit@1.1.1";

const FONT_REG_URL = "https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io@main/fonts/NotoSans/hinted/ttf/NotoSans-Regular.ttf";
const FONT_BOLD_URL = "https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io@main/fonts/NotoSans/hinted/ttf/NotoSans-Bold.ttf";
let _reg: Uint8Array | null = null;
let _bold: Uint8Array | null = null;

async function fetchFont(url: string): Promise<Uint8Array | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return new Uint8Array(await r.arrayBuffer());
  } catch { return null; }
}

/** Embed Noto Sans (full Unicode) with a Helvetica fallback if the CDN is down. */
export async function embedFonts(pdf: PDFDocument): Promise<{ reg: PDFFont; bold: PDFFont; unicode: boolean }> {
  pdf.registerFontkit(fontkit);
  if (!_reg) _reg = await fetchFont(FONT_REG_URL);
  if (!_bold) _bold = await fetchFont(FONT_BOLD_URL);
  if (_reg && _bold) {
    return {
      reg: await pdf.embedFont(_reg, { subset: true }),
      bold: await pdf.embedFont(_bold, { subset: true }),
      unicode: true,
    };
  }
  return {
    reg: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    unicode: false,
  };
}

const SAFE_MAP: Record<string, string> = {
  "\u2192": "to", "\u2190": "to", "\u21d2": "to",
  "\u2018": "'", "\u2019": "'", "\u201c": '"', "\u201d": '"',
  "\u2013": "-", "\u2014": "-", "\u2026": "...", "\u00a0": " ",
  "\u2022": "-", "\u2713": "y", "\u2717": "x", "\u00b7": "-",
};

/**
 * Make a string safe to draw. With the Unicode font embedded only the mapped
 * lookalikes are normalised; on the Helvetica fallback anything outside
 * WinAnsi is dropped so a stray glyph can never kill the whole document.
 */
export function makeSafe(unicode: boolean) {
  return (v: unknown): string => {
    let s = String(v ?? "");
    for (const [k, r] of Object.entries(SAFE_MAP)) s = s.split(k).join(r);
    if (!unicode) s = s.replace(/[^\x20-\x7E\xA0-\xFF]/g, "");
    return s;
  };
}

export function hexToRgb(hex?: string | null): RGB {
  const fallback = rgb(1.0, 0.35, 0.35);
  if (!hex) return fallback;
  const m = hex.replace("#", "").match(/^([\da-f]{6})$/i);
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

export function tint(c: RGB, t: number): RGB {
  return rgb(c.red + (1 - c.red) * t, c.green + (1 - c.green) * t, c.blue + (1 - c.blue) * t);
}

export const PALETTE = {
  text: rgb(0.1, 0.1, 0.15),
  muted: rgb(0.45, 0.45, 0.5),
  line: rgb(0.85, 0.85, 0.87),
  white: rgb(1, 1, 1),
};

export const fmtZar = (n: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", minimumFractionDigits: 2 })
    .format(Number.isFinite(n) ? n : 0);

export const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" }) : "-";

/** Wrap `t` into `w` points, returning the y position after the last line. */
export function wrapText(
  page: PDFPage, t: string, x: number, y: number, w: number,
  size: number, font: PDFFont, color: RGB,
): number {
  const words = (t ?? "").split(/\s+/).filter(Boolean);
  let cur = "";
  const lh = size * 1.3;
  for (const word of words) {
    const trial = cur ? cur + " " + word : word;
    if (font.widthOfTextAtSize(trial, size) > w) {
      page.drawText(cur, { x, y, size, font, color });
      y -= lh;
      cur = word;
    } else cur = trial;
  }
  if (cur) { page.drawText(cur, { x, y, size, font, color }); y -= lh; }
  return y;
}

/** Wrap while honouring hard line breaks from user-entered fields. */
export function wrapMultiline(
  page: PDFPage, t: string, x: number, y: number, w: number,
  size: number, font: PDFFont, color: RGB,
): number {
  const lh = size * 1.3;
  for (const ln of (t ?? "").split(/\r?\n/)) {
    if (ln.trim() === "") { y -= lh; continue; }
    y = wrapText(page, ln, x, y, w, size, font, color);
  }
  return y;
}

/** Fetch + embed a tenant logo from the `tenant-branding` bucket. Best effort. */
export async function embedTenantLogo(pdf: PDFDocument, admin: any, logoPath?: string | null) {
  if (!logoPath) return null;
  try {
    const { data: signed } = await admin.storage.from("tenant-branding").createSignedUrl(logoPath, 60);
    if (!signed?.signedUrl) return null;
    const r = await fetch(signed.signedUrl);
    if (!r.ok) return null;
    const bytes = new Uint8Array(await r.arrayBuffer());
    const ct = r.headers.get("content-type") || "";
    try {
      return ct.includes("jpeg") || ct.includes("jpg") ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes);
    } catch { return null; }
  } catch { return null; }
}