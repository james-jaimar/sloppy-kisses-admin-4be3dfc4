import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { useCurrentCustomer } from "../../hooks";
import { WizardShell, Field, inputCls, selectCls, textareaCls } from "./WizardShell";
import { usePortalPets, useCustomerBookings } from "./wizardHooks";
import { dateToIso, useCreatePortalBooking } from "./useBookingSubmit";
import { useCustomerAddresses } from "@/features/customers/addressQueries";
import AddressFormDrawer from "@/features/customers/AddressFormDrawer";

export default function TransportRequestWizard() {
  const cust = useCurrentCustomer();
  const pets = usePortalPets(cust.data?.id);
  const bookings = useCustomerBookings(cust.data?.id);
  const submit = useCreatePortalBooking();

  const [petIds, setPetIds] = useState<string[]>([]);
  const [linkedBookingId, setLinkedBookingId] = useState("");
  const [direction, setDirection] = useState<"pickup" | "dropoff" | "round_trip">("round_trip");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("08:00");
  const [serviceAddressId, setServiceAddressId] = useState<string | null>(null);
  const [showAddressDrawer, setShowAddressDrawer] = useState(false);
  const [accessNotes, setAccessNotes] = useState("");
  const [notes, setNotes] = useState("");
  const addressesQ = useCustomerAddresses(cust.data?.id ?? null, cust.data?.tenant_id ?? null);

  const canSubmit = cust.data && petIds.length > 0 && date && serviceAddressId && !submit.isPending;

  function togglePet(id: string) {
    setPetIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function onSubmit() {
    if (!cust.data) return;
    const startAt = dateToIso(date, time);
    if (!startAt) return;
    submit.mutate({
      serviceType: "pickup_dropoff",
      petIds,
      startAt,
      service_address_id: serviceAddressId,
      notes: [notes, accessNotes ? `Access: ${accessNotes}` : null].filter(Boolean).join("\n") || null,
      transport: {
        direction,
      },
    });
  }

  if (cust.isLoading) return <div className="grid flex-1 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <WizardShell
      title="Book pick up / drop off"
      subtitle="Add transport to an existing booking, or book a standalone trip."
      footer={
        <button onClick={onSubmit} disabled={!canSubmit} className="rounded-lg bg-sk-coral px-5 py-2 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-50">
          {submit.isPending ? "Booking…" : "Confirm booking"}
        </button>
      }
    >
      <Field label="Which pets?">
        <div className="flex flex-wrap gap-2">
          {(pets.data ?? []).map((p: any) => {
            const active = petIds.includes(p.id);
            return (
              <button key={p.id} type="button" onClick={() => togglePet(p.id)}
                className={"rounded-full border px-3 py-1.5 text-sm " + (active ? "border-sk-coral bg-sk-coral-soft text-sk-coral-dark" : "border-border bg-white hover:bg-muted")}>
                {p.name}
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="Link to existing booking (optional)">
        <select value={linkedBookingId} onChange={(e) => setLinkedBookingId(e.target.value)} className={selectCls}>
          <option value="">Standalone transport</option>
          {(bookings.data ?? []).map((b: any) => (
            <option key={b.id} value={b.id}>{b.booking_number} · {b.service_type} · {new Date(b.start_at).toLocaleDateString()}</option>
          ))}
        </select>
      </Field>

      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Direction">
          <select value={direction} onChange={(e) => setDirection(e.target.value as any)} className={selectCls}>
            <option value="pickup">Pickup only</option>
            <option value="dropoff">Drop-off only</option>
            <option value="round_trip">Both ways</option>
          </select>
        </Field>
        <Field label="Preferred date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} /></Field>
        <Field label="Preferred time"><input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputCls} /></Field>
      </div>

      <Field label="Address">
        <div className="space-y-2">
          {(addressesQ.data ?? []).length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
              You don't have any saved addresses yet.
            </div>
          ) : (
            <div className="grid gap-2">
              {(addressesQ.data ?? []).map((a: any) => (
                <label
                  key={a.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm ${serviceAddressId === a.id ? "border-sk-coral bg-sk-coral-soft" : "border-border bg-white"}`}
                >
                  <input
                    type="radio"
                    name="service_address"
                    value={a.id}
                    checked={serviceAddressId === a.id}
                    onChange={() => setServiceAddressId(a.id)}
                    className="mt-0.5"
                  />
                  <span className="flex-1">
                    <span className="font-medium">{a.label}</span>
                    <span className="block text-muted-foreground">{a.formatted_address}</span>
                  </span>
                </label>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => setShowAddressDrawer(true)}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-sk-coral hover:underline"
          >
            <Plus className="h-4 w-4" /> Add a new address
          </button>
        </div>
      </Field>

      <Field label="Access / parking notes"><textarea rows={2} value={accessNotes} onChange={(e) => setAccessNotes(e.target.value)} className={textareaCls} /></Field>
      <Field label="Notes for our team"><textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={textareaCls} /></Field>

      {cust.data && showAddressDrawer && (
        <AddressFormDrawer
          customerId={cust.data.id}
          tenantId={cust.data.tenant_id}
          onClose={() => setShowAddressDrawer(false)}
          onSave={async (addr) => {
            setServiceAddressId(addr.id);
            setShowAddressDrawer(false);
            await addressesQ.refetch();
          }}
        />
      )}
    </WizardShell>
  );
}