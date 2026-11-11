import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi, it, expect } from "vitest";
import { FullBillContent } from "./FullBillView";
const { single } = vi.hoisted(() => ({ single: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ single }) }) }) }) } }));
it("reads the saved full invoice and adds only unsaved retail before payment", async () => {
  single.mockResolvedValue({ data: { invoice_number: "INV00253", total: 1000, tax_total: 0, amount_paid: 75, balance_due: 925,
    invoice_items: [{ id: "groom", description: "Full Groom", quantity: 1, unit_price: 1000, line_total: 1000, sort_order: 0 }], payments: [{ id: "payment", amount: 75, payment_method: "cash", status: "received" }] }, error: null });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><FullBillContent tenantId="tenant" invoiceId="invoice" customerName="Customer" lines={[{ product: { id: "retail", name: "Bags O Wags", sell_price: 92, vat_rate: 15 } as any, qty: 1 }]} /></QueryClientProvider>);
  expect(await screen.findByText("Full Groom")).toBeInTheDocument();
  expect(screen.getByText("R 1017.00")).toBeInTheDocument();
  expect(screen.getByText("R 1092.00")).toBeInTheDocument();
  expect(screen.getByText("1 × Bags O Wags")).toBeInTheDocument();
});