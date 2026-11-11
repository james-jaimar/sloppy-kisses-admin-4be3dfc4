import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { HotelListView } from "./HotelListView";

const fixtures = vi.hoisted(() => ({ bookings: [] as any[], or: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ supabase: { from: (table: string) => {
  const result = { data: table === "bookings" ? fixtures.bookings : [], error: null };
  const chain: any = { then: (resolve: any) => Promise.resolve(result).then(resolve) };
  for (const method of ["select", "eq", "in", "gte", "lt", "order", "neq"]) chain[method] = () => chain;
  chain.or = (value: string) => { fixtures.or(value); return chain; };
  return chain;
} } }));

afterEach(() => { vi.useRealTimers(); fixtures.or.mockClear(); });

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
  expect(fixtures.or).toHaveBeenCalledWith("and(start_at.gte.2026-11-10T22:00:00.000Z,start_at.lt.2026-11-11T22:00:00.000Z),and(end_at.gte.2026-11-10T22:00:00.000Z,end_at.lt.2026-11-11T22:00:00.000Z)");
  fireEvent.click(screen.getByRole("button", { name: "Departures (1)" }));
  await waitFor(() => expect(screen.queryByRole("link", { name: "Incoming owner" })).toBeNull());
  expect(screen.getByRole("link", { name: "Outgoing owner" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Arrivals (1)" }));
  expect(screen.getByRole("link", { name: "Incoming owner" })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Outgoing owner" })).toBeNull();
});