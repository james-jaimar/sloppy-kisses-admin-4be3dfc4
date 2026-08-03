import { supabase } from "@/integrations/supabase/client";

/**
 * Booking invoices are created as full `issued` invoices by DB triggers.
 * This helper emails the invoice to the customer once, right after it is issued.
 * It is idempotent: `send-invoice-email` flips the invoice to `sent`, and we only
 * send while the status is still `issued`.
 * Respects the global send kill-switch (enforced inside the edge function).
 */
export async function emailIssuedInvoice(invoiceId: string): Promise<boolean> {
  const { data: inv } = await supabase
    .from("invoices")
    .select("id, status, total")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!inv || (inv as any).status !== "issued") return false;
  if (Number((inv as any).total ?? 0) <= 0) return false;

  const { error } = await supabase.functions.invoke("send-invoice-email", {
    body: { invoice_id: invoiceId, kind: "send" },
  });
  if (error) {
    console.warn("Auto-send of invoice failed", invoiceId, error);
    return false;
  }
  return true;
}

/** Looks up the invoice linked to a booking and emails it if it is freshly issued. */
export async function autoEmailBookingInvoice(bookingId: string): Promise<boolean> {
  const { data: booking } = await supabase
    .from("bookings")
    .select("invoice_id")
    .eq("id", bookingId)
    .maybeSingle();
  const invoiceId = (booking as any)?.invoice_id as string | null | undefined;
  if (!invoiceId) return false;
  return emailIssuedInvoice(invoiceId);
}
