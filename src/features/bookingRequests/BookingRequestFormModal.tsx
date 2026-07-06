import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Search } from "lucide-react";
import { ModalShell } from "@/components/modals/ModalShell";
import { useCustomers, useCustomerPets } from "@/features/customers/queries";
import {
  useCreateBookingRequest,
  type BookingRequestServiceType,
  type BookingRequestSource,
} from "./queries";

const SERVICE_TYPES: { value: BookingRequestServiceType; label: string }[] = [
  { value: "daycare", label: "Daycare" },
  { value: "daycare_assessment", label: "Daycare assessment" },
  { value: "hotel_dog", label: "Hotel — dog" },
  { value: "hotel_cat", label: "Hotel — cat" },
  { value: "grooming_inhouse", label: "Grooming (in-house)" },
  { value: "grooming_mobile", label: "Grooming (mobile)" },
  { value: "pickup_dropoff", label: "Pickup / drop-off" },
];

const SOURCES: { value: BookingRequestSource; label: string }[] = [
  { value: "staff_capture", label: "Staff capture" },
  { value: "phone", label: "Phone" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "Email" },
  { value: "website_form", label: "Website form" },
  { value: "customer_portal", label: "Customer portal" },
];

interface Props {
  tenantId: string;
  onClose: () => void;
  onCreated?: (id: string) => void;
}

export function BookingRequestFormModal({ tenantId, onClose, onCreated }: Props) {
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [petId, setPetId] = useState<string | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [serviceType, setServiceType] = useState<BookingRequestServiceType>("daycare");
  const [source, setSource] = useState<BookingRequestSource>("staff_capture");
  const [preferredStart, setPreferredStart] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");
  const [adminNotes, setAdminNotes] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(customerSearch), 250);
    return () => clearTimeout(t);
  }, [customerSearch]);

  const customersQ = useCustomers({ tenantId, search: debouncedSearch, pageSize: 25 });
  const petsQ = useCustomerPets(customerId, tenantId);
  const create = useCreateBookingRequest(tenantId);

  const selectedCustomer = useMemo(
    () => customersQ.data?.rows.find((c) => c.id === customerId) ?? null,
    [customersQ.data, customerId],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customerId) {
      toast.error("Please select a customer");
      return;
    }
    try {
      const created = await create.mutateAsync({
        customer_id: customerId,
        pet_id: petId,
        service_type: serviceType,
        source,
        preferred_start_at: preferredStart ? new Date(preferredStart).toISOString() : null,
        preferred_end_at: null,
        customer_notes: customerNotes.trim() || null,
        admin_notes: adminNotes.trim() || null,
      });
      toast.success("Booking request created");
      onCreated?.(created.id);
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to create request");
    }
  }

  return (
    <ModalShell
      wide
      title="New booking request"
      subtitle="Capture a request received by phone, WhatsApp, email or in person."
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-6 p-6">
        <div>
          <div className="mb-1 text-sm font-medium">Customer</div>
          {selectedCustomer ? (
            <div className="flex items-center justify-between rounded-lg border border-border bg-sk-surface-muted px-3 py-2 text-sm">
              <div>
                <div className="font-medium">{selectedCustomer.full_name ?? "Unnamed"}</div>
                <div className="text-xs text-muted-foreground">
                  {selectedCustomer.customer_number} · {selectedCustomer.email ?? "—"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCustomerId(null);
                  setPetId(null);
                }}
                className="text-xs text-sk-coral-dark hover:underline"
              >
                Change
              </button>
            </div>
          ) : (
            <div className="rounded-lg border border-border">
              <div className="relative border-b border-border">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  autoFocus
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  placeholder="Search customer by name or number..."
                  className="h-10 w-full rounded-t-lg bg-white pl-9 pr-3 text-sm outline-none"
                />
              </div>
              <ul className="max-h-56 overflow-y-auto">
                {customersQ.isLoading && (
                  <li className="px-3 py-2 text-sm text-muted-foreground">Loading…</li>
                )}
                {!customersQ.isLoading && (customersQ.data?.rows.length ?? 0) === 0 && (
                  <li className="px-3 py-2 text-sm text-muted-foreground">No customers found.</li>
                )}
                {customersQ.data?.rows.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setCustomerId(c.id);
                        setPetId(null);
                      }}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-sk-surface-muted"
                    >
                      <div>
                        <div className="font-medium">{c.full_name ?? "Unnamed"}</div>
                        <div className="text-xs text-muted-foreground">
                          {c.customer_number} · {c.email ?? c.mobile ?? "—"}
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {c.pet_count} pet{c.pet_count === 1 ? "" : "s"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {customerId && (
          <div>
            <div className="mb-1 text-sm font-medium">Pet (optional)</div>
            <select
              value={petId ?? ""}
              onChange={(e) => setPetId(e.target.value || null)}
              className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-sk-coral/40"
            >
              <option value="">— No specific pet —</option>
              {petsQ.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.pet_number ? `(${p.pet_number})` : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-1 text-sm font-medium">Service type</div>
            <select
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value as BookingRequestServiceType)}
              className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-sk-coral/40"
            >
              {SERVICE_TYPES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="mb-1 text-sm font-medium">Source</div>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value as BookingRequestSource)}
              className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-sk-coral/40"
            >
              {SOURCES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <div className="mb-1 text-sm font-medium">Preferred date / time</div>
          <input
            type="datetime-local"
            value={preferredStart}
            onChange={(e) => setPreferredStart(e.target.value)}
            className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-sk-coral/40"
          />
        </div>

        <div>
          <div className="mb-1 text-sm font-medium">Customer message</div>
          <textarea
            value={customerNotes}
            onChange={(e) => setCustomerNotes(e.target.value)}
            rows={3}
            placeholder="What the customer asked for..."
            className="w-full rounded-lg border border-border bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-sk-coral/40"
          />
        </div>

        <div>
          <div className="mb-1 text-sm font-medium">Internal notes</div>
          <textarea
            value={adminNotes}
            onChange={(e) => setAdminNotes(e.target.value)}
            rows={2}
            placeholder="Only visible to staff..."
            className="w-full rounded-lg border border-border bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-sk-coral/40"
          />
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={create.isPending || !customerId}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-sk-coral px-4 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-60"
          >
            {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Create request
          </button>
        </div>
      </form>
    </ModalShell>
  );
}