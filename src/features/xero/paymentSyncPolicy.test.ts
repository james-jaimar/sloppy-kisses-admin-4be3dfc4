import { describe, expect, it, vi } from "vitest";
import { withPaymentSync } from "../../../supabase/functions/xero-sync/paymentSyncPolicy";

describe("Xero payment syncing", () => {
  it("does not send app payments when payment sync is off", async () => {
    const push = vi.fn(async () => ({ xero_id: "payment" }));
    expect(await withPaymentSync({ sync_payments: false }, push)).toMatchObject({ skipped: true });
    expect(push).not.toHaveBeenCalled();
  });
  it("defaults missing payment sync settings to off", async () => {
    const push = vi.fn(async () => "sent");
    expect(await withPaymentSync({}, push)).toMatchObject({ skipped: true });
    expect(push).not.toHaveBeenCalled();
  });
  it("only sends a payment after explicit activation", async () => {
    const push = vi.fn(async () => ({ xero_id: "payment" }));
    expect(await withPaymentSync({ sync_payments: true }, push)).toEqual({ xero_id: "payment" });
    expect(push).toHaveBeenCalledTimes(1);
  });
});