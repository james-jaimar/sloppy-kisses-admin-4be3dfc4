import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { InvoiceStatusChip } from "./status";

describe("InvoiceStatusChip", () => {
  afterEach(cleanup);

  it("renders the large variant big and bold for at-a-glance reading", () => {
    render(<InvoiceStatusChip status="paid" size="lg" />);
    const chip = screen.getByText("Paid");
    expect(chip.className).toContain("text-base");
    expect(chip.className).toContain("font-bold");
  });

  it("keeps the default variant compact but bolder than before", () => {
    render(<InvoiceStatusChip status="overdue" />);
    const chip = screen.getByText("Overdue");
    expect(chip.className).toContain("text-xs");
    expect(chip.className).toContain("font-semibold");
  });
});
