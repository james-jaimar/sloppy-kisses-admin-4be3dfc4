import { describe, expect, it } from "vitest";
import { briefRows, medicalFlagLabels } from "./briefRows";

const catalog = {
  groups: [
    { id: "g1", code: "head_face", label: "Face", kind: "single", sort_order: 20, active: true, is_medical: false, icon: "smile", colour: "coral", tenant_id: "t" },
    { id: "g2", code: "medical", label: "Medical", kind: "multi", sort_order: 190, active: true, is_medical: true, icon: "shield-alert", colour: "danger", tenant_id: "t" },
    { id: "g3", code: "hand_strip", label: "Hand stripping", kind: "bool", sort_order: 90, active: true, is_medical: false, icon: null, colour: null, tenant_id: "t" },
  ] as any,
  byGroup: {
    g1: [{ id: "o1", group_id: "g1", code: "neaten", label: "Neaten up" }] as any,
    g2: [{ id: "o2", group_id: "g2", code: "ticks", label: "Ticks" }] as any,
    g3: [] as any,
  },
};

describe("briefRows", () => {
  it("resolves option codes to labels and keeps medical first", () => {
    const rows = briefRows({ head_face: "neaten", medical: ["ticks"], hand_strip: true }, catalog as any);
    expect(rows.map((r) => r.code)).toEqual(["medical", "head_face", "hand_strip"]);
    expect(rows[1]).toMatchObject({ value: "Neaten up", icon: "smile", colour: "coral" });
    expect(rows[2].value).toBe("Yes");
  });

  it("skips empty selections", () => {
    expect(briefRows({ head_face: "", medical: [], hand_strip: false }, catalog as any)).toEqual([]);
    expect(briefRows(null, catalog as any)).toEqual([]);
  });

  it("labels medical flag codes", () => {
    expect(medicalFlagLabels(["ticks", "nope"], catalog as any)).toEqual(["Ticks", "nope"]);
  });
});
