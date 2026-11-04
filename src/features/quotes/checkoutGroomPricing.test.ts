import { expect, it } from "vitest";
import { checkoutGroomLine } from "./checkoutGroomPricing";
it("includes one requested groom using the configured checkout discount", () => {
  expect(checkoutGroomLine("Doggy", "Full", 400, 50)).toMatchObject({ quantity: 1, unit_price: 200 });
});