import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HotelExtrasPanel } from "./HotelExtrasPanel";

vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: [], isLoading: false }) }));
vi.mock("@/features/settings/hotelRateCardQueries", () => ({
  SIZE_BAND_ORDER: ["small", "medium", "large"],
  useHotelRateCards: () => ({ data: [] }),
  useHotelSurcharges: () => ({ data: [{ id: "walk", name: "Walk", code: "walk", price_zar: 100, per_night: true }] }),
  useBookingHotelSurcharges: () => ({ data: [] }),
}));
vi.mock("@/features/hotelCattery/queries", () => ({ useHotelWorkflowSettings: () => ({ data: {} }) }));

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const dog = { id: "dog1", name: "Dog one", species: "dog", size: null };
const secondDog = { ...dog, id: "dog2", name: "Dog two" };
const cat = { ...dog, id: "cat", species: "cat" };
describe("staff pet-change decision", () => {
  function setup(accept: boolean) {
    const prompt = vi.spyOn(window, "confirm").mockReturnValue(accept);
    const change = vi.fn();
    const props = { tenantId: "tenant", bookingId: "booking", species: "dog" as const, accommodationType: "hotel", onAccommodationChange: vi.fn(), startAt: null, endAt: null, petCount: 1, selection: [{ surcharge_id: "walk", quantity: 11, quantity_basis: "total" as const }], onSelectionChange: change };
    const view = render(<HotelExtrasPanel {...props} selectedPets={[dog]} />);
    return { prompt, change, props, view };
  }
  it("applies the offered 22 total walks after staff agree", () => {
    const { view, props, prompt, change } = setup(true);
    view.rerender(<HotelExtrasPanel {...props} petCount={2} selectedPets={[dog, secondDog]} />);
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(change).toHaveBeenLastCalledWith([{ surcharge_id: "walk", quantity: 22, quantity_basis: "total" }]);
  });
  it("keeps 11 total walks when staff decline rescaling", () => {
    const { view, props, change } = setup(false);
    view.rerender(<HotelExtrasPanel {...props} petCount={2} selectedPets={[dog, secondDog]} />);
    expect(change).toHaveBeenLastCalledWith([{ surcharge_id: "walk", quantity: 11, quantity_basis: "total" }]);
  });
  it("does not offer more walks when the added pet is a cat", () => {
    const { view, props, prompt } = setup(true);
    view.rerender(<HotelExtrasPanel {...props} petCount={2} selectedPets={[dog, cat]} />);
    expect(prompt).not.toHaveBeenCalled();
  });
});