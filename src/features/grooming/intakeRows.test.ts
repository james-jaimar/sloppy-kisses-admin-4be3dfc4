import { describe, expect, it } from "vitest";
import { buildIntakeRows } from "./intakeRows";

describe("buildIntakeRows", () => {
  it("keeps an owner's pets together and alternates bands per owner", () => {
    const rows = buildIntakeRows([
      { bookingId: "b1", customerId: "jade", petId: "kai", number: 1 },
      { bookingId: "b2", customerId: "seb", petId: "finn", number: 2 },
      { bookingId: "b3", customerId: "jade", petId: "koda", number: 3 },
      { bookingId: "b4", customerId: "seb", petId: "arlo", number: 4 },
      { bookingId: "b5", customerId: "jo", petId: "harry", number: 5 },
    ]);
    expect(rows.map((r) => r.petId)).toEqual(["kai", "koda", "finn", "arlo", "harry"]);
    expect(rows.map((r) => r.band)).toEqual([0, 0, 1, 1, 2]);
    expect(rows.map((r) => r.firstOfOwner)).toEqual([true, false, true, false, true]);
  });
});
