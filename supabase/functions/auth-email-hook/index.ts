// Supabase Auth "Send Email Hook".
// Supabase calls this for every auth email (invite, recovery, magiclink,
// signup, email_change, reauthentication). We render a Sloppy Kisses
// branded email and send it via the tenant's SMTP settings, so the
// recipient never sees a supabase.io sender or the default template.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { Webhook } from "npm:standardwebhooks@1.0.0";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const HOOK_SECRET = Deno.env.get("AUTH_EMAIL_HOOK_SECRET")!;

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

type ActionType =
  | "signup"
  | "recovery"
  | "invite"
  | "magiclink"
  | "email_change"
  | "email_change_new"
  | "reauthentication";

interface HookPayload {
  user: {
    id: string;
    email: string;
    new_email?: string;
    user_metadata?: Record<string, unknown>;
  };
  email_data: {
    token: string;
    token_hash: string;
    token_new?: string;
    token_hash_new?: string;
    redirect_to: string;
    email_action_type: ActionType;
    site_url: string;
  };
}

interface Transport {
  smtp_host: string;
  smtp_port: number;
  smtp_secure: string; // 'ssl' | 'starttls' | 'none'
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
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), { status: 405 });
  }

  const raw = await req.text();
  let payload: HookPayload;
  try {
    const wh = new Webhook(HOOK_SECRET);
    payload = wh.verify(raw, Object.fromEntries(req.headers)) as HookPayload;
  } catch (err) {
    console.error("signature verification failed:", (err as Error).message);
    return new Response(JSON.stringify({ error: "bad signature" }), { status: 401 });
  }

  try {
    const recipient = payload.user.new_email ?? payload.user.email;
    const tenant = await resolveTenant(payload);
    const transport = await loadTransport(tenant.id);
    if (!transport) {
      throw new Error(`No SMTP configured for tenant ${tenant.name}. Configure it in Settings → Email Server.`);
    }
    const url = buildActionUrl(payload);
    const { subject, html, text } = renderTemplate(payload.email_data.email_action_type, {
      recipient,
      tenantName: tenant.name,
      primaryColour: tenant.primary_colour ?? "#F26D6D",
      logoUrl: tenant.logo_url,
      actionUrl: url,
      inviterName: (payload.user.user_metadata?.invited_by_name as string) ?? null,
      newEmail: payload.user.new_email ?? null,
      token: payload.email_data.token,
    });

    await sendMail(transport, recipient, subject, html, text);
    await logEmail(tenant.id, recipient, subject, "sent", null, payload.email_data.email_action_type);
    return new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (err) {
    const msg = (err as Error).message;
    console.error("auth-email-hook failed:", msg);
    try {
      await logEmail(null, payload.user.new_email ?? payload.user.email, "AUTH EMAIL FAILED", "failed", msg, payload.email_data.email_action_type);
    } catch (_) { /* swallow */ }
    // Return 200 so Supabase doesn't storm retries; failure is recorded in email_log.
    return new Response(JSON.stringify({ error: msg }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
});

// ---------- Tenant resolution ----------
async function resolveTenant(payload: HookPayload): Promise<TenantBrand> {
  // 1) explicit tenant on user_metadata (set by invite-user)
  const meta = payload.user.user_metadata ?? {};
  const explicit = (meta.invited_tenant_id as string | undefined) ?? (meta.tenant_id as string | undefined);
  if (explicit) {
    const t = await fetchTenant(explicit);
    if (t) return t;
  }
  // 2) via profile → tenant_users
  const { data: prof } = await admin
    .from("profiles")
    .select("id")
    .eq("auth_user_id", payload.user.id)
    .maybeSingle();
  if (prof?.id) {
    const { data: tu } = await admin
      .from("tenant_users")
      .select("tenant_id")
      .eq("profile_id", prof.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (tu?.tenant_id) {
      const t = await fetchTenant(tu.tenant_id);
      if (t) return t;
    }
  }
  // 3) fallback: first tenant in system
  const { data: any } = await admin
    .from("tenants")
    .select("id,name,primary_colour,logo_url")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (any) return any as TenantBrand;
  throw new Error("No tenant could be resolved for this auth email");
}

async function fetchTenant(id: string): Promise<TenantBrand | null> {
  const { data } = await admin
    .from("tenants")
    .select("id,name,primary_colour,logo_url")
    .eq("id", id)
    .maybeSingle();
  return (data as TenantBrand | null) ?? null;
}

// ---------- Transport ----------
async function loadTransport(tenantId: string): Promise<Transport | null> {
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

// ---------- Logging ----------
async function logEmail(
  tenantId: string | null,
  to: string,
  subject: string,
  status: "sent" | "failed",
  error: string | null,
  action: string,
) {
  if (!tenantId) {
    console.warn("logEmail skipped — no tenant_id resolved:", { to, subject, status, error, action });
    return;
  }
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

// ---------- Action URL ----------
function buildActionUrl(p: HookPayload): string {
  const base = SUPABASE_URL.replace(/\/+$/, "");
  const params = new URLSearchParams({
    token: p.email_data.token_hash,
    type: p.email_data.email_action_type,
    redirect_to: p.email_data.redirect_to || p.email_data.site_url,
  });
  return `${base}/auth/v1/verify?${params.toString()}`;
}

// ---------- Templates ----------
interface RenderCtx {
  recipient: string;
  tenantName: string;
  primaryColour: string;
  logoUrl: string | null;
  actionUrl: string;
  inviterName: string | null;
  newEmail: string | null;
  token: string;
}

function renderTemplate(action: ActionType, ctx: RenderCtx) {
  const copy: Record<ActionType, { subject: string; heading: string; body: string; cta: string }> = {
    invite: {
      subject: `You've been invited to ${ctx.tenantName}`,
      heading: `Welcome to ${ctx.tenantName}`,
      body: `${ctx.inviterName ? `${ctx.inviterName} has invited you` : "You've been invited"} to join <strong>${ctx.tenantName}</strong>. Click the button below to accept and set your password.`,
      cta: "Accept invitation",
    },
    signup: {
      subject: `Confirm your ${ctx.tenantName} account`,
      heading: `Confirm your email`,
      body: `Thanks for signing up to <strong>${ctx.tenantName}</strong>. Please confirm your email address to activate your account.`,
      cta: "Confirm email",
    },
    recovery: {
      subject: `Reset your ${ctx.tenantName} password`,
      heading: `Reset your password`,
      body: `We received a request to reset your <strong>${ctx.tenantName}</strong> password. If this wasn't you, ignore this email.`,
      cta: "Reset password",
    },
    magiclink: {
      subject: `Your ${ctx.tenantName} sign-in link`,
      heading: `Sign in to ${ctx.tenantName}`,
      body: `Click the button below to sign in. The link expires shortly for security.`,
      cta: "Sign in",
    },
    email_change: {
      subject: `Confirm your new email for ${ctx.tenantName}`,
      heading: `Confirm your email change`,
      body: `Please confirm the change of your ${ctx.tenantName} account email${ctx.newEmail ? ` to <strong>${ctx.newEmail}</strong>` : ""}.`,
      cta: "Confirm change",
    },
    email_change_new: {
      subject: `Confirm your new email for ${ctx.tenantName}`,
      heading: `Confirm your new email`,
      body: `Please confirm this new email address for your ${ctx.tenantName} account.`,
      cta: "Confirm email",
    },
    reauthentication: {
      subject: `${ctx.tenantName} verification code`,
      heading: `Your verification code`,
      body: `Use this code to confirm the action on your ${ctx.tenantName} account: <div style="font-size:28px;font-weight:700;letter-spacing:6px;margin:24px 0;">${ctx.token}</div>`,
      cta: "",
    },
  };

  const c = copy[action] ?? copy.magiclink;
  const html = wrapHtml(c.heading, c.body, c.cta, ctx);
  const text = `${c.heading}\n\n${stripHtml(c.body)}\n\n${c.cta ? `${c.cta}: ${ctx.actionUrl}` : ""}\n\n— ${ctx.tenantName}`;
  return { subject: c.subject, html, text };
}

function stripHtml(s: string) {
  return s.replace(/<[^>]+>/g, "");
}

function wrapHtml(heading: string, body: string, cta: string, ctx: RenderCtx) {
  const button = cta
    ? `<a href="${ctx.actionUrl}" style="display:inline-block;background:${ctx.primaryColour};color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:600;font-size:15px;">${cta}</a>`
    : "";
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
        ${cta ? `<p style="font-size:12px;color:#8a8d97;margin:32px 0 0;">If the button doesn't work, paste this link into your browser:<br/><a href="${ctx.actionUrl}" style="color:${ctx.primaryColour};word-break:break-all;">${ctx.actionUrl}</a></p>` : ""}
        <hr style="border:none;border-top:1px solid #eceef1;margin:32px 0 20px;" />
        <p style="font-size:12px;color:#8a8d97;margin:0;">Sent by ${ctx.tenantName}. If you weren't expecting this email, you can safely ignore it.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}