import { useEffect, useState } from "react";
import { X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import AddressAutocomplete, { AddressResult } from "@/components/address/AddressAutocomplete";
import type { CustomerAddressRow } from "./addressQueries";

interface Props {
  tenantId: string;
  customerId: string;
  address?: CustomerAddressRow | null;
  onClose: () => void;
  onSave: (values: Record<string, any>) => Promise<void>;
  saving?: boolean;
}

const ADDRESS_TYPES = [
  { value: "home", label: "Home" },
  { value: "work", label: "Work" },
  { value: "service", label: "Service / Care location" },
  { value: "pickup", label: "Pickup" },
  { value: "dropoff", label: "Drop-off" },
  { value: "other", label: "Other" },
];

export default function AddressFormDrawer({ tenantId, customerId, address, onClose, onSave, saving }: Props) {
  const [form, setForm] = useState({
    label: "Home",
    address_type: "home",
    address_line_1: "",
    address_line_2: "",
    suburb: "",
    city: "",
    province: "",
    postcode: "",
    country_code: "ZA",
    formatted_address: "",
    google_place_id: "",
    latitude: null as number | null,
    longitude: null as number | null,
    is_primary: false,
    is_mobile_grooming_address: false,
    access_notes: "",
    parking_notes: "",
    gate_code: "",
  });

  useEffect(() => {
    if (address) {
      setForm({
        label: address.label ?? "Home",
        address_type: address.address_type ?? "home",
        address_line_1: address.address_line_1 ?? "",
        address_line_2: address.address_line_2 ?? "",
        suburb: address.suburb ?? "",
        city: address.city ?? "",
        province: address.province ?? "",
        postcode: address.postcode ?? "",
        country_code: address.country_code ?? "ZA",
        formatted_address: address.formatted_address ?? "",
        google_place_id: address.google_place_id ?? "",
        latitude: address.latitude ?? null,
        longitude: address.longitude ?? null,
        is_primary: address.is_primary ?? false,
        is_mobile_grooming_address: address.is_mobile_grooming_address ?? false,
        access_notes: address.access_notes ?? "",
        parking_notes: address.parking_notes ?? "",
        gate_code: address.gate_code ?? "",
      });
    }
  }, [address]);

  const handleAddressSelect = (result: AddressResult) => {
    setForm((f) => ({
      ...f,
      formatted_address: result.formatted_address,
      google_place_id: result.place_id,
      address_line_1: result.address_line_1,
      address_line_2: result.address_line_2,
      suburb: result.suburb,
      city: result.city,
      province: result.province,
      postcode: result.postcode,
      country_code: result.country_code,
      latitude: result.latitude,
      longitude: result.longitude,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload: Record<string, any> = { ...form };
      if (!form.google_place_id) {
        // If no Place ID selected, build a formatted address from typed fields
        payload.formatted_address = [form.address_line_1, form.address_line_2, form.suburb, form.city, form.province, form.postcode]
          .filter(Boolean)
          .join(", ");
      }
      await onSave(payload);
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save address");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
      <div className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{address ? "Edit address" : "Add address"}</h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <AddressAutocomplete
            label="Search address"
            value={form.formatted_address}
            onChange={(v) => setForm({ ...form, formatted_address: v })}
            onSelect={handleAddressSelect}
            placeholder="Start typing the address…"
          />

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Label</div>
              <input
                type="text"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm"
              />
            </label>
            <label className="block">
              <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Type</div>
              <select
                value={form.address_type}
                onChange={(e) => setForm({ ...form, address_type: e.target.value })}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm"
              >
                {ADDRESS_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block md:col-span-2">
              <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Address line 1</div>
              <input
                type="text"
                value={form.address_line_1}
                onChange={(e) => setForm({ ...form, address_line_1: e.target.value })}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm"
              />
            </label>
            <label className="block md:col-span-2">
              <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Address line 2</div>
              <input
                type="text"
                value={form.address_line_2}
                onChange={(e) => setForm({ ...form, address_line_2: e.target.value })}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm"
              />
            </label>
            <label className="block">
              <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Suburb</div>
              <input
                type="text"
                value={form.suburb}
                onChange={(e) => setForm({ ...form, suburb: e.target.value })}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm"
              />
            </label>
            <label className="block">
              <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">City</div>
              <input
                type="text"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm"
              />
            </label>
            <label className="block">
              <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Province</div>
              <input
                type="text"
                value={form.province}
                onChange={(e) => setForm({ ...form, province: e.target.value })}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm"
              />
            </label>
            <label className="block">
              <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Postcode</div>
              <input
                type="text"
                value={form.postcode}
                onChange={(e) => setForm({ ...form, postcode: e.target.value })}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm"
              />
            </label>
          </div>

          <div className="space-y-2 rounded-xl border border-border p-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.is_primary}
                onChange={(e) => setForm({ ...form, is_primary: e.target.checked })}
              />
              Primary address
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.is_mobile_grooming_address}
                onChange={(e) => setForm({ ...form, is_mobile_grooming_address: e.target.checked })}
              />
              Use for mobile grooming
            </label>
          </div>

          <div className="grid gap-3">
            <label className="block">
              <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Access notes</div>
              <textarea
                value={form.access_notes}
                onChange={(e) => setForm({ ...form, access_notes: e.target.value })}
                rows={2}
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Parking notes</div>
              <textarea
                value={form.parking_notes}
                onChange={(e) => setForm({ ...form, parking_notes: e.target.value })}
                rows={2}
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Gate code</div>
              <input
                type="text"
                value={form.gate_code}
                onChange={(e) => setForm({ ...form, gate_code: e.target.value })}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm"
              />
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-sk-coral px-4 py-2 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? "Saving…" : "Save address"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
