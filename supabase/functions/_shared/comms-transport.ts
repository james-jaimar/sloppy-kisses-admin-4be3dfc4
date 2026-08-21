// Shared: load tenant SMTP transport, render a branded HTML wrapper,
// send an email. Used by send-notifications, notify-test-send, and
// (optionally) send-invoice-reminders.

import { type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { guardSend } from "./send-guard.ts";
import { sanitizeEmailHtml, styleBodyHtml, wrapHtmlLines } from "./html-email.ts";
import { publicBrandLogoUrl } from "./public-brand-logo.ts";


export interface Transport {
  smtp_host: string;
  smtp_port: number;
  smtp_secure: string;
  smtp_username: string;
  smtp_password: string;
  from_name: string | null;
  from_email: string;
  reply_to: string | null;
}

export interface TenantBrand {
  id: string;
  name: string;
  primary_colour: string | null;
  logo_url: string | null;
  app_url?: string | null;
}

const transportCache = new Map<string, Transport | null>();
const brandCache = new Map<string, TenantBrand | null>();

export async function loadTransport(sb: SupabaseClient, tenantId: string): Promise<Transport | null> {
  if (transportCache.has(tenantId)) return transportCache.get(tenantId)!;
  const { data } = await sb
    .from("email_transport_settings")
    .select("smtp_host,smtp_port,smtp_secure,smtp_username,smtp_password,from_name,from_email,reply_to")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const t = (data && data.smtp_host && data.smtp_password && data.from_email ? data : null) as Transport | null;
  transportCache.set(tenantId, t);
  return t;
}

export async function loadTenantBrand(sb: SupabaseClient, tenantId: string): Promise<TenantBrand | null> {
  if (brandCache.has(tenantId)) return brandCache.get(tenantId)!;
  const { data } = await sb
    .from("tenants")
    .select("id,name,primary_colour,logo_url,app_url")
    .eq("id", tenantId)
    .maybeSingle();
  const brand = (data ?? null) as TenantBrand | null;
  if (brand) {
    brand.logo_url = publicBrandLogoUrl(
      Deno.env.get("SUPABASE_URL") ?? "",
      brand.id,
      brand.logo_url,
      brand.app_url ?? null,
    );
  }
  brandCache.set(tenantId, brand);
  return brand;
}

export function renderBrandedHtml(
  brand: TenantBrand | null,
  tenantName: string,
  bodyText: string,
  opts?: { isHtml?: boolean; heading?: string | null; preheader?: string | null },
): string {
  const primary = brand?.primary_colour ?? "#F26D6D";
  const name = brand?.name ?? tenantName;
  const appUrl = (brand?.app_url ?? "").replace(/\/+$/, "");
  const logo = brand?.logo_url
    ? `<img src="${brand.logo_url}" alt="${escapeHtml(name)}" width="150" style="max-width:150px;height:auto;display:block;margin:0 auto 8px;border:0;" />`
    : "";
  const bodyHtml = opts?.isHtml
    ? styleBodyHtml(sanitizeEmailHtml(bodyText), "#1f2028", 15)
    : escapeHtml(bodyText).replace(/\n/g, "<br/>");
  const heading = opts?.heading
    ? `<h1 style="margin:0 0 20px;font-size:22px;line-height:1.3;color:#1f2028;">${escapeHtml(opts.heading)}</h1>`
    : "";
  const preheader = opts?.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(opts.preheader)}</div>`
    : "";
  const html = `<!doctype html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="x-apple-disable-message-reformatting"/>
<!--[if mso]><style>body,table,td,div,p,a,li{font-family:Arial,Helvetica,sans-serif !important}</style><![endif]-->
<style>body,table,td,div,p,a,li{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}table{border-collapse:collapse}</style>
</head><body style="margin:0;padding:0;background:#f6f6f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.6;color:#1f2028;word-break:break-word;">
  ${preheader}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f7;padding:40px 12px;"><tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;max-width:560px;">
      <tr><td align="center" style="background:${primary};padding:28px 32px;">
        ${logo}
        <div style="font-size:18px;font-weight:700;color:#ffffff;letter-spacing:.2px;">${escapeHtml(name)}</div>
      </td></tr>
      <tr><td style="padding:36px 40px 40px;">
        ${heading}
        <div style="font-size:15px;line-height:1.6;color:#1f2028;">${bodyHtml}</div>
        <hr style="border:none;border-top:1px solid #eceef1;margin:32px 0 20px;" />
        <p style="font-size:12px;color:#8a8d97;margin:0;">Sent by ${escapeHtml(name)}${
    appUrl ? ` · <a href="${appUrl}" style="color:${primary};text-decoration:none;">${escapeHtml(appUrl.replace(/^https?:\/\//, ""))}</a>` : ""
  }.</p>
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
  return wrapHtmlLines(html);
}


/**
 * Context required by the global outbound send lock. Mandatory — every send
 * must declare which tenant it belongs to so the lock can be evaluated.
 */
export interface SendContext {
  admin: SupabaseClient;
  tenantId: string;
  templateCode?: string | null;
  customerId?: string | null;
  invoiceId?: string | null;
  bookingId?: string | null;
}

export interface MailAttachment {
  filename: string;
  content: Uint8Array;
  contentType: string;
  encoding: "binary";
  contentID?: string;
}

export async function sendMail(
  t: Transport,
  to: string,
  subject: string,
  text: string,
  html: string,
  ctx: SendContext,
  attachments?: MailAttachment[],
): Promise<{ ok: true } | { ok: false; error: string; blocked?: boolean }> {
  // GLOBAL SEND LOCK — nothing reaches SMTP without passing this.
  const gate = await guardSend(ctx.admin, {
    tenantId: ctx.tenantId,
    recipient: to,
    subject,
    templateCode: ctx.templateCode ?? null,
    customerId: ctx.customerId ?? null,
    invoiceId: ctx.invoiceId ?? null,
    bookingId: ctx.bookingId ?? null,
  });
  if (!gate.allowed) {
    return { ok: false, error: gate.reason ?? "Outbound email is locked", blocked: true };
  }

  const client = new SMTPClient({
    connection: {
      hostname: t.smtp_host,
      port: t.smtp_port,
      tls: t.smtp_secure === "ssl",
      auth: { username: t.smtp_username, password: t.smtp_password },
    },
  });
  try {
    await client.send({
      from: t.from_name ? `${t.from_name} <${t.from_email}>` : t.from_email,
      to,
      replyTo: t.reply_to ?? undefined,
      subject,
      content: text,
      html,
      attachments,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  } finally {
    try { await client.close(); } catch { /* ignore */ }
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}