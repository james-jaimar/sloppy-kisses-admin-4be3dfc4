import { useState } from "react";
import { MapPin, Plus, Check, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import StaticMapThumb from "@/components/address/StaticMapThumb";
import { useCustomerAddresses, useCreateCustomerAddress, useUpdateCustomerAddress } from "./addressQueries";
import AddressFormDrawer from "./AddressFormDrawer";
import type { CustomerAddressRow } from "./addressQueries";

interface AddressSelectorProps {
  customerId: string | null | undefined;
  tenantId: string | null | undefined;
  value: string | null | undefined;
  onChange: (addressId: string | null) => void;
  label?: string;
  mobileOnly?: boolean;
  /** Portal customers don't get the manual (unverified) escape hatch. */
  allowManual?: boolean;
}

export function AddressSelector({
  customerId,
  tenantId,
  value,
  onChange,
  label = "Service address",
  mobileOnly = false,
  allowManual = true,
}: AddressSelectorProps) {
  const addressesQ = useCustomerAddresses(customerId, tenantId);
  const createAddress = useCreateCustomerAddress(tenantId, customerId);
  const updateAddress = useUpdateCustomerAddress(tenantId, customerId);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerAddressRow | null>(null);

  const addresses = addressesQ.data ?? [];
  const mobileMatches = addresses.filter((a) => a.is_mobile_grooming_address);
  // Fall back to every address when nothing is flagged for mobile grooming yet,
  // otherwise customers see an empty picker mid-booking.
  const filtered = mobileOnly && mobileMatches.length > 0 ? mobileMatches : addresses;
  const selected = addresses.find((a) => a.id === value) ?? null;

  const handleSave = async (values: Record<string, any>) => {
    if (editing) {
      await updateAddress.mutateAsync({ id: editing.id, patch: values });
      toast.success("Address confirmed");
      onChange(editing.id);
      setEditing(null);
      return;
    }
    const created = await createAddress.mutateAsync(values);
    toast.success("Address added");
    onChange(created.id);
    setDrawerOpen(false);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">{label}</Label>
        <Button type="button" variant="ghost" size="sm" onClick={() => { setEditing(null); setDrawerOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" />
          New address
        </Button>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
          No addresses on file.
          <Button type="button" variant="link" size="sm" onClick={() => { setEditing(null); setDrawerOpen(true); }}>
            Add one
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((addr) => (
            <div
              key={addr.id}
              className={`w-full rounded-lg border p-3 text-left transition-colors ${
                selected?.id === addr.id
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-muted/50"
              }`}
            >
              <button type="button" onClick={() => onChange(addr.id)} className="flex w-full items-start gap-3 text-left">
                <div className="mt-0.5">
                  {selected?.id === addr.id ? (
                    <Check className="h-4 w-4 text-primary" />
                  ) : (
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <StaticMapThumb latitude={addr.latitude} longitude={addr.longitude} size={48} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{addr.label || "Address"}</span>
                    {addr.is_primary && (
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        Primary
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground truncate">
                    {addr.formatted_address || [addr.address_line_1, addr.suburb].filter(Boolean).join(", ")}
                  </p>
                </div>
              </button>
              {!addr.google_place_id && (
                <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border pt-2 text-xs text-amber-700">
                  <span className="inline-flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" /> We couldn't pin this on the map yet
                  </span>
                  <button
                    type="button"
                    onClick={() => { setEditing(addr); setDrawerOpen(true); }}
                    className="rounded-md border border-border bg-white px-2 py-0.5 text-[11px] font-semibold text-foreground hover:bg-muted"
                  >
                    Confirm this address
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {customerId && tenantId && drawerOpen && (
        <AddressFormDrawer
          onClose={() => { setDrawerOpen(false); setEditing(null); }}
          tenantId={tenantId}
          customerId={customerId}
          address={editing}
          allowManual={allowManual}
          onSave={handleSave}
          saving={createAddress.isPending || updateAddress.isPending}
        />
      )}
    </div>
  );
}
