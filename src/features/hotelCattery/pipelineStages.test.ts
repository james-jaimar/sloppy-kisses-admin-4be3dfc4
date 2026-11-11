import { describe, expect, it } from "vitest";
import { matchesPipelineStage } from "./pipelineStages";

describe("matchesPipelineStage", () => {
  it("Needs action excludes confirmed stays but includes every review status", () => {
    for (const s of ["draft", "requested", "needs_info", "approved", "pending_payment"]) {
      expect(matchesPipelineStage(s, "action")).toBe(true);
    }
    expect(matchesPipelineStage("confirmed", "action")).toBe(false);
  });

  it("specific stages match only their own status", () => {
    expect(matchesPipelineStage("draft", "draft")).toBe(true);
    expect(matchesPipelineStage("requested", "draft")).toBe(false);
    expect(matchesPipelineStage("needs_info", "needs_info")).toBe(true);
    expect(matchesPipelineStage("pending_payment", "pending_payment")).toBe(true);
    expect(matchesPipelineStage("confirmed", "confirmed")).toBe(true);
    expect(matchesPipelineStage("draft", "confirmed")).toBe(false);
  });

  it("All matches every status", () => {
    for (const s of ["draft", "requested", "needs_info", "approved", "pending_payment", "confirmed"]) {
      expect(matchesPipelineStage(s, "all")).toBe(true);
    }
  });
});
