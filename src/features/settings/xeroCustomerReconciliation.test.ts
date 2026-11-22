import { describe, expect, it } from "vitest";
import { allocateSkNumbers, inCreationWindow, saPhone, skNumber } from "./xeroCustomerReconciliation";

describe("customer reconciliation rules", () => {
  it("uses SK followed by exactly five zero-padded digits", () => {
    expect(skNumber(5084)).toBe("SK05084");
    expect(skNumber(1)).toBe("SK00001");
    expect(skNumber(99999)).toBe("SK99999");
    expect(() => skNumber(100000)).toThrow();
  });
  it("allocates sequentially after both systems including legacy unpadded numbers", () => {
    expect(allocateSkNumbers(["SK04706", "SK05080", "SK5083"], 3)).toEqual(["SK05084", "SK05085", "SK05086"]);
  });
  it("includes September, October and November creation dates, not older edits", () => {
    const start = "2026-09-01T00:00:00Z";
    const end = "2026-12-01T00:00:00Z";
    for (const created of ["2026-09-12T06:25:07", "2026-10-09T07:36:37", "2026-11-20T08:51:09"]) {
      expect(inCreationWindow(created, start, end)).toBe(true);
    }
    expect(inCreationWindow("2024-03-07T06:45:02", start, end)).toBe(false);
    expect(inCreationWindow("2026-12-01T00:00:00", start, end)).toBe(false);
  });
  it("matches complete local and international SA numbers without matching incomplete phones", () => {
    expect(saPhone("+27 81 440 1334")).toBe("0814401334");
    expect(saPhone("081 440 1334")).toBe("0814401334");
    expect(saPhone("416 5720")).toBe("");
  });
});