import { describe, it, expect } from "vitest";
import { groomingInvoiceReleaseDay } from "./invoiceRelease";
describe("grooming invoice release", () => {
  it("releases an advance appointment on its day", () => expect(groomingInvoiceReleaseDay("2026-11-20", "appointment_day", 1, "2026-11-04")).toBe("2026-11-20"));
  it("supports release at booking", () => expect(groomingInvoiceReleaseDay("2026-11-20", "at_booking", 1, "2026-11-04")).toBe("2026-11-04"));
  it("uses the configured lead days", () => expect(groomingInvoiceReleaseDay("2026-11-20", "days_before", 3, "2026-11-04")).toBe("2026-11-17"));
  it("releases same-day visits immediately", () => expect(groomingInvoiceReleaseDay("2026-11-04", "days_before", 3, "2026-11-04")).toBe("2026-11-04"));
});