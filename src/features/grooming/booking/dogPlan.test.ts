import { describe, expect, it } from "vitest";
import { applyInstructionAddons } from "./dogPlan";

const cat = {
  groups: [{ id: "treatments", code: "treatments", kind: "multi" }],
  options: [
    { code: "nails", addon_code: "nails_trim" },
    { code: "anal", addon_code: "anal_gland" },
  ],
  byGroup: {
    treatments: [
      { code: "nails", addon_code: "nails_trim" },
      { code: "anal", addon_code: "anal_gland" },
    ],
  },
};
const addons = [
  { id: "nails-id", code: "nails_trim" },
  { id: "anal-id", code: "anal_gland" },
  { id: "deshed-id", code: "deshed_only" },
  { id: "strip-id", code: "hand_strip" },
];

describe("individual grooming treatment selection", () => {
  it.each(addons)("preserves $code without a package or styling sheet", ({ id }) => {
    const selected = [{ addon_id: id, qty: 2 }];
    expect(applyInstructionAddons(selected, {}, cat, addons, null)).toBe(selected);
  });

  it("does not reselect a directly unticked treatment from stale instructions", () => {
    expect(applyInstructionAddons([], { treatments: ["nails"] }, cat, addons, null)).toEqual([]);
  });

  it("keeps package instruction-driven additions and removals working", () => {
    const selected = [{ addon_id: "anal-id", qty: 1 }, { addon_id: "deshed-id", qty: 2 }];
    expect(applyInstructionAddons(selected, { treatments: ["nails"] }, cat, addons, "package-id")).toEqual([
      { addon_id: "deshed-id", qty: 2 },
      { addon_id: "nails-id", qty: 1 },
    ]);
  });
});