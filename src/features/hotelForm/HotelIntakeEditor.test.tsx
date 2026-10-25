import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HotelIntakeEditor } from "./HotelIntakeEditor";

const state = vi.hoisted(() => ({ stay: { pickup_required: true, dropoff_required: false, check_out_window: "Stay & Play 16:00–16:30", feeding_instructions: "Existing feeding notes" }, existing: { payload: null as any }, records: [{ id: "pet-1", name: "Dog", breed: "Poodle", size: "small" }], saved: null as any, mutate: vi.fn(), customer: { full_name: "Owner", mobile: "+27123456789", emergency_contact_name: "Emergency", emergency_contact_mobile: "+27987654321", vet_clinic_name: "Vet", vet_clinic_contact: "+27111111111" } }));
vi.mock("@/lib/tenant/TenantContext", () => ({ useCurrentUser: () => ({ hasPermission: () => true }) }));
vi.mock("@tanstack/react-query", async () => ({ ...await vi.importActual<any>("@tanstack/react-query"), useQuery: () => ({ data: state.stay, isLoading: false }) }));
vi.mock("./accommodationForm", async () => {
  const actual = await vi.importActual<any>("./accommodationForm");
  return { ...actual, useAccommodationForm: () => ({ data: state.existing, isLoading: false }), useSubmitAccommodationForm: () => ({ mutateAsync: state.mutate, isPending: false }) };
});
vi.mock("./prefillQueries", () => ({ useAccommodationCustomer: () => ({ data: state.customer, isLoading: false }), useAccommodationPets: () => ({ data: state.records, isLoading: false }) }));
vi.mock("@/features/uploads/PetAttachments", () => ({ PetAttachments: () => null }));
vi.mock("./GuidelinesSection", () => ({ GuidelinesSection: () => null }));
vi.mock("./HotelPetChecks", () => ({ HotelPetChecks: () => null }));
vi.mock("@/features/uploads/snapQueries", () => ({ usePetAttachmentStatus: () => ({ data: {} }) }));

const props = { bookingId: "booking-1", tenantId: "tenant-1", customerId: "owner-1", pets: [{ id: "pet-1", name: "Dog" }] };
describe("Hotel intake saves", () => {
  beforeEach(() => { state.existing.payload = null; state.mutate.mockReset(); state.mutate.mockImplementation(async (payload) => { state.saved = payload; }); });
  it("prefills emergency and vet records and saves partial staff intake without fabricating consent", async () => {
    render(<HotelIntakeEditor {...props} />);
    fireEvent.click(await screen.findByRole("button", { name: /Emergency contact/ }));
    const field = screen.getByDisplayValue("Emergency");
    fireEvent.change(field, { target: { value: "Updated emergency" } });
    fireEvent.click(screen.getByRole("button", { name: "Save intake" }));
    await waitFor(() => expect(state.mutate).toHaveBeenCalledTimes(1));
    expect(state.saved.emergency_contact.full_name).toBe("Updated emergency");
    expect(state.saved.vet.vet_name).toBe("Vet");
    expect(state.saved.acknowledgement).toEqual({ accepted: false, signed_name: "", signed_at: "", signed_place: "" });
    expect(state.saved.pets[0].pet_id).toBe("pet-1");
    expect(state.saved.pickup_required).toBe(true);
    expect(state.saved.check_out_window).toBe("Stay & Play 16:00–16:30");
    expect(state.saved.feeding_instructions).toBe("Existing feeding notes");
  });
});