export const HOTEL_REVIEW_STATUSES = ["draft", "requested", "needs_info", "approved", "pending_payment"] as const;
export const HOTEL_OPEN_QUOTE_STATUSES = ["draft", "sent"] as const;

export function hotelNeedsReview(status: string): boolean {
  return HOTEL_REVIEW_STATUSES.some(stage => stage === status);
}

export function hotelQuoteNeedsAttention(status: string, bookingId: string | null): boolean {
  return bookingId === null && HOTEL_OPEN_QUOTE_STATUSES.some(stage => stage === status);
}