// GLOBAL OUTBOUND EMAIL LOCK
//
// Single chokepoint that every outbound email path must pass through before
// handing anything to SMTP. While `comms_settings.sending_enabled` is false,
// the only addresses that receive mail are those listed in
// `comms_settings.test_recipient_allowlist`.
//
// Blocked sends are never silently dropped: they are written to `email_log`
// with status 'blocked' so you can see exactly what WOULD have gone out and
// to whom.

import { type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export interface SendGate {
  allowed: boolean;
  /** Human-readable reason when blocked. */
  reason: string | null;
}

interface CommsGuardRow {
  sending_enabled: boolean | null;
  test_recipient_allowlist: string[] | null;
}

/**
 * Decide whether `recipient` may be emailed for this tenant.
 *
 * Fails CLOSED: if the settings row cannot be read for any reason we block,
 * because the cost of a wrongly-sent client email is far higher than the cost
 * of a wrongly-blocked one.
 */
export async function checkSendAllowed(
  admin: SupabaseClient,
  tenantId: string,
  recipient: string,
): Promise<SendGate> {
  const to = (recipient ?? "").trim().toLowerCase();
  if (!to) return { allowed: false, reason: "No recipient address" };

  const { data, error } = await admin
    .from("comms_settings")
    .select("sending_enabled,test_recipient_allowlist")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    return {
      allowed: false,
      reason: `Send lock: could not read comms settings (${error.message}) — failing closed`,
    };
  }

  const row = (data ?? null) as CommsGuardRow | null;
  if (!row) {
    return { allowed: false, reason: "Send lock: no comms settings for this tenant — failing closed" };
  }

  const allowlist = (row.test_recipient_allowlist ?? []).map((a) => (a ?? "").trim().toLowerCase());
  if (allowlist.includes(to)) return { allowed: true, reason: null };

  if (row.sending_enabled === true) return { allowed: true, reason: null };

  return {
    allowed: false,
    reason: "Outbound email is locked (Settings → Email → Comms safety). Recipient is not on the test allowlist.",
  };
}

/**
 * Record a blocked send in `email_log` so it stays visible and auditable.
 * Never throws — logging must not break the caller.
 */
export async function logBlockedEmail(
  admin: SupabaseClient,
  args: {
    tenantId: string;
    recipient: string;
    subject: string;
    reason: string;
    templateCode?: string | null;
    customerId?: string | null;
    invoiceId?: string | null;
    bookingId?: string | null;
  },
): Promise<void> {
  try {
    await admin.from("email_log").insert({
      tenant_id: args.tenantId,
      customer_id: args.customerId ?? null,
      invoice_id: args.invoiceId ?? null,
      booking_id: args.bookingId ?? null,
      template_code: args.templateCode ?? null,
      to_email: args.recipient,
      subject: `[BLOCKED] ${args.subject}`,
      status: "blocked",
      error_message: args.reason,
      sent_at: null,
    });
  } catch (e) {
    console.error("logBlockedEmail failed:", (e as Error).message);
  }
}

/**
 * Convenience wrapper: check the gate and log the block in one step.
 * Returns true when the caller may proceed to send.
 */
export async function guardSend(
  admin: SupabaseClient,
  args: {
    tenantId: string;
    recipient: string;
    subject: string;
    templateCode?: string | null;
    customerId?: string | null;
    invoiceId?: string | null;
    bookingId?: string | null;
  },
): Promise<SendGate> {
  const gate = await checkSendAllowed(admin, args.tenantId, args.recipient);
  if (!gate.allowed) {
    console.warn(`BLOCKED outbound email to ${args.recipient}: ${gate.reason}`);
    await logBlockedEmail(admin, { ...args, reason: gate.reason ?? "blocked" });
  }
  return gate;
}