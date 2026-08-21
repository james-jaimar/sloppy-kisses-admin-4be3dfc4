// Shared helper: render + send a Sloppy Kisses branded auth email
// via the tenant's SMTP settings, and log it to public.email_log.
// Used by invite-user and request-password-reset.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { guardSend } from "./send-guard.ts";
import { publicBrandLogoUrl } from "./public-brand-logo.ts";

export type AuthEmailAction = "invite" | "recovery" | "magiclink";

interface Transport {
  smtp_host: string;
  smtp_port: number;
  smtp_secure: string;
  smtp_username: string;
  smtp_password: string;
  from_name: string | null;
  from_email: string;
  reply_to: string | null;
}

interface TenantBrand {
  id: string;
  name: string;
  primary_colour: string | null;
  logo_url: string | null;
  app_url: string | null;
}

export interface SendAuthEmailArgs {
  admin: SupabaseClient;
  tenantId: string;
  action: AuthEmailAction;
  recipient: string;
  actionUrl: string;
  inviterName?: string | null;
}

export async function sendAuthEmail(args: SendAuthEmailArgs): Promise<{ ok: true } | { ok: false; error: string }> {
  const { admin, tenantId, action, recipient, actionUrl, inviterName } = args;
  try {
    const tenant = await fetchTenant(admin, tenantId);
    if (!tenant) throw new Error(`Tenant ${tenantId} not found`);
    const transport = await loadTransport(admin, tenantId);
    if (!transport) {
      throw new Error(`SMTP is not configured for ${tenant.name}. Set it up in Settings → Email Server.`);
    }
    const logoUrl = publicBrandLogoUrl(Deno.env.get("SUPABASE_URL") ?? "", tenant.id, tenant.logo_url, tenant.app_url);
    const { subject, html, text } = renderTemplate(action, {
      tenantName: tenant.name,
      primaryColour: tenant.primary_colour ?? "#F26D6D",
      logoUrl,
      actionUrl,
      inviterName: inviterName ?? null,
    });

    // GLOBAL SEND LOCK — auth mail is still mail.
    const gate = await guardSend(admin, {
      tenantId,
      recipient,
      subject,
      templateCode: `auth.${action}`,
    });
    if (!gate.allowed) {
      return { ok: false, error: gate.reason ?? "Outbound email is locked" };
    }

    await sendMail(transport, recipient, subject, html, text);
    await logEmail(admin, tenantId, recipient, subject, "sent", null, action);
    return { ok: true };
  } catch (err) {
    const msg = (err as Error).message;
    console.error(`sendAuthEmail(${action}) failed for ${recipient}:`, msg);
    try {
      await logEmail(admin, tenantId, recipient, `AUTH EMAIL FAILED (${action})`, "failed", msg, action);
    } catch { /* swallow */ }
    return { ok: false, error: msg };
  }
}

// Generate the Supabase action link WITHOUT sending an email.
// Uses admin.generateLink so we own the email delivery ourselves.
export async function generateAuthActionUrl(
  admin: SupabaseClient,
  action: AuthEmailAction,
  email: string,
  redirectTo: string,
  data?: Record<string, unknown>,
): Promise<string> {
  const type = action === "magiclink" ? "magiclink" : action; // invite | recovery | magiclink
  const { data: link, error } = await admin.auth.admin.generateLink({
    type: type as "invite" | "recovery" | "magiclink",
    email,
    options: { redirectTo, data },
  });
  if (error) throw new Error(`generateLink(${action}) failed: ${error.message}`);
  const url = link?.properties?.action_link;
  if (!url) throw new Error(`generateLink(${action}) returned no action_link`);
  return url;
}

// Generate a tenant-hosted action URL that does NOT expose Supabase.
// Returns something like: https://<tenant-app-url>/auth/accept?token_hash=...&type=invite&next=/reset-password
export async function generateTenantActionUrl(
  admin: SupabaseClient,
  action: AuthEmailAction,
  email: string,
  appUrl: string,
  next: string,
  data?: Record<string, unknown>,
): Promise<string> {
  const type = action === "magiclink" ? "magiclink" : action;
  const { data: link, error } = await admin.auth.admin.generateLink({
    type: type as "invite" | "recovery" | "magiclink",
    email,
    // redirectTo is required by generateLink but we never use the returned action_link.
    options: { redirectTo: `${appUrl.replace(/\/+$/, "")}${next}`, data },
  });
  if (error) throw new Error(`generateLink(${action}) failed: ${error.message}`);
  const tokenHash = link?.properties?.hashed_token;
  if (!tokenHash) throw new Error(`generateLink(${action}) returned no hashed_token`);
  const base = appUrl.replace(/\/+$/, "");
  const qs = new URLSearchParams({ token_hash: tokenHash, type, next });
  return `${base}/auth/accept?${qs.toString()}`;
}

// Resolve the tenant's public app URL. Order: tenant.app_url → AUTH_EMAIL_APP_URL_FALLBACK → request origin.
export async function resolveTenantAppUrl(
  admin: SupabaseClient,
  tenantId: string,
  requestOrigin: string | null,
): Promise<string> {
  const { data } = await admin.from("tenants").select("app_url").eq("id", tenantId).maybeSingle();
  const fromTenant = (data as { app_url?: string | null } | null)?.app_url?.trim();
  if (fromTenant) return fromTenant.replace(/\/+$/, "");
  const fallback = Deno.env.get("AUTH_EMAIL_APP_URL_FALLBACK")?.trim();
  if (fallback) return fallback.replace(/\/+$/, "");
  if (requestOrigin) return requestOrigin.replace(/\/+$/, "");
  throw new Error("No app URL configured. Set your public app URL in Settings → Branding.");
}

async function fetchTenant(admin: SupabaseClient, id: string): Promise<TenantBrand | null> {
  const { data } = await admin
    .from("tenants")
    .select("id,name,primary_colour,logo_url,app_url")
    .eq("id", id)
    .maybeSingle();
  return (data as TenantBrand | null) ?? null;
}

async function loadTransport(admin: SupabaseClient, tenantId: string): Promise<Transport | null> {
  const { data } = await admin
    .from("email_transport_settings")
    .select("smtp_host,smtp_port,smtp_secure,smtp_username,smtp_password,from_name,from_email,reply_to")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!data || !data.smtp_host || !data.smtp_password || !data.from_email) return null;
  return data as Transport;
}

async function sendMail(t: Transport, to: string, subject: string, html: string, text: string) {
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
    });
  } finally {
    await client.close();
  }
}

async function logEmail(
  admin: SupabaseClient,
  tenantId: string,
  to: string,
  subject: string,
  status: "sent" | "failed",
  error: string | null,
  action: string,
) {
  try {
    await admin.from("email_log").insert({
      tenant_id: tenantId,
      to_email: to,
      subject,
      status,
      error_message: error,
      template_code: `auth.${action}`,
      sent_at: status === "sent" ? new Date().toISOString() : null,
    });
  } catch (e) {
    console.error("email_log insert failed:", (e as Error).message);
  }
}

interface RenderCtx {
  tenantName: string;
  primaryColour: string;
  logoUrl: string | null;
  actionUrl: string;
  inviterName: string | null;
}

function renderTemplate(action: AuthEmailAction, ctx: RenderCtx) {
  const copy: Record<AuthEmailAction, { subject: string; heading: string; body: string; cta: string }> = {
    invite: {
      subject: `You've been invited to ${ctx.tenantName}`,
      heading: `Welcome to ${ctx.tenantName}`,
      body: `${ctx.inviterName ? `${ctx.inviterName} has invited you` : "You've been invited"} to join <strong>${ctx.tenantName}</strong>. Click the button below to accept and set your password.<br/><br/><span style="color:#8a8d97;font-size:13px;">This link can only be used once. If it stops working, ask your admin to resend the invite.</span>`,
      cta: "Accept invitation",
    },
    recovery: {
      subject: `Reset your ${ctx.tenantName} password`,
      heading: `Reset your password`,
      body: `We received a request to reset your <strong>${ctx.tenantName}</strong> password. If this wasn't you, you can safely ignore this email.`,
      cta: "Reset password",
    },
    magiclink: {
      subject: `Your ${ctx.tenantName} sign-in link`,
      heading: `Sign in to ${ctx.tenantName}`,
      body: `Click the button below to sign in. The link expires shortly for security.`,
      cta: "Sign in",
    },
  };
  const c = copy[action];
  const html = wrapHtml(c.heading, c.body, c.cta, ctx);
  const text = `${c.heading}\n\n${stripHtml(c.body)}\n\n${c.cta}: ${ctx.actionUrl}\n\n— ${ctx.tenantName}`;
  return { subject: c.subject, html, text };
}

function stripHtml(s: string) { return s.replace(/<[^>]+>/g, ""); }

function wrapHtml(heading: string, body: string, cta: string, ctx: RenderCtx) {
  const button = `<a href="${ctx.actionUrl}" style="display:inline-block;background:${ctx.primaryColour};color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:600;font-size:15px;">${cta}</a>`;
  const logo = ctx.logoUrl
    ? `<img src="${ctx.logoUrl}" alt="${ctx.tenantName}" style="max-height:48px;margin-bottom:24px;" />`
    : `<div style="font-size:22px;font-weight:700;color:${ctx.primaryColour};margin-bottom:24px;">${ctx.tenantName}</div>`;
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f6f6f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1f2028;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f7;padding:40px 12px;"><tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;padding:40px;max-width:560px;">
      <tr><td>
        ${logo}
        <h1 style="font-size:22px;margin:0 0 16px;color:#1f2028;">${heading}</h1>
        <p style="font-size:15px;line-height:1.55;margin:0 0 24px;color:#4a4d57;">${body}</p>
        ${button}
        <p style="font-size:12px;color:#8a8d97;margin:32px 0 0;">If the button doesn't work, paste this link into your browser:<br/><a href="${ctx.actionUrl}" style="color:${ctx.primaryColour};word-break:break-all;">${ctx.actionUrl}</a></p>
        <hr style="border:none;border-top:1px solid #eceef1;margin:32px 0 20px;" />
        <p style="font-size:12px;color:#8a8d97;margin:0;">Sent by ${ctx.tenantName}. If you weren't expecting this email, you can safely ignore it.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}