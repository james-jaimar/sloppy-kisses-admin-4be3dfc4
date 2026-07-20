import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Search, AlertTriangle } from "lucide-react";
import { ModalShell } from "@/components/modals/ModalShell";
import { useCustomers, useCustomerPets } from "@/features/customers/queries";
import {
  useCreateBooking,
  useUpdateBooking,
  useResources,
  type BookingListRow,
  type ServiceType,
  type BookingStatus,
  type ResourceType,
} from "./queries";
import {
  serviceKind,
  useBookingServiceDetails,
  useResourceConflicts,
  useUpsertBookingDetails,
  type GroomingDetails,
  type HotelDetails,
  type TransportDetails,
} from "./detailsQueries";
import { GroomingFields, HotelFields, TransportFields } from "./BookingDetailsFields";
import { RecurrenceFields, DEFAULT_RECURRENCE, toRule, type RecurrenceValue } from "./RecurrenceFields";
import { useCreateRecurringBooking } from "./recurringQueries";
import { useConfirm } from "@/components/ui/confirm-dialog";

const SERVICE_TYPES: { value: ServiceType; label: string; resourceType?: ResourceType }[] = [
  { value: "daycare", label: "Daycare", resourceType: "daycare_area" },
  { value: "daycare_assessment", label: "Daycare assessment", resourceType: "daycare_area" },
  { value: "hotel_dog", label: "Hotel — dog", resourceType: "hotel_area" },
  { value: "hotel_cat", label: "Hotel — cat", resourceType: "cattery_area" },
  { value: "grooming_inhouse", label: "Grooming (in-house)", resourceType: "inhouse_grooming" },
  { value: "grooming_mobile", label: "Grooming (mobile)", resourceType: "mobile_van" },
  { value: "pickup_dropoff", label: "Pick up / drop-off", resourceType: "transport_vehicle" },
];

const STATUSES: BookingStatus[] = [
  "draft", "requested", "needs_info", "approved", "confirmed",
  "checked_in", "in_progress", "ready", "checked_out", "completed", "cancelled", "no_show",
];

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface Props {
  tenantId: string;
  onClose: () => void;
  onSaved?: (id: string) => void;
  booking?: BookingListRow | null; // if provided, edit mode
  prefill?: Partial<{
    customer_id: string;
    pet_ids: string[];
    service_type: ServiceType;
    start_at: string;
    booking_request_id: string;
  }>;
}

const inputCls = "h-10 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-sk-coral/40";

export function BookingFormModal({ tenantId, onClose, onSaved, booking, prefill }: Props) {
  const isEdit = Boolean(booking);
  const [customerId, setCustomerId] = useState<string | null>(
    booking?.customer_id ?? prefill?.customer_id ?? null,
  );
  const [petIds, setPetIds] = useState<string[]>(
    booking ? booking.booking_pets.map((bp) => bp.pet?.id ?? "").filter(Boolean) : prefill?.pet_ids ?? [],
  );
  const [customerSearch, setCustomerSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [serviceType, setServiceType] = useState<ServiceType>(
    booking?.service_type ?? prefill?.service_type ?? "daycare",
  );
  const [status, setStatus] = useState<BookingStatus>(booking?.status ?? "confirmed");
  const [startAt, setStartAt] = useState<string>(
    toLocalInput(booking?.start_at ?? prefill?.start_at ?? null),
  );
  const [endAt, setEndAt] = useState<string>(toLocalInput(booking?.end_at ?? null));
  const [resourceId, setResourceId] = useState<string | null>(booking?.resource_id ?? null);
  const [notesInternal, setNotesInternal] = useState(booking?.notes_internal ?? "");
  const [notesCustomer, setNotesCustomer] = useState(booking?.notes_customer ?? "");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(customerSearch), 250);
    return () => clearTimeout(t);
  }, [customerSearch]);

  const customersQ = useCustomers({ tenantId, search: debouncedSearch, pageSize: 25 });
  const petsQ = useCustomerPets(customerId, tenantId);

  // When creating a new booking, auto-select all of the chosen customer's pets
  // as soon as they load. Editing keeps the booking's existing pet selection.
  useEffect(() => {
    if (isEdit) return;
    if (!customerId) return;
    if (!petsQ.data) return;
    if (petIds.length > 0) return; // don't overwrite prefilled or user-toggled state
    if (petsQ.data.length === 0) return;
    setPetIds(petsQ.data.map((p) => p.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, petsQ.data, isEdit]);
  const resourcesQ = useResources(tenantId);
  const create = useCreateBooking(tenantId);
  const update = useUpdateBooking(tenantId);
  const upsertDetails = useUpsertBookingDetails(tenantId);
  const createRecurring = useCreateRecurringBooking(tenantId);

  // Service-typed details state
  const kind = serviceKind(serviceType);
  const [grooming, setGrooming] = useState<Partial<GroomingDetails>>({});
  const [hotel, setHotel] = useState<Partial<HotelDetails>>({});
  const [transport, setTransport] = useState<Partial<TransportDetails>>({});
  const [recurrence, setRecurrence] = useState<RecurrenceValue>(DEFAULT_RECURRENCE);

  // Load existing details when editing
  const detailsQ = useBookingServiceDetails(
    isEdit ? booking?.id ?? null : null,
    serviceType,
    tenantId,
  );
  useEffect(() => {
    if (!isEdit || !detailsQ.data) return;
    if (detailsQ.data.kind === "grooming" && detailsQ.data.data) setGrooming(detailsQ.data.data);
    if (detailsQ.data.kind === "hotel" && detailsQ.data.data) setHotel(detailsQ.data.data);
    if (detailsQ.data.kind === "transport" && detailsQ.data.data) setTransport(detailsQ.data.data);
  }, [isEdit, detailsQ.data]);

  // Resource conflict soft-check
  const startIso = startAt ? new Date(startAt).toISOString() : null;
  const endIso = endAt ? new Date(endAt).toISOString() : null;
  const conflictsQ = useResourceConflicts({
    tenantId,
    resourceId,
    startAt: startIso,
    endAt: endIso,
    excludeBookingId: booking?.id ?? null,
  });
  const conflicts = conflictsQ.data ?? [];

  const selectedCustomer = useMemo(() => {
    if (booking?.customer && booking.customer.id === customerId) return booking.customer;
    return customersQ.data?.rows.find((c) => c.id === customerId) ?? null;
  }, [customersQ.data, customerId, booking]);

  const resourceType = SERVICE_TYPES.find((s) => s.value === serviceType)?.resourceType;
  const filteredResources = (resourcesQ.data ?? []).filter(
    (r) => !resourceType || r.type === resourceType,
  );
  const confirm = useConfirm();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customerId) return toast.error("Please select a customer");
    if (!startAt || !endAt) return toast.error("Please pick a start and end time");
    if (new Date(endAt) <= new Date(startAt)) return toast.error("End time must be after start time");
    if ((petsQ.data?.length ?? 0) > 0 && petIds.length === 0) {
      return toast.error("Select at least one pet for this booking");
    }

    if (conflicts.length > 0) {
      const proceed = await confirm({
        title: "Resource already booked in this window",
        description: `Overlaps with ${conflicts.map((c: any) => c.booking_number).join(", ")}. Save anyway?`,
        confirmLabel: "Save anyway",
        tone: "destructive",
      });
      if (!proceed) return;
    }

    try {
      if (isEdit && booking) {
        await update.mutateAsync({
          id: booking.id,
          patch: {
            service_type: serviceType,
            status,
            start_at: new Date(startAt).toISOString(),
            end_at: new Date(endAt).toISOString(),
            resource_id: resourceId,
            notes_internal: notesInternal.trim() || null,
            notes_customer: notesCustomer.trim() || null,
          },
          pet_ids: petIds,
        });
        await saveDetails(booking.id);
        toast.success("Booking updated");
        onSaved?.(booking.id);
      } else {
        const rule = toRule(recurrence);
        if (rule) {
          const res = await createRecurring.mutateAsync({
            customer_id: customerId,
            pet_ids: petIds,
            service_type: serviceType,
            status,
            start_at: new Date(startAt).toISOString(),
            end_at: new Date(endAt).toISOString(),
            resource_id: resourceId,
            notes_internal: notesInternal.trim() || null,
            notes_customer: notesCustomer.trim() || null,
            booking_request_id: prefill?.booking_request_id ?? null,
            rule,
          });
          // Persist service-typed details for every occurrence.
          for (const b of res.bookings) {
            await saveDetails(b.id);
          }
          toast.success(`Created ${res.bookings.length} bookings in series`);
          onSaved?.(res.bookings[0]?.id);
          onClose();
          return;
        }
        const res = await create.mutateAsync({
          customer_id: customerId,
          pet_ids: petIds,
          service_type: serviceType,
          status,
          start_at: new Date(startAt).toISOString(),
          end_at: new Date(endAt).toISOString(),
          resource_id: resourceId,
          notes_internal: notesInternal.trim() || null,
          notes_customer: notesCustomer.trim() || null,
          booking_request_id: prefill?.booking_request_id ?? null,
        });
        await saveDetails(res.id);
        toast.success(`Booking ${res.booking_number} created`);
        onSaved?.(res.id);
      }
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save booking");
    }
  }

  async function saveDetails(bookingId: string) {
    if (kind === "grooming") {
      await upsertDetails.mutateAsync({
        kind: "grooming",
        bookingId,
        data: {
          ...grooming,
          grooming_mode: serviceType === "grooming_mobile" ? "mobile" : "in_house",
        },
      });
    } else if (kind === "hotel") {
      await upsertDetails.mutateAsync({ kind: "hotel", bookingId, data: hotel });
    } else if (kind === "transport") {
      await upsertDetails.mutateAsync({ kind: "transport", bookingId, data: transport });
    }
  }

  function togglePet(id: string) {
    setPetIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  }

  const saving = create.isPending || update.isPending;
  const savingAny = saving || createRecurring.isPending;

  return (
    <ModalShell
      wide
      title={isEdit ? `Edit booking ${booking?.booking_number ?? ""}` : "New booking"}
      subtitle={isEdit ? "Update booking details" : "Create a confirmed booking on behalf of a customer"}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-6 p-6">
        {/* Customer */}
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
              {!isEdit && (
                <button
                  type="button"
                  onClick={() => {
                    setCustomerId(null);
                    setPetIds([]);
                  }}
                  className="text-xs text-sk-coral-dark hover:underline"
                >
                  Change
                </button>
              )}
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
                        setPetIds([]);
                      }}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-sk-surface-muted"
                    >
                      <div>
                        <div className="font-medium">{c.full_name ?? "Unnamed"}</div>
                        <div className="text-xs text-muted-foreground">
                          {c.customer_number} · {c.email ?? c.mobile ?? "—"}
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Pets */}
        {customerId && (
          <div>
            <div className="mb-1 text-sm font-medium">Pets</div>
            {(petsQ.data?.length ?? 0) === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
                This customer has no pets yet.
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {petsQ.data?.map((p) => {
                  const active = petIds.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => togglePet(p.id)}
                      className={
                        "rounded-full border px-3 py-1 text-xs font-medium transition-colors " +
                        (active
                          ? "border-sk-coral bg-sk-coral text-white"
                          : "border-border bg-white text-foreground hover:bg-muted")
                      }
                    >
                      {p.name} {p.pet_number ? `· ${p.pet_number}` : ""}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-1 text-sm font-medium">Service type</div>
            <select
              value={serviceType}
              onChange={(e) => {
                setServiceType(e.target.value as ServiceType);
                setResourceId(null);
              }}
              className={inputCls}
            >
              {SERVICE_TYPES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div>
            <div className="mb-1 text-sm font-medium">Status</div>
            <select value={status} onChange={(e) => setStatus(e.target.value as BookingStatus)} className={inputCls}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
              ))}
            </select>
          </div>
          <div>
            <div className="mb-1 text-sm font-medium">Start</div>
            <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} className={inputCls} />
          </div>
          <div>
            <div className="mb-1 text-sm font-medium">End</div>
            <input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} className={inputCls} />
          </div>
          <div className="sm:col-span-2">
            <div className="mb-1 text-sm font-medium">Resource</div>
            <select
              value={resourceId ?? ""}
              onChange={(e) => setResourceId(e.target.value || null)}
              className={inputCls}
            >
              <option value="">— Unassigned —</option>
              {filteredResources.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
            {conflicts.length > 0 && (
              <div className="mt-2 flex items-start gap-2 rounded-lg border border-sk-orange bg-sk-orange-soft p-2 text-xs text-sk-orange">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <div>
                  This resource overlaps with{" "}
                  <span className="font-semibold">
                    {conflicts.map((c: any) => c.booking_number).join(", ")}
                  </span>
                  . You can still save — you'll be asked to confirm.
                </div>
              </div>
            )}
          </div>
        </div>

        {kind === "grooming" && (
          <GroomingFields
            value={grooming}
            onChange={(patch) => setGrooming((p) => ({ ...p, ...patch }))}
            mode={serviceType === "grooming_mobile" ? "mobile" : "in_house"}
          />
        )}
        {kind === "hotel" && (
          <HotelFields
            value={hotel}
            onChange={(patch) => setHotel((p) => ({ ...p, ...patch }))}
            species={serviceType === "hotel_cat" ? "cat" : "dog"}
          />
        )}
        {kind === "transport" && (
          <TransportFields
            value={transport}
            onChange={(patch) => setTransport((p) => ({ ...p, ...patch }))}
          />
        )}

        {!isEdit && (
          <RecurrenceFields
            value={recurrence}
            onChange={(patch) => setRecurrence((p) => ({ ...p, ...patch }))}
            anchorDate={startAt ? new Date(startAt) : null}
          />
        )}

        <div>
          <div className="mb-1 text-sm font-medium">Internal notes</div>
          <textarea
            value={notesInternal}
            onChange={(e) => setNotesInternal(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-border bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-sk-coral/40"
          />
        </div>
        <div>
          <div className="mb-1 text-sm font-medium">Customer-facing notes</div>
          <textarea
            value={notesCustomer}
            onChange={(e) => setNotesCustomer(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-border bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-sk-coral/40"
          />
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
          <button type="button" onClick={onClose} className="h-10 rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted">
            Cancel
          </button>
          <button
            type="submit"
            disabled={savingAny}
            className="h-10 rounded-lg bg-sk-coral px-4 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-60"
          >
            {savingAny ? "Saving…" : isEdit ? "Save changes" : recurrence.enabled ? "Create series" : "Create booking"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}