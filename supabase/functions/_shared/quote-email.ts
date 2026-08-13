// Marketing-quality HTML email for a hotel quote.
//
// The wording of the intro comes from the tenant's `quote_sent` message
// template when one exists (Settings -> Message templates), so the owner can
// change the copy without a developer. Everything below the intro — the stay
// card, the arrival windows, the packing list, the accommodation areas — is
// rendered here so the layout always stays on brand.

import { htmlToText, looksLikeHtml, sanitizeEmailHtml, styleBodyHtml, wrapHtmlLines } from "./html-email.ts";
import { DEFAULT_QUOTE_EMAIL_SETTINGS, type QuoteEmailSettings } from "./quote-email-defaults.ts";

export interface QuoteEmailInput {
  tenantName: string;
  brandColour: string;
  logoUrl?: string | null;
  appUrl?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  customerFirstName: string;
  quoteNumber: string;
  startAt?: string | null;
  endAt?: string | null;
  nights?: number | null;
  accommodationType?: string | null;
  petNames: string[];
  checkInWindow?: string | null;
  checkOutWindow?: string | null;
  total: number;
  deposit: number;
  validUntil?: string | null;
  /** Public quote link token — powers the "Accept this quote" button. */
  publicToken?: string | null;
  /** Rendered intro copy (plain text, blank-line separated paragraphs). */
  intro: string;
  /** Tenant hotel guidelines markdown, appended as a plain-text section. */
  guidelines?: string | null;
  /**
   * Tenant-editable copy for the rest of the email (hero, labels, info cards,
   * sign-off). Already token-rendered by the caller. Falls back to defaults.
   */
  settings?: QuoteEmailSettings | null;
}

export const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export const fmtZar = (n: number) =>
  "R " + (Number.isFinite(n) ? n : 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Default intro copy, used when the tenant has no `quote_sent` template. */
export const DEFAULT_QUOTE_INTRO =
  "Hi {{customer.first_name}},\n\n" +
  "Thank you for thinking of us for {{pet.names}}. Your quote {{quote.number}} for {{quote.dates}} is attached, " +
  "and we have pencilled the dates in for you until {{quote.valid_until}}.\n\n" +
  "A 50% deposit secures the booking and the balance is settled before arrival. " +
  "Everything you need to know before the stay is below — if it is your first time with us, this is the short version of our accommodation form.";

function paragraphs(text: string): string {
  // The intro can come from a rich-text template — keep it as HTML in that case.
  if (looksLikeHtml(text)) return styleBodyHtml(sanitizeEmailHtml(text));
  return String(text ?? "")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#3f3f46">${esc(p).replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

/** Minimal, safe markdown -> HTML for the tenant's house guidelines. */
function markdown(src: string, brand: string): string {
  const inline = (s: string) =>
    esc(s)
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, `<a href="$2" style="color:${brand}">$1</a>`)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");

  const out: string[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) {
      out.push(
        `<ul style="margin:0 0 12px;padding-left:18px">${list
          .map((li) => `<li style="font-size:14px;line-height:1.6;color:#52525b;margin-bottom:5px">${li}</li>`)
          .join("")}</ul>`,
      );
      list = [];
    }
  };

  for (const raw of String(src ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      flush();
      const size = h[1].length <= 2 ? 15 : 14;
      out.push(
        `<div style="font-size:${size}px;font-weight:700;color:#18181b;margin:14px 0 8px">${inline(h[2])}</div>`,
      );
      continue;
    }
    const li = /^[-*•]\s+(.*)$/.exec(line) ?? /^\d+[.)]\s+(.*)$/.exec(line);
    if (li) { list.push(inline(li[1])); continue; }
    flush();
    out.push(`<p style="margin:0 0 10px;font-size:14px;line-height:1.65;color:#52525b">${inline(line)}</p>`);
  }
  flush();
  // One block per line keeps the encoded message well under the 998-char
  // SMTP line limit, so no mail server can break a tag in half.
  return out.join("\n");
}

/** Strip markdown syntax for the plain-text part. */
function stripMarkdown(src: string): string {
  return String(src ?? "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1 ($2)")
    .replace(/^[*]\s+/gm, "- ");
}

/** Info card whose body is tenant-authored rich text (sanitised + styled). */
function richCard(brand: string, title: string, bodyHtml: string): string {
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #ececf1;border-radius:14px;margin:0 0 14px;background:#ffffff">
    <tr><td style="padding:18px 20px">
      <div style="font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${brand};margin-bottom:10px">${esc(title)}</div>
      <div>${styleBodyHtml(sanitizeEmailHtml(bodyHtml), "#3f3f46", 14)}</div>
    </td></tr>
  </table>`;
}

export function buildQuoteEmail(i: QuoteEmailInput): { html: string; text: string } {
  const brand = /^#[0-9a-f]{6}$/i.test(i.brandColour ?? "") ? i.brandColour : "#FF5A5A";
  const s: QuoteEmailSettings = i.settings ?? DEFAULT_QUOTE_EMAIL_SETTINGS;
  const cards = (s.cards ?? []).filter((c) => c && c.enabled !== false && (c.title || c.body_html));
  const stayLine = i.startAt
    ? `${fmtDate(i.startAt)} – ${fmtDate(i.endAt)}${i.nights ? ` · ${i.nights} night${i.nights === 1 ? "" : "s"}` : ""}`
    : "—";
  const pets = i.petNames.length ? i.petNames.join(", ") : "your dog";
  const ctaUrl = (i.appUrl ?? "").replace(/\/+$/, "");

  const facts: Array<[string, string]> = [
    ["Guests", pets],
    ["Dates", stayLine],
  ];
  if (i.accommodationType) facts.push(["Accommodation", i.accommodationType]);
  if (i.checkInWindow) facts.push(["Arrival", i.checkInWindow]);
  if (i.checkOutWindow) facts.push(["Collection", i.checkOutWindow]);

  const factRows = facts.map(([k, v]) => `
    <tr>
      <td style="padding:7px 0;font-size:13px;color:#71717a;width:38%">${esc(k)}</td>
      <td style="padding:7px 0;font-size:14px;color:#18181b;font-weight:600">${esc(v)}</td>
    </tr>`).join("");

  const guidelinesBlock = i.guidelines?.trim() && s.show_guidelines !== false
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #ececf1;border-radius:14px;margin:0 0 14px;background:#fafafa">
         <tr><td style="padding:18px 20px">
           <div style="font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${brand};margin-bottom:10px">House guidelines</div>
           <div>${markdown(i.guidelines.trim(), brand)}</div>
         </td></tr>
       </table>`
    : "";

  const htmlRaw = `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="x-apple-disable-message-reformatting"/>
<!--[if mso]><style>body,table,td,div,p,a,li{font-family:Arial,Helvetica,sans-serif !important}</style><![endif]-->
<style>
  body,table,td,div,p,a,li{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
  table{border-collapse:collapse}
  img{border:0;outline:none;text-decoration:none}
  .sk-body{word-break:break-word}
</style>
<title>${esc(i.quoteNumber)}</title></head>
<body class="sk-body" style="margin:0;padding:0;background:#f4f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#3f3f46">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">Your quote ${esc(i.quoteNumber)} for ${esc(pets)} — ${esc(stayLine)}.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f6;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">

        <!-- Hero -->
        <tr><td style="background:${brand};border-radius:18px 18px 0 0;padding:28px 28px 26px;text-align:center">
          ${i.logoUrl
            ? `<img src="${esc(i.logoUrl)}" alt="${esc(i.tenantName)}" width="150" style="max-width:150px;height:auto;margin:0 auto 12px;display:block"/>`
            : `<div style="font-size:20px;font-weight:800;color:#ffffff;margin-bottom:10px">${esc(i.tenantName)}</div>`}
          <div style="font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,.85);font-weight:700">${esc(s.hero_label)}</div>
          <div style="font-size:27px;line-height:1.25;font-weight:800;color:#ffffff;margin-top:8px">${esc(s.hero_headline)}</div>
        </td></tr>

        <!-- Intro -->
        <tr><td style="background:#ffffff;padding:26px 28px 6px">
          ${paragraphs(i.intro)}
        </td></tr>

        <!-- Stay card -->
        <tr><td style="background:#ffffff;padding:6px 28px 4px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #ececf1;border-radius:16px;overflow:hidden">
            <tr><td style="padding:20px 22px 6px">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${factRows}</table>
            </td></tr>
            <tr><td style="padding:14px 22px 20px">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #ececf1">
                <tr>
                  <td style="padding:14px 0 0;width:50%">
                    <div style="font-size:12px;color:#71717a">${esc(s.total_label)}</div>
                    <div style="font-size:22px;font-weight:800;color:#18181b">${esc(fmtZar(i.total))}</div>
                  </td>
                  <td style="padding:14px 0 0;width:50%">
                    <div style="font-size:12px;color:#71717a">${esc(s.deposit_label)}</div>
                    <div style="font-size:22px;font-weight:800;color:${brand}">${esc(fmtZar(i.deposit))}</div>
                  </td>
                </tr>
              </table>
            </td></tr>
          </table>
          ${i.validUntil && s.hold_line?.trim()
            ? `<div style="text-align:center;font-size:13px;color:#71717a;margin:14px 0 4px">${esc(s.hold_line)}</div>`
            : ""}
          ${ctaUrl
            ? `<div style="text-align:center;margin:16px 0 6px">
                 <a href="${esc(ctaUrl)}${i.publicToken ? `/q/${esc(i.publicToken)}` : "/portal"}" style="display:inline-block;background:${brand};color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:13px 30px;border-radius:999px">${esc(s.cta_label)}</a>
                 ${s.cta_subtext?.trim() ? `<div style="font-size:12px;color:#a1a1aa;margin-top:9px">${esc(s.cta_subtext)}</div>` : ""}
               </div>`
            : ""}
        </td></tr>

        <!-- Divider -->
        <tr><td style="background:#ffffff;padding:18px 28px 0">
          <div style="border-top:1px solid #ececf1"></div>
          <div style="font-size:17px;font-weight:800;color:#18181b;margin:18px 0 14px">${esc(s.section_heading)}</div>
        </td></tr>

        <!-- Info cards -->
        <tr><td style="background:#ffffff;padding:0 28px">
          ${cards.map((c) => richCard(brand, c.title ?? "", c.body_html ?? "")).join("\n")}
          ${guidelinesBlock}
        </td></tr>

        <!-- Sign-off -->
        <tr><td style="background:#ffffff;padding:6px 28px 26px;border-radius:0 0 0 0">
          ${styleBodyHtml(sanitizeEmailHtml(s.signoff_html ?? ""))}
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#18181b;border-radius:0 0 18px 18px;padding:20px 28px;text-align:center">
          <div style="font-size:13px;color:#e4e4e7;font-weight:700">${esc(i.tenantName)}</div>
          <div style="font-size:12px;color:#a1a1aa;margin-top:6px">
            ${i.contactPhone ? esc(i.contactPhone) : ""}${i.contactPhone && i.contactEmail ? " &nbsp;·&nbsp; " : ""}${i.contactEmail ? esc(i.contactEmail) : ""}
          </div>
          <div style="font-size:11px;color:#71717a;margin-top:10px">Quote ${esc(i.quoteNumber)} · valid until ${esc(fmtDate(i.validUntil))}</div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`;

  // Quoted-printable turns whitespace-only line endings into literal "=20" in
  // some clients — strip trailing spaces and blank-only lines before sending.
  const html = htmlRaw
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/, ""))
    .filter((l, idx, arr) => !(l === "" && arr[idx - 1] === ""))
    .join("\n");
  const wrapped = wrapHtmlLines(html);

  const text = [
    looksLikeHtml(i.intro) ? htmlToText(i.intro) : i.intro,
    "",
    `Guests: ${pets}`,
    `Dates: ${stayLine}`,
    i.accommodationType ? `Accommodation: ${i.accommodationType}` : "",
    i.checkInWindow ? `Arrival: ${i.checkInWindow}` : "",
    i.checkOutWindow ? `Collection: ${i.checkOutWindow}` : "",
    `Total: ${fmtZar(i.total)}  |  50% deposit to secure: ${fmtZar(i.deposit)}`,
    i.validUntil ? `Dates held until ${fmtDate(i.validUntil)}.` : "",
    "",
    "ARRIVAL & COLLECTION",
    "- Arrivals Mon-Sat 09:00-11:00 (no arrivals Sundays or public holidays)",
    "- Collection 09:00-09:30 daily; Stay & Play collection 16:00-16:30",
    "- Closed for drop-offs/collections 25 & 26 December and 1 January",
    "",
    "BEFORE YOU ARRIVE",
    "- Sterilised, fully vaccinated and dewormed; Kennel Cough at least 10 days prior",
    "- Vaccination card required at check-in",
    "- Dogs must be social; collar with name tag and contact number",
    "",
    "WHAT TO PACK",
    "- Food in labelled ziplock bags with name and breed",
    "- Written feeding and medication instructions",
    "- No beds, bowls or pillows needed",
    "",
    "GOOD TO KNOW",
    "- 50% off grooming when booked with the stay",
    "- Daily photos on Facebook; emergencies communicated directly",
    "- Hotel viewings Mon-Fri 10:00-13:00",
    ctaUrl && i.publicToken ? `\nAccept this quote: ${ctaUrl}/q/${i.publicToken}` : "",
    i.guidelines?.trim() ? "\nHOUSE GUIDELINES\n" + stripMarkdown(i.guidelines.trim()) : "",
    "",
    `${i.tenantName}`,
    [i.contactPhone, i.contactEmail].filter(Boolean).join(" | "),
  ].filter((l) => l !== "").join("\n");

  return { html: wrapped, text };
}