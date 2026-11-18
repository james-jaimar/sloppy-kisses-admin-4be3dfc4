export const PAYMENT_SYNC_DISABLED = "Payment syncing disabled; bank reconciliation stays in Xero.";

/** Fail closed, including older settings objects that lack the new flag. */
export async function withPaymentSync<T>(
  settings: { sync_payments?: boolean },
  push: () => Promise<T>,
): Promise<T | { skipped: true; reason: string }> {
  if (settings.sync_payments !== true) {
    return { skipped: true, reason: PAYMENT_SYNC_DISABLED };
  }
  return await push();
}