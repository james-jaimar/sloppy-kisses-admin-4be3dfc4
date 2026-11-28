import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GroomingDurationFields } from "./GroomingDurationFields";

function Dogs() {
  const [plans, setPlans] = useState<Record<string, { durationOverride?: number | null; mattedSurchargeOverride?: number | null }>>({});
  return <>{["Husky", "Poodle"].map(name => <GroomingDurationFields key={name} petName={name} baseMinutes={90} rate={50}
    durationOverride={plans[name]?.durationOverride} surchargeOverride={plans[name]?.mattedSurchargeOverride}
    onChange={patch => setPlans(prev => ({ ...prev, [name]: { ...prev[name], ...patch } }))} />)}</>;
}

describe("grooming duration controls", () => {
  it("populates R200 for an extra hour on only the selected dog and accepts a custom charge", () => {
    render(<Dogs />);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Husky duration (minutes)" }), { target: { value: "150" } });
    expect(screen.getByRole("spinbutton", { name: "Husky matted coat surcharge (ZAR)" })).toHaveValue(200);
    expect(screen.getByRole("spinbutton", { name: "Poodle duration (minutes)" })).toHaveValue(90);
    expect(screen.getByRole("spinbutton", { name: "Poodle matted coat surcharge (ZAR)" })).toHaveValue(0);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Husky matted coat surcharge (ZAR)" }), { target: { value: "175" } });
    expect(screen.getByRole("spinbutton", { name: "Husky matted coat surcharge (ZAR)" })).toHaveValue(175);
    expect(screen.getByRole("spinbutton", { name: "Husky duration (minutes)" })).toHaveValue(150);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Husky duration (minutes)" }), { target: { value: "120" } });
    expect(screen.getByRole("spinbutton", { name: "Husky matted coat surcharge (ZAR)" })).toHaveValue(100);
    fireEvent.click(screen.getByRole("button", { name: "Reset to standard" }));
    expect(screen.getByRole("spinbutton", { name: "Husky duration (minutes)" })).toHaveValue(90);
    expect(screen.getByRole("spinbutton", { name: "Husky matted coat surcharge (ZAR)" })).toHaveValue(0);
  });
});