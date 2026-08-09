import { useState } from "react";
import { MapPin, Plus, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useCustomerAddresses, useCreateCustomerAddress } from "./addressQueries";
import AddressFormDrawer from "./AddressFormDrawer";
import type { CustomerAddressRow } from "./addressQueries";

interface AddressSelectorProps {
  customerId: string | null | undefined;
  tenantId: string | null | undefined;
  value: string | null | undefined;
  onChange: (addressId: string | null) => void;
  label?: string;
  mobileOnly?: boolean;
}

export function AddressSelector({
  customerId,
  tenantId,
  value,
  onChange,
  label = "Service address",
  mobileOnly = false,
}: AddressSelectorProps) {
  const addressesQ = useCustomerAddresses(customerId, tenantId);
  const createAddress = useCreateCustomerAddress(tenantId, customerId);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const addresses = addressesQ.data ?? [];
  const filtered = mobileOnly ? addresses.filter((a) => a.is_mobile_grooming_address) : addresses;
  const selected = addresses.find((a) => a.id === value) ?? null;

  const handleSave = async (values: Record<string, any>) => {
    const created = await createAddress.mutateAsync(values);
    toast.success("Address added");
    onChange(created.id);
    setDrawerOpen(false);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">{label}</Label>
        <Button type="button" variant="ghost" size="sm" onClick={() => setDrawerOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          New address
        </Button>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
          No addresses on file.
          <Button type="button" variant="link" size="sm" onClick={() => setDrawerOpen(true)}>
            Add one
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((addr) => (
            <button
              key={addr.id}
              type="button"
              onClick={() => onChange(addr.id)}
              className={`w-full flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                selected?.id === addr.id
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-muted/50"
              }`}
            >
              <div className="mt-0.5">
                {selected?.id === addr.id ? (
                  <Check className="h-4 w-4 text-primary" />
                ) : (
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
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
          ))}
        </div>
      )}

      {customerId && tenantId && drawerOpen && (
        <AddressFormDrawer
          onClose={() => setDrawerOpen(false)}
          tenantId={tenantId}
          customerId={customerId}
          onSave={handleSave}
          saving={createAddress.isPending}
        />
      )}
    </div>
  );
}
