import { useState } from "react";
import { MapPinOff, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AddressSelector } from "@/features/customers/AddressSelector";
import { useUpdateBooking } from "./queries";
import { ADDRESS_GATE_COPY, bookingAddressState, type AddressGateInput } from "./addressGate";

/** Small red pill for board cards and lists. */
export function AddressGateChip({ booking, compact }: { booking: AddressGateInput; compact?: boolean }) {
  const state = bookingAddressState(booking);
  if (state === "routable" || state === "not_required") return null;
  return (
    <span className="inline-flex items-center gap-1 rounded bg-destructive px-1.5 py-0.5 text-[11px] font-bold uppercase text-destructive-foreground">
      <MapPinOff className="h-3 w-3" />
      {compact ? "No address" : state === "missing" ? "No address" : "Address not verified"}
    </span>
  );
}

/** Bold banner shown at the top of a van booking that cannot be routed. */
export function AddressGateBanner({
  booking,
  tenantId,
}: {
  booking: AddressGateInput & { id: string; customer_id: string };
  tenantId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const state = bookingAddressState(booking);
  if (state === "routable" || state === "not_required") return null;

  return (
    <>
      <div className="rounded-xl border-2 border-destructive bg-destructive/10 p-4">
        <div className="flex flex-wrap items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold uppercase tracking-wide text-destructive">
              This job needs an address
            </div>
            <p className="mt-1 text-sm font-medium text-destructive">
              {ADDRESS_GATE_COPY[state]} Fix it before the day or the driver will not know where to go.
            </p>
          </div>
          <Button type="button" variant="destructive" size="sm" onClick={() => setOpen(true)}>
            Fix address
          </Button>
        </div>
      </div>
      <FixAddressDialog
        open={open}
        onOpenChange={setOpen}
        tenantId={tenantId}
        bookingId={booking.id}
        customerId={booking.customer_id}
        currentAddressId={booking.service_address_id ?? null}
      />
    </>
  );
}

export function FixAddressDialog({
  open,
  onOpenChange,
  tenantId,
  bookingId,
  customerId,
  currentAddressId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tenantId: string | null;
  bookingId: string;
  customerId: string;
  currentAddressId: string | null;
}) {
  const [addressId, setAddressId] = useState<string | null>(currentAddressId);
  const update = useUpdateBooking(tenantId ?? "");

  async function save() {
    if (!addressId) return toast.error("Pick or add the address first");
    try {
      await update.mutateAsync({ id: bookingId, patch: { service_address_id: addressId } as any });
      toast.success("Address saved onto the booking");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save the address");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Set the service address</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Search for the address on Google so the van can navigate to it. It is saved on the customer's
          profile too, so you only ever do this once.
        </p>
        <AddressSelector
          customerId={customerId}
          tenantId={tenantId}
          value={addressId}
          onChange={setAddressId}
          label="Service address"
        />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={update.isPending}>
            {update.isPending ? "Saving…" : "Save address"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}