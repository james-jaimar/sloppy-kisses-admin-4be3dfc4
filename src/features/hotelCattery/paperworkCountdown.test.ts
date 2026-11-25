import { describe, expect, it } from "vitest";
import { daysUntil, paperworkTier } from "./paperworkCountdown";

describe("paperworkTier", () => {
  it("is routine beyond 30 days", () => expect(paperworkTier(31)).toBe("pending"));
  it("is due at 30 days", () => expect(paperworkTier(30)).toBe("due"));
  it("is outstanding at 21 days", () => expect(paperworkTier(21)).toBe("outstanding"));
  it("is critical at 14 days", () => expect(paperworkTier(14)).toBe("critical"));
  it("is urgent at 7 days", () => expect(paperworkTier(7)).toBe("urgent"));
  it("counts calendar days", () => expect(daysUntil("2026-12-02", "2026-11-25")).toBe(7));
});
