import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { quoteAcceptanceToken } from "./quote-link.ts";
Deno.test("booking-linked estimates retain their anonymous acceptance token", () => {
  assertEquals(quoteAcceptanceToken("estimate", "quote-token"), "quote-token");
});
Deno.test("legacy pro formas cannot be accepted as new quotes", () => {
  assertEquals(quoteAcceptanceToken("proforma", "quote-token"), null);
});