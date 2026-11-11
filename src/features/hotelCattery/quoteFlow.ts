export function hotelNeedsAcceptance(bookingStatus: string | null | undefined, quoteStatus?: string | null, confirmed = false) {
  return !confirmed && quoteStatus !== "accepted" && !["needs_info", "pending_payment", "confirmed", "checked_in", "checked_out", "completed"].includes(bookingStatus ?? "");
}

/** Staff-facing send state of a hotel quote: accepted, sent to the customer, or prepared but never sent. */
export function quoteSendState(quote: { status?: string | null; accepted_at?: string | null; sent_at?: string | null } | null | undefined): "accepted" | "sent" | "prepared" {
  if (!quote) return "prepared";
  if (quote.accepted_at || quote.status === "accepted") return "accepted";
  return quote.sent_at ? "sent" : "prepared";
}

export function publicHotelQuoteLink(appUrl: string | null | undefined, token: string) {
  if (!appUrl) throw new Error("Set the customer website address in Branding settings before copying a quote link.");
  const url = new URL(appUrl);
  if (url.protocol !== "https:") throw new Error("The customer website address must use HTTPS.");
  return `${url.origin}/q/${encodeURIComponent(token)}`;
}