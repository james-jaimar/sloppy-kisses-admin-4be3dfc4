import { describe, expect, it } from "vitest";
import { checklistFromReadiness, hotelReadiness } from "./intakeReadiness";
import { emptyPet, type AccommodationFormPayload } from "./accommodationForm";

const base = (): AccommodationFormPayload => ({
  owner: { full_name: "Owner", id_number: "", email: "", mobile: "+27123", home_address: "" },
  emergency_contact: { full_name: "Em", relationship: "", mobile: "+27999", alt_number: "" },
  vet: { vet_name: "Vet", contact_number: "011", has_medical_aid: false, policy_details: "" },
  check_in_window: "", check_out_window: "", pickup_required: false, dropoff_required: false, collection_address: "",
  pets: [{ ...emptyPet("p1", "Rex"), tick_flea_product: "Bravecto", tick_flea_date: "2026-10-01", feeding_instructions: "2 cups" }],
  belongings_notes: "", emergency_notes: "", additional_notes: "", attachments: [],
  acknowledgement: { accepted: true, signed_name: "Owner", signed_at: "", signed_place: "" },
});

describe("hotel readiness", () => {
  it("expired vaccination blocks the vaccinations check", () => {
    const items = hotelReadiness({ form: base(), vaxRows: [{ pet_id: "p1", status: "expired" }], photoRows: [] });
    expect(checklistFromReadiness(items, ["vaccinations"], {}).vaccinations).toBe(false);
  });
  it("a booking vaccination override passes vaccinations", () => {
    const items = hotelReadiness({ form: base(), vaxRows: [{ pet_id: "p1", status: "expired" }], vaxOverridden: true, photoRows: [] });
    expect(checklistFromReadiness(items, ["vaccinations"], {}).vaccinations).toBe(true);
  });
  it("a missing tick & flea treatment fails the care check", () => {
    const items = hotelReadiness({ form: base(), vaxRows: [], photoRows: [], tickRows: [{ pet_id: "p1", status: "missing" }] });
    expect(checklistFromReadiness(items, ["care"], {}).care).toBe(false);
  });
  it("an overdue tick & flea treatment also fails the care check", () => {
    const items = hotelReadiness({ form: base(), vaxRows: [], photoRows: [], tickRows: [{ pet_id: "p1", status: "overdue" }] });
    expect(checklistFromReadiness(items, ["care"], {}).care).toBe(false);
  });
  it("a recorded tick & flea treatment passes the care check", () => {
    const items = hotelReadiness({ form: base(), vaxRows: [], photoRows: [], tickRows: [{ pet_id: "p1", status: "ok" }] });
    expect(checklistFromReadiness(items, ["care"], {}).care).toBe(true);
  });
  it("a due tick & flea treatment still passes the care check", () => {
    const items = hotelReadiness({ form: base(), vaxRows: [], photoRows: [], tickRows: [{ pet_id: "p1", status: "due" }] });
    expect(checklistFromReadiness(items, ["care"], {}).care).toBe(true);
  });
  it("legacy form entries still count when no health rows are supplied", () => {
    const f = base(); f.pets[0].tick_flea_date = "";
    expect(checklistFromReadiness(hotelReadiness({ form: f, vaxRows: [], photoRows: [] }), ["care"], {}).care).toBe(false);
  });
  it("a missing photo does not block approval checks", () => {
    const c = checklistFromReadiness(hotelReadiness({ form: base(), vaxRows: [], photoRows: [{ pet_id: "p1", status: "missing" }] }), ["vaccinations", "owner_details", "care", "terms"], {});
    expect(Object.values(c).every(Boolean)).toBe(true);
  });
  it("unsigned terms fail and custom codes stay manual", () => {
    const f = base(); f.acknowledgement.accepted = false;
    const c = checklistFromReadiness(hotelReadiness({ form: f, vaxRows: [], photoRows: [] }), ["terms", "custom"], { custom: true });
    expect(c).toEqual({ terms: false, custom: true });
  });
});
