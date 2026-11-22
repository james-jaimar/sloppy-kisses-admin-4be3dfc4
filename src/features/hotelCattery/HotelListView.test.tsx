import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { HotelListView } from "./HotelListView";

const fixtures = vi.hoisted(() => ({ bookings: [] as any[], invoices: [] as any[], or: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ supabase: { from: (table: string) => {
  const result = { data: table === "bookings" ? fixtures.bookings : table === "invoices" ? fixtures.invoices : [], error: null };
  const chain: any = { then: (resolve: any) => Promise.resolve(result).then(resolve) };
  for (const method of ["select", "eq", "in", "gte", "lt", "order", "neq"]) chain[method] = () => chain;
  chain.or = (value: string) => { fixtures.or(value); return chain; };
  return chain;
} } }));

afterEach(() => { vi.useRealTimers(); fixtures.or.mockClear(); fixtures.invoices = []; Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView"); });

it("switches to today's arrivals and earlier-month departures without showing in-house guests", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-11T05:37:00Z"));
  fixtures.bookings = [
    { id: "arrives", start_at: "2026-11-11T07:00:00Z", end_at: "2026-11-20T08:00:00Z", status: "confirmed", customer: { full_name: "Incoming owner" }, hotel_booking_details: { check_in_window: "09:00–11:00" } },
    { id: "leaves", start_at: "2026-10-30T07:00:00Z", end_at: "2026-11-11T14:00:00Z", status: "checked_in", customer: { full_name: "Outgoing owner" }, hotel_booking_details: { check_out_window: "16:00–17:00", grooming_required: true } },
    { id: "stays", start_at: "2026-11-04T07:00:00Z", end_at: "2026-11-19T14:00:00Z", status: "checked_in", customer: { full_name: "Mid-stay owner" } },
    { id: "cancelled", start_at: "2026-11-11T07:00:00Z", end_at: null, status: "cancelled", customer: { full_name: "Cancelled owner" } },
  ];
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><HotelListView tenantId="tenant-1" showCancelled={false} /></MemoryRouter></QueryClientProvider>);
  fireEvent.click(within(screen.getByRole("group", { name: "List period" })).getByRole("button", { name: "Today" }));
  await screen.findByRole("link", { name: "Outgoing owner" });
  expect(screen.queryByRole("link", { name: "Mid-stay owner" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Cancelled owner" })).toBeNull();
  expect(fixtures.or).toHaveBeenCalledWith("end_at.gte.2026-11-10T22:00:00.000Z,end_at.is.null");
  fireEvent.click(screen.getByRole("button", { name: "Departures (1)" }));
  await waitFor(() => expect(screen.queryByRole("link", { name: "Incoming owner" })).toBeNull());
  expect(screen.getByRole("link", { name: "Outgoing owner" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Arrivals (1)" }));
  expect(screen.getByRole("link", { name: "Incoming owner" })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Outgoing owner" })).toBeNull();
});

async function renderRegister() {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-22T18:31:00Z"));
  fixtures.bookings = [
    { id: "dog", start_at: "2026-10-30T07:00:00Z", end_at: "2026-11-24T14:00:00Z", status: "checked_in", customer: { full_name: "Zelda" }, booking_pets: [{ pet: { name: "Alfie", breed: "Poodle", species: "dog" } }], hotel_booking_details: { grooming_required: true } },
    { id: "cat", start_at: "2026-11-23T07:00:00Z", end_at: "2026-11-23T14:00:00Z", status: "confirmed", customer: { full_name: "Alice" }, booking_pets: [{ pet: { name: "Zorro", breed: "Siamese", species: "cat" } }] },
    { id: "draft", start_at: "2026-11-25T07:00:00Z", end_at: "2026-11-26T14:00:00Z", status: "confirmed", customer: { full_name: "Bob" }, booking_pets: [{ pet: { name: "Rex", breed: "Terrier", species: "dog" } }] },
  ];
  fixtures.invoices = [
    { id: "inv-dog", booking_id: "dog", balance_due: 150, amount_paid: 350, total: 500, status: "part_paid", invoice_number: "INV-1" },
    { id: "inv-cat", booking_id: "cat", balance_due: 0, amount_paid: 500, total: 500, status: "paid", invoice_number: "INV-2" },
    { id: "inv-draft", booking_id: "draft", balance_due: 500, amount_paid: 0, total: 500, status: "draft", invoice_number: "INV-3" },
  ];
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><HotelListView tenantId="tenant-1" showCancelled={false} /></MemoryRouter></QueryClientProvider>);
  await screen.findByRole("link", { name: "Zelda" });
}

it("searches client, pet and breed without excluding earlier-month stays", async () => {
  await renderRegister();
  for (const term of ["Zelda", "Alfie", "Poodle"]) {
    fireEvent.change(screen.getByRole("textbox", { name: "Search client, pet or breed" }), { target: { value: term } });
    expect(screen.getByRole("link", { name: "Zelda" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Alice" })).toBeNull();
  }
});

it("checkout grooming filters to stays with grooming requested", async () => {
  await renderRegister();
  fireEvent.click(screen.getByRole("checkbox", { name: "Checkout groom" }));
  expect(screen.getByRole("link", { name: "Zelda" })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Alice" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Bob" })).toBeNull();
});

it("balance filter includes R150 outstanding but not a paid or draft invoice", async () => {
  await renderRegister();
  fireEvent.click(screen.getByRole("checkbox", { name: "Balance owing" }));
  expect(screen.getByRole("link", { name: "Zelda" })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Alice" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Bob" })).toBeNull();
});

it("defaults the seven-day departure list to checkout order and reverses with Out", async () => {
  await renderRegister();
  fireEvent.click(screen.getByRole("button", { name: "Next 7 days" }));
  await screen.findByRole("link", { name: "Zelda" });
  fireEvent.click(screen.getByRole("button", { name: /^Departures \(/ }));
  expect(screen.getAllByRole("link").filter(a => a.getAttribute("href")?.includes("/bookings/")).map(a => a.getAttribute("href"))).toEqual(["/admin/bookings/cat", "/admin/bookings/dog", "/admin/bookings/draft"]);
  fireEvent.click(screen.getByRole("button", { name: "Sort by Out" }));
  expect(screen.getAllByRole("link").filter(a => a.getAttribute("href")?.includes("/bookings/")).map(a => a.getAttribute("href"))).toEqual(["/admin/bookings/draft", "/admin/bookings/dog", "/admin/bookings/cat"]);
});

it("tomorrow includes the earlier-month departure only when checkout is tomorrow", async () => {
  await renderRegister();
  fireEvent.click(screen.getByRole("button", { name: "Tomorrow" }));
  await screen.findByRole("link", { name: "Alice" });
  fireEvent.click(screen.getByRole("button", { name: /^Departures \(/ }));
  expect(screen.getByRole("link", { name: "Alice" })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Zelda" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Bob" })).toBeNull();
});

it("species selection shows cats and clear filters restores all stays", async () => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  await renderRegister();
  fireEvent.keyDown(screen.getByRole("combobox", { name: "Pet species" }), { key: "Enter" });
  fireEvent.click(await screen.findByRole("option", { name: /^Cats$/ }));
  expect(screen.getByRole("link", { name: "Alice" })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Zelda" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Bob" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  expect(screen.getByRole("link", { name: "Zelda" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Bob" })).toBeInTheDocument();
});