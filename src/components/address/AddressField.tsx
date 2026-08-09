import { useState } from "react";
import { MapPin, BadgeCheck, AlertTriangle, Search } from "lucide-react";
import AddressAutocomplete, { AddressResult } from "./AddressAutocomplete";

export interface AddressValue {
  formatted_address: string;
  google_place_id: string;
  address_line_1: string;
  address_line_2: string;
  suburb: string;
  city: string;
  province: string;
  postcode: string;
  country_code?: string;
  latitude: number | null;
  longitude: number | null;
  /** Gate code / directions for the driver. Never sent to Google. */
  access_notes?: string;
}

interface Props {
  value: AddressValue;
  onChange: (patch: Partial<AddressValue>) => void;
  /** Staff can fall back to typing an address Google can't find. */
  allowManual?: boolean;
  label?: string;
  /** Hide the gate code / access notes box (surfaces that capture it separately). */
  showAccessNotes?: boolean;
}

const composed = (v: AddressValue) =>
  [v.address_line_1, v.address_line_2, v.suburb, v.city, v.province, v.postcode]
    .filter(Boolean)
    .join(", ");

/** Street-only string, used for the Google search box (no unit / complex line). */
const composedStreet = (v: AddressValue) =>
  [v.address_line_1, v.suburb, v.city, v.province, v.postcode].filter(Boolean).join(", ");

function Input({
  label,
  value,
  onChange,
  hint,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">{label}</div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-sk-coral/40"
      />
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </label>
  );
}

/**
 * A single address control: Google search first, a read-only verified card
 * once picked, and (for staff) a manual escape hatch.
 */
export default function AddressField({
  value,
  onChange,
  allowManual = true,
  label = "Address",
  showAccessNotes = true,
}: Props) {
  const verified = Boolean(value.google_place_id);
  const hasTyped = Boolean(composed(value) || value.formatted_address);
  const [mode, setMode] = useState<"search" | "manual">(
    !verified && hasTyped && allowManual ? "manual" : "search",
  );
  const [query, setQuery] = useState(value.formatted_address || composedStreet(value));

  const handleSelect = (r: AddressResult) => {
    onChange({
      formatted_address: r.formatted_address,
      google_place_id: r.place_id,
      address_line_1: r.address_line_1,
      // Keep whatever unit / complex detail the user already captured — Google
      // rarely knows it and losing it strands the van at the complex gate.
      address_line_2: value.address_line_2 || r.address_line_2,
      suburb: r.suburb,
      city: r.city,
      province: r.province,
      postcode: r.postcode,
      country_code: r.country_code,
      latitude: r.latitude,
      longitude: r.longitude,
    });
    setQuery(r.formatted_address);
    setMode("search");
  };

  const clearSelection = () => {
    onChange({ google_place_id: "", latitude: null, longitude: null });
  };

  const unitFields = (
    <div className="grid gap-3 sm:grid-cols-2">
      <Input
        label="Unit / complex (optional)"
        value={value.address_line_2}
        onChange={(v) => onChange({ address_line_2: v })}
        hint="Flat, unit or complex name — helps our van find you."
        placeholder="e.g. 7 Bryanston Villas"
      />
      {showAccessNotes && (
        <Input
          label="Gate code / access notes (optional)"
          value={value.access_notes ?? ""}
          onChange={(v) => onChange({ access_notes: v })}
          hint="Anything the driver needs to get in."
          placeholder="e.g. Buzz #12, dogs at side gate"
        />
      )}
    </div>
  );

  if (verified) {
    return (
      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase text-muted-foreground">{label}</div>
        <div className="rounded-xl border border-border bg-sk-surface-muted/40 p-3">
          <div className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="text-sm leading-snug">
              {value.address_line_2 && (
                <div className="font-medium">{value.address_line_2}</div>
              )}
              <div>{value.formatted_address || composedStreet(value)}</div>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
              <BadgeCheck className="h-3.5 w-3.5" /> Verified for routing
            </span>
            <button
              type="button"
              onClick={clearSelection}
              className="text-xs font-semibold text-sk-coral hover:underline"
            >
              Change
            </button>
            {allowManual && (
              <button
                type="button"
                onClick={() => {
                  clearSelection();
                  setMode("manual");
                }}
                className="text-xs font-medium text-muted-foreground hover:underline"
              >
                Enter manually
              </button>
            )}
          </div>
        </div>
        {unitFields}
      </div>
    );
  }

  if (mode === "manual") {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold uppercase text-muted-foreground">{label}</div>
          <button
            type="button"
            onClick={() => {
              setQuery(composed(value));
              setMode("search");
            }}
            className="inline-flex items-center gap-1 text-xs font-semibold text-sk-coral hover:underline"
          >
            <Search className="h-3.5 w-3.5" /> Find on Google
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Input label="Address line 1" value={value.address_line_1} onChange={(v) => onChange({ address_line_1: v })} />
          </div>
          <Input label="Suburb" value={value.suburb} onChange={(v) => onChange({ suburb: v })} />
          <Input label="City" value={value.city} onChange={(v) => onChange({ city: v })} />
          <Input label="Province" value={value.province} onChange={(v) => onChange({ province: v })} />
          <Input label="Postal code" value={value.postcode} onChange={(v) => onChange({ postcode: v })} />
        </div>
        {unitFields}
        <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700">
          <AlertTriangle className="h-3.5 w-3.5" /> Not verified — van routing won't work for this address
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <AddressAutocomplete
        label={label}
        value={query}
        onChange={(v) => {
          setQuery(v);
          onChange({ formatted_address: v });
        }}
        onSelect={handleSelect}
        placeholder="Start typing the address…"
      />
      {unitFields}
      {allowManual && (
        <button
          type="button"
          onClick={() => setMode("manual")}
          className="text-xs font-medium text-muted-foreground hover:underline"
        >
          Can't find it? Enter manually
        </button>
      )}
    </div>
  );
}