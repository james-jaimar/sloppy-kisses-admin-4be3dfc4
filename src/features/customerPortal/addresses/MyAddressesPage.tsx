import { useState } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentCustomer } from "../hooks";
import {
  useCustomerAddresses,
  useCreateCustomerAddress,
  useUpdateCustomerAddress,
  useDeleteCustomerAddress,
  type CustomerAddressRow,
} from "@/features/customers/addressQueries";
import AddressFormDrawer from "@/features/customers/AddressFormDrawer";
import { Loader2, AlertCircle, MapPin, Plus, Pencil, Trash2, Star } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";

export default function MyAddressesPage() {
  const confirm = useConfirm();
  const cust = useCurrentCustomer();
  const tenantId = cust.data?.tenant_id;
  const customerId = cust.data?.id;
  const { data: addresses, isLoading, isError, error } = useCustomerAddresses(customerId, tenantId);
  const [editing, setEditing] = useState<CustomerAddressRow | null>(null);
  const [adding, setAdding] = useState(false);

  const create = useCreateCustomerAddress(tenantId, customerId);
  const update = useUpdateCustomerAddress(tenantId, customerId);
  const remove = useDeleteCustomerAddress(tenantId, customerId);

  const handleSave = async (values: Record<string, any>) => {
    if (editing) {
      await update.mutateAsync({ id: editing.id, patch: values });
      toast.success("Address updated");
    } else {
      await create.mutateAsync(values);
      toast.success("Address added");
    }
  };

  const handleDelete = async (addr: CustomerAddressRow) => {
    if (!(await confirm({ title: "Delete address?", description: `Remove ${addr.label || "this address"}?`, confirmLabel: "Delete", tone: "destructive" }))) return;
    try {
      await remove.mutateAsync(addr.id);
      toast.success("Address deleted");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to delete address");
    }
  };

  if (cust.isLoading || isLoading)
    return (
      <div className="grid flex-1 place-items-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  if (isError)
    return (
      <div className="p-6 text-sm text-sk-coral-dark">
        <AlertCircle className="mb-1 h-4 w-4" /> {(error as Error)?.message}
      </div>
    );
  if (!cust.data) return <div className="p-6 text-sm text-muted-foreground">No profile linked.</div>;

  return (
    <>
      <AppHeader title="My addresses" subtitle="Manage your service and pickup locations" />
      <div className="flex-1 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Saved addresses</h2>
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-sk-coral px-3 py-2 text-xs font-semibold text-white hover:bg-sk-coral-dark"
          >
            <Plus className="h-3.5 w-3.5" /> Add address
          </button>
        </div>

        {!addresses?.length && (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            <MapPin className="h-5 w-5" /> No addresses saved yet.
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          {addresses?.map((addr) => (
            <div key={addr.id} className="relative rounded-xl border border-border bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-semibold">{addr.label || "Address"}</span>
                  {addr.is_primary && <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setEditing(addr)}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(addr)}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-sk-coral-dark"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="mt-2 text-sm text-foreground">
                {addr.formatted_address || [addr.address_line_1, addr.address_line_2, addr.suburb, addr.city, addr.province, addr.postcode].filter(Boolean).join(", ") || "—"}
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {addr.address_type && (
                  <span className="rounded-md bg-sk-surface-muted px-2 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                    {addr.address_type}
                  </span>
                )}
                {addr.is_mobile_grooming_address && (
                  <span className="rounded-md bg-sk-turquoise-soft px-2 py-0.5 text-[10px] font-medium uppercase text-sk-turquoise-dark">
                    Mobile grooming
                  </span>
                )}
                {addr.google_place_id && (
                  <span className="rounded-md bg-green-50 px-2 py-0.5 text-[10px] font-medium uppercase text-green-700">
                    Verified
                  </span>
                )}
              </div>
              {(addr.access_notes || addr.parking_notes || addr.gate_code) && (
                <div className="mt-3 space-y-1 border-t border-border pt-2 text-xs text-muted-foreground">
                  {addr.access_notes && <div>Access: {addr.access_notes}</div>}
                  {addr.parking_notes && <div>Parking: {addr.parking_notes}</div>}
                  {addr.gate_code && <div>Gate code: {addr.gate_code}</div>}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {(adding || editing) && tenantId && customerId && (
        <AddressFormDrawer
          tenantId={tenantId}
          customerId={customerId}
          address={editing}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
          onSave={handleSave}
          saving={create.isPending || update.isPending}
        />
      )}
    </>
  );
}
