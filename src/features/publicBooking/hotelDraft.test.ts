import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearHotelDraft, matchDraftPets, readHotelDraft, saveHotelDraft, type HotelDraft } from "./hotelDraft";

const draft: HotelDraft = {
  version: 1, tenantId: "sloppy-kisses", checkIn: "2026-10-26", nights: 7,
  pets: [ { name: "Bella", species: "dog", size: "small", breed: "", accommodation: "hotel" }, { name: "Max", species: "dog", size: "large", breed: "", accommodation: "suite" } ],
  addons: { walk: 2, stay_play: 1 }, transport: { pickup: true, dropoff: false }, notes: "Bring own food",
};

describe("hotel sign-in draft", () => {
  beforeEach(() => { sessionStorage.clear(); vi.useRealTimers(); });
  it("retains dates, both pets, extras, transport and notes through navigation", () => {
    saveHotelDraft(draft);
    expect(readHotelDraft("sloppy-kisses")).toMatchObject(draft);
  });
  it("does not import another business's draft", () => {
    saveHotelDraft(draft);
    expect(readHotelDraft("other-business")).toBeNull();
  });
  it("maps by name and species rather than saved-pet order", () => {
    expect(matchDraftPets(draft.pets, [{ id: "max", name: "Max", species: "dog" }, { id: "bella", name: " BELLA ", species: "dog" }]).matches).toEqual([
      { id: "bella", accommodation: "hotel" }, { id: "max", accommodation: "suite" },
    ]);
  });
  it("requires a choice for ambiguous or missing pets", () => {
    expect(matchDraftPets(draft.pets, [{ id: "a", name: "Bella", species: "dog" }, { id: "b", name: "Bella", species: "dog" }])).toEqual({ matches: [], unmatched: ["Bella", "Max"] });
  });
  it("clears a completed draft", () => {
    saveHotelDraft(draft); clearHotelDraft(); expect(readHotelDraft()).toBeNull();
  });
  it("expires rather than restoring old personal details", () => {
    vi.useFakeTimers(); saveHotelDraft(draft); vi.advanceTimersByTime(2 * 60 * 60 * 1000 + 1);
    expect(readHotelDraft()).toBeNull();
  });
});