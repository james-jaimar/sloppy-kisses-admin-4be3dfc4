import { describe, expect, it } from "vitest";
import { pickGroomingStation } from "./multiPetSchedule";

const resources = [{ id: "g1", name: "Groomer 1" }, { id: "g2", name: "Groomer 2" }, { id: "g3", name: "Groomer 3" }];
const start = new Date(2026, 10, 20, 10, 0);
const end = new Date(2026, 10, 20, 11, 0);
const busyAt = (id: string) => ({ start_at: start.toISOString(), end_at: end.toISOString(), resource_id: id });

describe("automatic grooming station assignment", () => {
  it("fills groomer 1 first when everyone is free", () => {
    expect(pickGroomingStation({ resources, busy: [], start, end })).toBe("g1");
  });
  it("moves to the next free groomer in order", () => {
    expect(pickGroomingStation({ resources, busy: [busyAt("g1"), busyAt("g2")], start, end })).toBe("g3");
  });
  it("never leaves the booking unassigned when all groomers are busy", () => {
    expect(pickGroomingStation({ resources, busy: resources.map((r) => busyAt(r.id)), start, end })).toBe("g1");
  });
});
