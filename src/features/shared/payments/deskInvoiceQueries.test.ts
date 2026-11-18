import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchBookingInvoices } from "./deskInvoiceQueries";
const mock = vi.hoisted(() => ({ responses: [] as any[], tenants: [] as string[] }));
vi.mock("@/lib/supabase/client", () => ({ supabase: { from: () => { const response = mock.responses.shift(); const chain: any = { select: () => chain, eq: (key: string, value: string) => { if (key === "tenant_id") mock.tenants.push(value); return chain; }, in: () => Promise.resolve(response) }; return chain; } } }));
vi.mock("@/lib/tenant/TenantContext", () => ({ useCurrentUser: () => ({}) }));
const ok = (data: any[]) => ({ data, error: null });
describe("desk invoice link resolution", () => {
 beforeEach(() => { mock.responses = []; mock.tenants = []; });
 it("resolves both link paths once and recognises shared invoices", async () => {
  mock.responses = [ok([{ id: "visit", invoice_id: "invoice" }]), ok([{ booking_id: "visit", invoice_id: "invoice" }, { booking_id: "visit", invoice_id: "extra" }]), ok([{ id: "invoice", status: "sent", balance_due: 250, total: 500 }, { id: "extra", status: "sent", balance_due: 100, total: 100 }]), ok([{ invoice_id: "invoice", booking_id: "visit" }, { invoice_id: "invoice", booking_id: "other" }]), ok([{ id: "visit", invoice_id: "invoice" }])];
  const result = await fetchBookingInvoices("tenant", ["visit"]);
  expect(result.visit.map(i => i.id)).toEqual(["invoice", "extra"]);
  expect(result.visit[0].shared).toBe(true);
  expect(mock.tenants).toEqual(["tenant", "tenant", "tenant", "tenant", "tenant"]);
 });
 it("does not present inaccessible linked invoices as an empty paid visit", async () => {
  mock.responses = [ok([{ id: "visit", invoice_id: "missing" }]), ok([]), ok([]), ok([]), ok([])];
  await expect(fetchBookingInvoices("tenant", ["visit"])).rejects.toThrow("linked invoices are unavailable");
 });
 it("returns an explicit empty set only for a real unlinked booking", async () => {
  mock.responses = [ok([{ id: "visit", invoice_id: null }]), ok([])];
  expect(await fetchBookingInvoices("tenant", ["visit"])).toEqual({ visit: [] });
 });
});
