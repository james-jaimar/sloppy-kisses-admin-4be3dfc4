import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import PublicQuotePage from "./PublicQuotePage";

vi.mock("@/lib/supabase/client", () => ({ supabase: { rpc: vi.fn().mockResolvedValue({ data: {
  quote: { estimate_number: "TEST", service_type: "hotel_dog", total: 2450 },
  items: [], pets: [{ id: "pet", name: "Dog" }], tenant: { name: "Sloppy Kisses" },
  customer: { full_name: "Customer" }, accepted: false, expired: false,
}, error: null }) } }));

afterEach(() => vi.unstubAllGlobals());

it("accepts a hotel quote using its public token without requesting login", async () => {
  const fetchQuote = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, invoice_number: null, portal: { activated: false } }) });
  vi.stubGlobal("fetch", fetchQuote);
  render(<MemoryRouter initialEntries={["/q/public-token"]}><Routes><Route path="/q/:token" element={<PublicQuotePage />} /></Routes></MemoryRouter>);
  fireEvent.click(await screen.findByRole("button", { name: "Yes, I accept this quote" }));
  await waitFor(() => expect(fetchQuote).toHaveBeenCalledOnce());
  const [url, options] = fetchQuote.mock.calls[0];
  expect(url).toContain("/functions/v1/public-quote-accept");
  expect(JSON.parse(options.body)).toEqual({ token: "public-token" });
  expect(options.headers).toEqual({ "Content-Type": "application/json" });
  await screen.findByRole("heading", { name: "Thank you — quote accepted" });
});