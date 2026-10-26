import { describe, expect, it } from "vitest";
import { carrierNotice } from "./carrier";

describe("carrierNotice", () => {
  it("dog-only trips need no carrier", () => expect(carrierNotice([{ species: "dog" }, { species: "dog" }])).toBeNull());
  it("a cat needs a secure carrier", () => expect(carrierNotice([{ species: "cat" }])).toBe("cat"));
  it("cats travelling with dogs are flagged as a mixed load", () => expect(carrierNotice([{ species: "dog" }, { species: "cat" }])).toBe("mixed"));
});
