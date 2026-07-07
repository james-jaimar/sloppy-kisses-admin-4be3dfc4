import { describe, it, expect } from "vitest";
import { expandRecurrence, describeRule } from "./recurrence";

describe("expandRecurrence", () => {
  const start = "2026-07-06T09:00:00.000Z"; // Monday
  const end = "2026-07-06T10:00:00.000Z";

  it("returns just the template when frequency is daily but end date is before next occurrence", () => {
    const out = expandRecurrence({
      startAt: start, endAt: end,
      rule: { frequency: "daily", interval: 1, endDate: "2026-07-06" },
    });
    expect(out).toHaveLength(1);
  });

  it("expands weekly on Mon/Wed for 4 occurrences", () => {
    const out = expandRecurrence({
      startAt: start, endAt: end,
      rule: { frequency: "weekly", interval: 1, daysOfWeek: ["mon", "wed"], count: 4 },
    });
    expect(out).toHaveLength(4);
    // Mon, Wed, Mon, Wed
    expect(out.map((o) => new Date(o.start_at).getUTCDay())).toEqual([1, 3, 1, 3]);
  });

  it("respects horizon cap", () => {
    const out = expandRecurrence({
      startAt: start, endAt: end,
      rule: { frequency: "daily", interval: 1 },
      horizonDays: 5,
    });
    // template + 5 daily = 6, but horizon is 5 days from start (inclusive)
    expect(out.length).toBeLessThanOrEqual(6);
    expect(out.length).toBeGreaterThan(1);
  });

  it("monthly clamps to last day of shorter months", () => {
    const out = expandRecurrence({
      startAt: "2026-01-31T09:00:00.000Z",
      endAt: "2026-01-31T10:00:00.000Z",
      rule: { frequency: "monthly", interval: 1, count: 3 },
    });
    expect(out).toHaveLength(3);
    // Feb has 28 days in 2026
    expect(out[1].start_at.slice(0, 10)).toBe("2026-02-28");
    expect(out[2].start_at.slice(0, 10)).toBe("2026-03-31");
  });
});

describe("describeRule", () => {
  it("summarises weekly with weekdays", () => {
    expect(
      describeRule({ frequency: "weekly", interval: 1, daysOfWeek: ["mon", "wed"], endDate: "2026-11-30" }),
    ).toMatch(/Every week on Mon, Wed until/);
  });
});