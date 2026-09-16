import { useState } from "react";
import { CalendarDays, Lock, Receipt, User, X } from "lucide-react";
import { CustomerCombobox, type CustomerOption } from "@/components/customers/CustomerCombobox";
import { useCustomerBillingSnapshot, useCustomerTodayBookings } from "./queries";

interface Props {
  tenantId: string;
  customerId: string;
  onClose: () => void;
  /** Start a fresh sale for this customer (no invoice attached). */
  onPick: (id: string | null, customer: CustomerOption | null) => void;
  /** Add this sale onto an existing invoice. */
  onAttach: (invoice: { id: string; invoice_number: string; balance_due: number }, customer: CustomerOption | null) => void;
}

const SERVICE_LABEL: Record<string, string> = {
  daycare: "Daycare",
  daycare_assessment: "Daycare assessment",
  hotel_dog: "Hotel",
  hotel_cat: "Cattery",
  grooming_inhouse: "Grooming",
  grooming_mobile: "Mobile grooming",
  pickup_dropoff: "Transport",
};

export default function CustomerSalePanel({ tenantId, customerId, onClose, onPick, onAttach }: Props) {
  const [selectedId, setSelectedId] = useState<string>(customerId || "");
  const [selected, setSelected] = useState<CustomerOption | null>(null);

  const invoicesQ = useCustomerBillingSnapshot(tenantId, selectedId || null);
  const bookingsQ = useCustomerTodayBookings(tenantId, selectedId || null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-6" onClick={onClose}>
      <div
        className="flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h2 className="text-lg font-semibold">Who is this sale for?</h2>
            <p className="text-xs text-muted-foreground">Find the customer to see what they already owe.</p>
          </div>
          <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-xl border border-border" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          {/* Search */}
          <div className="flex min-h-0 flex-col gap-3 overflow-y-auto border-b border-border p-4 md:w-[380px] md:border-b-0 md:border-r">
            <CustomerCombobox
              tenantId={tenantId}
              value={selectedId || null}
              inline
              autoFocus
              placeholder="Search name, number, email or mobile…"
              initialCustomer={selected}
              onChange={(id, c) => {
                setSelectedId(id ?? "");
                setSelected(c);
              }}
            />
            <button
              onClick={() => onPick(null, null)}
              className="mt-auto h-12 w-full shrink-0 rounded-xl border border-border text-sm font-semibold"
            >
              Walk-in (cash sale)
            </button>
          </div>

          {/* Their account */}
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {!selectedId && (
              <div className="grid h-full place-items-center px-6 text-center text-sm text-muted-foreground">
                <div>
                  <User className="mx-auto mb-3 h-8 w-8 opacity-40" />
                  Search for the customer on the left — their open bills and today's bookings show up here.
                </div>
              </div>
            )}

            {selectedId && (
              <div className="space-y-6">
                <section>
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <CalendarDays className="h-4 w-4" /> Today
                  </h3>
                  {bookingsQ.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
                  {!bookingsQ.isLoading && (bookingsQ.data ?? []).length === 0 && (
                    <p className="text-sm text-muted-foreground">Nothing booked today.</p>
                  )}
                  <div className="space-y-1">
                    {(bookingsQ.data ?? []).map((b) => (
                      <div key={b.id} className="rounded-xl border border-border px-3 py-2 text-sm">
                        <span className="font-medium">{SERVICE_LABEL[b.service_type] ?? b.service_type}</span>
                        {b.pets.length > 0 && <span className="text-muted-foreground"> · {b.pets.join(", ")}</span>}
                        <span className="text-muted-foreground"> · {b.status.replace(/_/g, " ")}</span>
                      </div>
                    ))}
                  </div>
                </section>

                <section>
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <Receipt className="h-4 w-4" /> Open bills
                  </h3>
                  {invoicesQ.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
                  {!invoicesQ.isLoading && (invoicesQ.data ?? []).length === 0 && (
                    <p className="text-sm text-muted-foreground">Nothing outstanding.</p>
                  )}
                  <div className="space-y-2">
                    {(invoicesQ.data ?? []).map((inv) => (
                      <div
                        key={inv.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-3 py-3"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-semibold">{inv.invoice_number}</div>
                          <div className="text-xs text-muted-foreground">
                            {inv.what || "Services"} · {inv.issue_date ? new Date(inv.issue_date).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                          </div>
                          {!inv.editable && (
                            <div className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <Lock className="h-3 w-3" /> Already sent to the customer — ring this up as a separate sale
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <div className="text-base font-bold tabular-nums">R {inv.balance_due.toFixed(2)}</div>
                            <div className="text-[11px] text-muted-foreground">due</div>
                          </div>
                          {inv.editable && (
                            <button
                              onClick={() => onAttach({ id: inv.id, invoice_number: inv.invoice_number, balance_due: inv.balance_due }, selected)}
                              className="h-11 rounded-xl bg-sk-coral px-4 text-sm font-semibold text-white"
                            >
                              Add sale to this bill
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <button
                  onClick={() => onPick(selectedId, selected)}
                  className="h-12 w-full rounded-xl border border-border text-sm font-semibold"
                >
                  Start a new sale for this customer
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
