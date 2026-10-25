import { describe, expect, it } from "vitest";
import { applyBookingVaccinationGate, hasVaccinationCertificate, type VaxRowState } from "./PetVaccinationsPanel";
import type { PetVaccination } from "@/features/comms/queries";
import type { VaxGateRow } from "./vaccinationGate";

const record = { id: "vax-1", vaccination_type: "rabies", document_id: null, expiry_date: "2027-01-01" } as PetVaccination;
const row: VaxRowState = { key: "rabies", label: "Rabies", required: true, record, hasCert: false, label_status: "Awaiting certificate", tone: "orange" };
const gate: VaxGateRow = { pet_id: "dog-1", pet_name: "Dog", vaccine_type: "rabies", label: "Rabies", status: "ok", expiry_date: "2027-01-01", has_certificate: true };

describe("Vaccination evidence and booking readiness", () => {
  it("accepts a shared pet card for an existing vaccination record without an individual link", () => {
    expect(hasVaccinationCertificate(record, [{ id: "shared-card" }])).toBe(true);
    expect(hasVaccinationCertificate(record, [])).toBe(false);
  });
  it("does not turn a card upload into a missing vaccination record", () => {
    expect(hasVaccinationCertificate(null, [{ id: "shared-card" }])).toBe(false);
  });
  it("uses the booking's certificate and validity decision", () => {
    expect(applyBookingVaccinationGate([row], [gate], "dog-1")[0]).toMatchObject({ hasCert: true, tone: "green" });
  });
  it("keeps a vaccine expired at arrival outstanding even with a card", () => {
    expect(applyBookingVaccinationGate([row], [{ ...gate, status: "expired" }], "dog-1")[0]).toMatchObject({ hasCert: true, tone: "coral" });
  });
  it("uses the booking waiver instead of claiming the certificate is valid", () => {
    expect(applyBookingVaccinationGate([row], [{ ...gate, status: "waived", has_certificate: false }], "dog-1")[0]).toMatchObject({ tone: "grey", hasCert: false });
  });
  it("never borrows another pet's gate result", () => {
    expect(applyBookingVaccinationGate([row], [gate], "dog-2")[0]).toMatchObject({ hasCert: false, tone: "orange", required: false });
  });
  it("includes required vaccines even when absent from the active catalog", () => {
    expect(applyBookingVaccinationGate([], [{ ...gate, status: "missing" }], "dog-1")[0]).toMatchObject({ required: true, record: null, tone: "coral" });
  });
});