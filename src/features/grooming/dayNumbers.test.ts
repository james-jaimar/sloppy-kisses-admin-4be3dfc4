import { describe, it, expect } from "vitest";
import { groomDayNumbers } from "./dayNumbers";
describe("groomDayNumbers", () => {
  it("numbers 8am dogs by station, then later dogs, one per dog", () => {
    const m = groomDayNumbers([
      { id: "c", start_at: "2026-11-25T09:00:00Z", station: "Station 1", pets: [{ id: "x" }, { id: "y" }] },
      { id: "b", start_at: "2026-11-25T08:00:00Z", station: "Station 2", pets: [{ id: "p" }] },
      { id: "a", start_at: "2026-11-25T08:00:00Z", station: "Station 1", pets: [{ id: "l" }] },
    ]);
    expect(m.get("a:l")).toBe(1);
    expect(m.get("b:p")).toBe(2);
    expect(m.get("c:x")).toBe(3);
    expect(m.get("c:y")).toBe(4);
  });
});
