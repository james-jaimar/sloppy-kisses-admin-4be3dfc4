import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BookingInvoicePanel } from "./BookingInvoicePanel";
const state = vi.hoisted(() => ({ invoice: null as any }));
vi.mock("@/features/invoices/queries", () => ({ useBookingInvoice: () => ({ data: { invoice: state.invoice } }) }));
vi.mock("@/lib/tenant/TenantContext", () => ({ useCurrentUser: () => ({ hasPermission: () => true }) }));
vi.mock("@/features/invoices/NewInvoiceDrawer", () => ({ NewInvoiceDrawer: () => null }));
const props = { tenantId: "tenant", bookingId: "booking", customerId: "customer" };
describe("Hotel invoice access", () => {
  beforeEach(() => { cleanup(); state.invoice = null; });
  it("offers no independent invoice creation before hotel confirmation", () => {
    render(<MemoryRouter><BookingInvoicePanel {...props} existingOnly /></MemoryRouter>);
    expect(screen.queryByRole("button", { name: /Create invoice/ })).toBeNull();
  });
  it("shows an existing hotel invoice as an invoice link", () => {
    state.invoice = { id: "inv-1", invoice_number: "INV-123", status: "issued", total: 1000, balance_due: 500 };
    render(<MemoryRouter><BookingInvoicePanel {...props} existingOnly /></MemoryRouter>);
    expect(screen.getByRole("link", { name: /INV-123/ }).getAttribute("href")).toBe("/admin/invoices/inv-1");
    expect(screen.queryByRole("button", { name: /Create invoice/ })).toBeNull();
  });
  it("preserves other services' manual invoicing workflow", () => {
    render(<MemoryRouter><BookingInvoicePanel {...props} /></MemoryRouter>);
    expect(screen.getByRole("button", { name: /Create invoice/ })).toBeEnabled();
  });
});