import { cleanup, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HotelPetChecks } from "./HotelPetChecks";
const actions = vi.hoisted(() => ({ photo: vi.fn(), vaccination: vi.fn(), attachments: vi.fn(), records: vi.fn() }));
vi.mock("@/lib/tenant/TenantContext", () => ({ useCurrentUser: () => ({ hasPermission: () => true }) }));
vi.mock("@/features/pets/photoGateQueries", () => ({ useBookingPhotoGate: () => ({ data: [{ pet_id: "dog-1", status: "waived" }] }) }));
vi.mock("@/features/pets/vaccinationGate", () => ({ useBookingVaccinationGate: () => ({ data: [{ pet_id: "dog-1", vaccine_type: "rabies", status: "missing" }] }), VAX_STATUS_LABEL: { missing: "Missing" } }));
vi.mock("@/features/pets/PhotoWaiverQuickAction", () => ({ PhotoWaiverQuickAction: (props: any) => { actions.photo(props); return null; } }));
vi.mock("@/features/pets/VaxWaiverQuickAction", () => ({ VaxWaiverQuickAction: (props: any) => { actions.vaccination(props); return null; } }));
vi.mock("@/features/uploads/PetAttachments", () => ({ PetAttachments: (props: any) => { actions.attachments(props); return <>{props.photoAction}{props.vaccinationAction}</>; } }));
vi.mock("@/features/pets/PetVaccinationsPanel", () => ({ PetVaccinationsPanel: (props: any) => { actions.records(props); return null; } }));
vi.mock("@/features/pets/PetHealthPanel", () => ({ PetHealthPanel: () => null }));
describe("Hotel per-pet checks", () => {
  beforeEach(() => { cleanup(); vi.clearAllMocks(); });
  it("keeps photo and vaccination waiver actions independently bound to this pet", () => {
    render(<HotelPetChecks bookingId="stay-1" tenantId="tenant-1" petId="dog-1" petName="Dog" portal={false} species="dog" />);
    expect(actions.photo).toHaveBeenCalledWith({ petId: "dog-1", petName: "Dog" });
    expect(actions.vaccination).toHaveBeenCalledWith({ petId: "dog-1", petName: "Dog" });
    expect(actions.records.mock.calls[0][0]).toMatchObject({ petId: "dog-1", species: "dog", uploadedVia: "admin" });
  });
  it("does not expose staff waiver mutations to the customer", () => {
    render(<HotelPetChecks bookingId="stay-1" tenantId="tenant-1" petId="dog-1" petName="Dog" portal species="dog" />);
    expect(actions.photo).not.toHaveBeenCalled();
    expect(actions.vaccination).not.toHaveBeenCalled();
    expect(actions.attachments.mock.calls[0][0].uploadedVia).toBe("portal");
  });
});