import { supabase } from "@/lib/supabase/client";

/**
 * A booking move raises a `booking_rescheduled` notification event via DB trigger.
 * The trigger only knows the old/new times — it cannot know whether the money
 * changed. These helpers annotate the pending event with the invoice outcome and
 * then flush the dispatcher so the customer gets the change confirmation now
 * rather than on the next cron tick.
 */

export interface InvoiceSnapshot {
  invoiceId: string | null;
  total: number | null;
}

/** Reads the booking's invoice id + total so the caller can diff it after a save. */
export async function readBookingInvoiceSnapshot(bookingId: string): Promise<InvoiceSnapshot> {
  const { data } = await supabase
    .from("bookings")
    .select("invoice_id, invoice:invoices!bookings_invoice_id_fkey(id, total)")
    .eq("id", bookingId)
    .maybeSingle();
  const inv = (data as any)?.invoice ?? null;
  return {
    invoiceId: (data as any)?.invoice_id ?? null,
    total: inv?.total == null ? null : Number(inv.total),
  };
}

const zar = (n: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", minimumFractionDigits: 2 }).format(n);

/**
 * Stamps the invoice outcome onto any still-pending reschedule event for this
 * booking, then runs the notification dispatcher.
 */
export async function notifyBookingRescheduled(
  bookingId: string,
  money?: { before: InvoiceSnapshot; after: InvoiceSnapshot },
): Promise<void> {
  try {
    const { data: events } = await supabase
      .from("notification_events")
      .select("id, payload")
      .eq("booking_id", bookingId)
      .eq("event_type", "booking_rescheduled")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(3);

    if (events?.length && money) {
      const changed =
        money.before.invoiceId !== money.after.invoiceId ||
        Number(money.before.total ?? 0) !== Number(money.after.total ?? 0);
      const line = changed
        ? money.after.total == null
          ? "Your invoice for this booking has been updated."
          : `Your invoice has been updated to ${zar(Number(money.after.total))}.`
        : "Nothing else changed, so your invoice amount stays the same.";
      for (const ev of events) {
        await supabase
          .from("notification_events")
          .update({
            payload: { ...((ev as any).payload ?? {}), invoice_changed: changed, invoice_line: line },
          } as any)
          .eq("id", (ev as any).id);
      }
    }

    await supabase.functions.invoke("send-notifications", { body: { booking_id: bookingId } });
  } catch (err) {
    // Never block the move on a comms hiccup — the cron drain will retry.
    console.warn("Booking change confirmation could not be dispatched", bookingId, err);
  }
}
