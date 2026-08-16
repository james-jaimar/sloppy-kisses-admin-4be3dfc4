import { describe, expect, it } from "vitest";
import { groomingNextAction, isGroomingService, mobileGroomingStateLabel } from "./workflowActions";

describe("mobile grooming workflow actions", () => {
  it("treats both grooming services as grooming, but not transport", () => {
    expect(isGroomingService("grooming_inhouse")).toBe(true);
    expect(isGroomingService("grooming_mobile")).toBe(true);
    expect(isGroomingService("pickup_dropoff")).toBe(false);
  });

  it("uses the established grooming status sequence", () => {
    expect(groomingNextAction("confirmed")?.status).toBe("checked_in");
    expect(groomingNextAction("checked_in")).toMatchObject({ label: "Start grooming", status: "grooming" });
    expect(groomingNextAction("grooming")).toMatchObject({ label: "Ready for collection", status: "ready" });
    expect(groomingNextAction("ready")).toBeNull();
  });

  it("labels terminal and ready states clearly", () => {
    expect(mobileGroomingStateLabel("ready")).toBe("Ready for collection");
    expect(mobileGroomingStateLabel("completed")).toBe("Completed");
  });
});