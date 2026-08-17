import { useMemo, useState } from "react";
import { MapPin, Check, AlertTriangle, Search } from "lucide-react";
import AddressField from "@/components/address/AddressField";
import StaticMapThumb from "@/components/address/StaticMapThumb";
import {
  useCustomerAddresses,
  useCreateCustomerAddress,
  useUpdateCustomerAddress,
  type CustomerAddressRow,
} from "./addressQueries";

const emptyDraft = {
  formatted_address: "",
  google_place_id: "",
  address_line_1: "",
  address_line_2: "",
  suburb: "",
  city: "",
  province: "",
  postcode: "",
  country_code: "ZA",
  latitude: null as number | null,
  longitude: null as number | null,
  access_notes: "",
};

export type AddressDraft = typeof emptyDraft;

interface Props {
  customerId: string;
  tenantId: string | null;
  /** Currently selected saved address id (null when a new search result is staged). */
  value: string | null;
  onChange: (addressId: string | null) => void;
  draft: AddressDraft;
  onDraftChange: (patch: Partial<AddressDraft>) => void;
  /** Id of the saved address the draft is editing (confirm flow), if any. */
  editingId: string | null;
  onEditingIdChange: (id: string | null) => void;
  allowManual?: boolean;
}

/**
 * Address search + saved-address list, rendered inline (no nested overlay) so it
 * works inside a dialog.
 */
export default function InlineAddressPicker({
  customerId,
  tenantId,
  value,
  onChange,
  draft,
  onDraftChange,
  editingId,
  onEditingIdChange,
  allowManual = true,
}: Props) {
  const addressesQ = useCustomerAddresses(customerId, tenantId);
  const addresses = addressesQ.data ?? [];
  const [searchOpen, setSearchOpen] = useState(false);

  const showSearch = searchOpen || addresses.length === 0 || Boolean(draft.google_place_id) || Boolean(editingId);

  const startConfirm = (addr: CustomerAddressRow) => {
    onEditingIdChange(addr.id);
    onChange(null);
    setSearchOpen(true);
    onDraftChange({
      ...emptyDraft,
      address_line_1: addr.address_line_1 ?? "",
      address_line_2: addr.address_line_2 ?? "",
      suburb: addr.suburb ?? "",
      city: addr.city ?? "",
      province: addr.province ?? "",
      postcode: addr.postcode ?? "",
      formatted_address: addr.formatted_address ?? "",
      access_notes: addr.access_notes ?? "",
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-semibold uppercase text-muted-foreground">
            {editingId ? "Confirm this address on Google" : "Search for an address"}
          </div>
          {!showSearch && (
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-sk-coral hover:underline"
            >
              <Search className="h-3.5 w-3.5" /> New address
            </button>
          )}
        </div>
        {showSearch && (
          <div className="mt-2 min-w-0">
            <AddressField
              label="Address"
              allowManual={allowManual}
              value={draft}
              onChange={(patch) => {
                onDraftChange(patch);
                if ((patch as any).google_place_id) onChange(null);
              }}
            />
          </div>
        )}
      </div>

      {addresses.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase text-muted-foreground">Or use a saved address</div>
          {addresses.map((addr) => {
            const selected = value === addr.id;
            return (
              <div
                key={addr.id}
                className={`min-w-0 rounded-lg border p-3 transition-colors ${
                  selected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    onChange(addr.id);
                    onEditingIdChange(null);
                    onDraftChange({ ...emptyDraft });
                    setSearchOpen(false);
                  }}
                  className="flex w-full min-w-0 items-start gap-3 text-left"
                >
                  <span className="mt-0.5 shrink-0">
                    {selected ? (
                      <Check className="h-4 w-4 text-primary" />
                    ) : (
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                    )}
                  </span>
                  <span className="hidden shrink-0 sm:block">
                    <StaticMapThumb latitude={addr.latitude} longitude={addr.longitude} size={40} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="break-words text-sm font-medium">{addr.label || "Address"}</span>
                      {addr.is_primary && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                          Primary
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block break-words text-sm text-muted-foreground">
                      {[addr.address_line_2, addr.formatted_address || [addr.address_line_1, addr.suburb].filter(Boolean).join(", ")]
                        .filter(Boolean)
                        .join(", ")}
                    </span>
                  </span>
                </button>
                {!addr.google_place_id && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border pt-2 text-xs text-amber-700">
                    <span className="inline-flex items-center gap-1">
                      <AlertTriangle className="h-3.5 w-3.5" /> Not pinned on the map yet
                    </span>
                    <button
                      type="button"
                      onClick={() => startConfirm(addr)}
                      className="rounded-md border border-border bg-background px-2 py-0.5 text-[11px] font-semibold hover:bg-muted"
                    >
                      Confirm on Google
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export { emptyDraft };

/** Build the insert/update payload from a draft. */
export function draftToPayload(draft: AddressDraft) {
  const formatted =
    draft.google_place_id
      ? draft.formatted_address
      : [draft.address_line_1, draft.address_line_2, draft.suburb, draft.city, draft.province, draft.postcode]
          .filter(Boolean)
          .join(", ");
  return { ...draft, formatted_address: formatted };
}

export function useAddressWriters(tenantId: string | null, customerId: string) {
  const create = useCreateCustomerAddress(tenantId, customerId);
  const update = useUpdateCustomerAddress(tenantId, customerId);
  return useMemo(() => ({ create, update }), [create, update]);
}
