import { describe, expect, it } from "vitest";
import { creditAmountType } from "../../../supabase/functions/xero-sync/creditAmountType";

describe("Xero VAT-inclusive credits", () => {
  it("does not add VAT again to a new R545 credit in an Exclusive tenant", () => {
    expect(creditAmountType(null, "Exclusive")).toBe("Inclusive");
  });
  it("keeps existing linked Xero document handling unchanged", () => {
    expect(creditAmountType("existing-xero-id", "Exclusive")).toBe("Exclusive");
  });
});