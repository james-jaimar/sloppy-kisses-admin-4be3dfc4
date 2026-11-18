import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RecordPaymentDialog } from "./RecordPaymentDialog";
const state = vi.hoisted(() => ({ mutate: vi.fn(), allowed: true, error: false }));
vi.mock("@/lib/tenant/TenantContext", () => ({ useCurrentUser: () => ({ hasPermission: () => state.allowed }) }));
vi.mock("./queries", () => ({
 useRecordPayment: () => ({ mutateAsync: state.mutate, isPending: false }),
 usePaymentMethods: () => ({ data: [{ code: "eft", label: "EFT" }, { code: "yoko", label: "Yoco card" }] }),
 useCustomerOpenInvoices: () => ({ data: [{ id: "one", invoice_number: "INV1", balance_due: 250 }], isError: state.error, isFetching: false, isLoading: false }),
}));
describe("booking payment shortcut", () => {
 beforeEach(() => { cleanup(); state.allowed = true; state.error = false; state.mutate.mockReset(); state.mutate.mockResolvedValue(undefined); });
 const open = () => render(<RecordPaymentDialog tenantId="tenant" invoiceId="one" customerId="customer" suggested={250} onClose={() => {}} onDone={() => {}} />);
 it("records a partial payment against the preselected invoice", async () => {
  open(); fireEvent.change(screen.getByLabelText("Amount (ZAR)"), { target: { value: "100" } }); fireEvent.click(screen.getByRole("button", { name: "Record" }));
  await waitFor(() => expect(state.mutate).toHaveBeenCalledWith(expect.objectContaining({ invoice_id: "one", customer_id: "customer", amount: 100, payment_method: "eft" })));
 });
 it("records Yoco manually without a terminal request", async () => {
  open(); fireEvent.click(screen.getByRole("radio", { name: "Yoco card" })); fireEvent.click(screen.getByRole("button", { name: "Record" }));
  await waitFor(() => expect(state.mutate).toHaveBeenCalledWith(expect.objectContaining({ amount: 250, payment_method: "yoko" })));
 });
 it("prevents recording without the existing payment permission", () => { state.allowed = false; open(); expect(screen.getByRole("button", { name: "Record" })).toBeDisabled(); });
 it("prevents recording when invoice reads fail", () => { state.error = true; open(); expect(screen.getByRole("button", { name: "Record" })).toBeDisabled(); });
});
