import { describe, expect, it } from "vitest";
import { WORK_JOB_ADDRESS_COLUMNS } from "./queries";
import { landingFor } from "@/lib/auth/landing";

describe("mobile grooming work-mode routing", () => {
  it("keeps Route as the initial login landing page", () => {
    const hasPermission = (code: string) => ["work.access", "work.grooming_mobile"].includes(code);
    expect(landingFor({ userType: "staff", hasPermission, depts: ["grooming_mobile"] })).toBe("/work/vans");
  });
});

describe("work job address query", () => {
  it("uses the real customer_addresses coordinate columns", () => {
    expect(WORK_JOB_ADDRESS_COLUMNS).toContain("latitude");
    expect(WORK_JOB_ADDRESS_COLUMNS).toContain("longitude");
    expect(WORK_JOB_ADDRESS_COLUMNS).not.toMatch(/\blat\b|\blng\b/);
  });
});