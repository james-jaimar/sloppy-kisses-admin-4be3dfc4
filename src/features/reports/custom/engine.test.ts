import { describe, expect, it } from "vitest";
import { applyFilters, bucketDate, groupRows, toCsv } from "./engine";

const rows = [
  { breed: "Poodle", package: "Full", total: 500, date: "2026-11-02" },
  { breed: "Poodle", package: "Express", total: 300, date: "2026-11-03" },
  { breed: "Labrador", package: "Full", total: 650, date: "2026-12-01" },
];

describe("custom report engine", () => {
  it("filters with contains and numeric greater-than", () => {
    expect(applyFilters(rows, [{ field: "breed", op: "contains", value: "pood" }])).toHaveLength(2);
    expect(applyFilters(rows, [{ field: "total", op: "gt", value: "400" }])).toHaveLength(2);
  });

  it("groups by two fields with count and sum", () => {
    const g = groupRows(rows, [{ field: "breed" }, { field: "package" }], [{ fn: "count" }, { fn: "sum", field: "total" }]);
    expect(g.find((x) => x.keys.join() === "Poodle,Full")?.values).toEqual([1, 500]);
    expect(g).toHaveLength(3);
  });

  it("buckets dates by month", () => {
    const g = groupRows(rows, [{ field: "date", bucket: "month" }], [{ fn: "sum", field: "total" }]);
    expect(g.find((x) => x.keys[0] === "2026-11")?.values[0]).toBe(800);
    expect(bucketDate("2026-11-04", "weekday")).toBe("3 Wed");
  });

  it("escapes CSV cells", () => {
    expect(toCsv(["a"], [['He said "hi", ok']])).toBe('a\r\n"He said ""hi"", ok"');
  });
});
