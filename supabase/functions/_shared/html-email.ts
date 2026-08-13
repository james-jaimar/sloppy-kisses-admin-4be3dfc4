// Helpers shared by every outbound HTML email.
//
// The most important one is `wrapHtmlLines`: SMTP forbids lines longer than
// 998 characters, and a mail server that hard-breaks an over-long line lands
// the break inside a tag or a style attribute — which is what produced the
// stray gaps and the giant paragraph in the hotel quote email.

/** Break a rendered HTML document into short lines at safe tag boundaries. */
export function wrapHtmlLines(html: string, max = 480): string {
  const out: string[] = [];
  for (const line of String(html ?? "").split("\n")) {
    if (line.length <= max) { out.push(line.replace(/[ \t]+$/, "")); continue; }
    // Split between tags only ("><"), never inside one.
    const chunks = line.split(/(?<=>)(?=<)/);
    let buf = "";
    for (const c of chunks) {
      if (buf && buf.length + c.length > max) { out.push(buf); buf = ""; }
      buf += c;
    }
    if (buf) out.push(buf);
  }
  return out.join("\n");
}

const ALLOWED_TAGS = new Set([
  "p", "br", "strong", "b", "em", "i", "u", "s", "a", "ul", "ol", "li",
  "h1", "h2", "h3", "h4", "blockquote", "hr", "span", "div",
]);

/**
 * Allowlist sanitiser for template bodies authored in the rich-text editor.
 * Drops anything that is not a safe formatting tag, and keeps only `href`
 * (http/https/mailto) plus a couple of harmless text-align styles.
 */
export function sanitizeEmailHtml(input: string): string {
  let html = String(input ?? "");
  html = html.replace(/<!--[\s\S]*?-->/g, "");
  html = html.replace(/<\s*(script|style|iframe|object|embed|link|meta)[\s\S]*?<\s*\/\s*\1\s*>/gi, "");
  html = html.replace(/<\s*(script|style|iframe|object|embed|link|meta)\b[^>]*>/gi, "");

  return html.replace(/<\/?([a-zA-Z0-9]+)([^>]*)>/g, (full, rawName: string, attrs: string) => {
    const name = rawName.toLowerCase();
    if (!ALLOWED_TAGS.has(name)) return "";
    if (full.startsWith("</")) return `</${name}>`;
    let kept = "";
    if (name === "a") {
      const href = /href\s*=\s*("([^"]*)"|'([^']*)')/i.exec(attrs);
      const url = (href?.[2] ?? href?.[3] ?? "").trim();
      if (/^(https?:|mailto:)/i.test(url)) {
        kept += ` href="${url.replace(/"/g, "&quot;")}" target="_blank" rel="noopener"`;
      }
    }
    const align = /text-align\s*:\s*(left|right|center|justify)/i.exec(attrs);
    if (align) kept += ` style="text-align:${align[1].toLowerCase()}"`;
    const selfClosing = name === "br" || name === "hr";
    return `<${name}${kept}${selfClosing ? "/" : ""}>`;
  });
}

/** Best-effort plain-text alternative for an HTML body. */
export function htmlToText(input: string): string {
  return String(input ?? "")
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*\/\s*(p|div|h[1-4]|li|blockquote)\s*>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n").map((l) => l.trimEnd()).join("\n")
    .trim();
}

/** Does this template body look like rich HTML rather than plain text? */
export function looksLikeHtml(s: string): boolean {
  return /<(p|div|ul|ol|li|h[1-4]|strong|em|a|br)\b[^>]*>/i.test(String(s ?? ""));
}

/** Wrap sanitised body HTML so every element carries an explicit email-safe style. */
export function styleBodyHtml(html: string, colour = "#3f3f46", size = 15): string {
  return String(html ?? "")
    .replace(/<p(\s|>)/gi, `<p style="margin:0 0 14px;font-size:${size}px;line-height:1.65;color:${colour}"$1`)
    .replace(/<li(\s|>)/gi, `<li style="font-size:${size - 1}px;line-height:1.6;color:${colour};margin-bottom:6px"$1`)
    .replace(/<ul(\s|>)/gi, `<ul style="margin:0 0 14px;padding-left:20px"$1`)
    .replace(/<ol(\s|>)/gi, `<ol style="margin:0 0 14px;padding-left:20px"$1`)
    .replace(/<h1(\s|>)/gi, `<h1 style="margin:18px 0 10px;font-size:${size + 7}px;line-height:1.3;color:#18181b"$1`)
    .replace(/<h2(\s|>)/gi, `<h2 style="margin:18px 0 10px;font-size:${size + 4}px;line-height:1.3;color:#18181b"$1`)
    .replace(/<h3(\s|>)/gi, `<h3 style="margin:16px 0 8px;font-size:${size + 2}px;line-height:1.35;color:#18181b"$1`)
    .replace(/<h4(\s|>)/gi, `<h4 style="margin:16px 0 8px;font-size:${size}px;line-height:1.35;color:#18181b"$1`)
    .replace(/<blockquote(\s|>)/gi, `<blockquote style="margin:0 0 14px;padding:8px 14px;border-left:3px solid #e4e4e7;color:#52525b;font-size:${size}px;line-height:1.6"$1`)
    .replace(/<hr(\s|\/|>)/gi, `<hr style="border:none;border-top:1px solid #ececf1;margin:18px 0"$1`);
}