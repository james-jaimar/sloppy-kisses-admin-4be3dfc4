import type {
  GroomingDetails,
  HotelDetails,
  TransportDetails,
} from "./detailsQueries";

const inputCls =
  "h-10 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-sk-coral/40";
const areaCls =
  "w-full rounded-lg border border-border bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-sk-coral/40";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </div>
  );
}

export function GroomingFields({
  value,
  onChange,
  mode,
}: {
  value: Partial<GroomingDetails>;
  onChange: (patch: Partial<GroomingDetails>) => void;
  mode: "in_house" | "mobile";
}) {
  return (
    <div className="rounded-xl border border-border bg-sk-surface-muted p-4">
      <SectionTitle>Grooming details ({mode === "in_house" ? "in-house" : "mobile"})</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <div className="mb-1 text-xs font-medium">Service package</div>
          <input
            className={inputCls}
            value={value.service_package ?? ""}
            onChange={(e) => onChange({ service_package: e.target.value || null })}
            placeholder="Full groom, bath & tidy, nails only…"
          />
        </div>
        <div>
          <div className="mb-1 text-xs font-medium">Groomer</div>
          <input
            className={inputCls}
            value={value.groomer_name ?? ""}
            onChange={(e) => onChange({ groomer_name: e.target.value || null })}
          />
        </div>
        <div>
          <div className="mb-1 text-xs font-medium">Duration (min)</div>
          <input
            type="number"
            min={0}
            className={inputCls}
            value={value.duration_minutes ?? ""}
            onChange={(e) =>
              onChange({ duration_minutes: e.target.value ? Number(e.target.value) : null })
            }
          />
        </div>
        {mode === "mobile" && (
          <div>
            <div className="mb-1 text-xs font-medium">Travel fee</div>
            <input
              type="number"
              min={0}
              step="0.01"
              className={inputCls}
              value={value.travel_fee ?? ""}
              onChange={(e) =>
                onChange({ travel_fee: e.target.value ? Number(e.target.value) : null })
              }
            />
          </div>
        )}
        <div>
          <div className="mb-1 text-xs font-medium">Surcharge</div>
          <input
            type="number"
            min={0}
            step="0.01"
            className={inputCls}
            value={value.surcharge_amount ?? ""}
            onChange={(e) =>
              onChange({ surcharge_amount: e.target.value ? Number(e.target.value) : null })
            }
          />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={value.pensioner_discount ?? false}
            onChange={(e) => onChange({ pensioner_discount: e.target.checked })}
          />
          Pensioner discount
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={value.recurring ?? false}
            onChange={(e) => onChange({ recurring: e.target.checked })}
          />
          Recurring booking
        </label>
      </div>
      <div className="mt-3">
        <div className="mb-1 text-xs font-medium">Grooming notes</div>
        <textarea
          rows={2}
          className={areaCls}
          value={value.grooming_notes ?? ""}
          onChange={(e) => onChange({ grooming_notes: e.target.value || null })}
        />
      </div>
    </div>
  );
}

export function HotelFields({
  value,
  onChange,
  species,
}: {
  value: Partial<HotelDetails>;
  onChange: (patch: Partial<HotelDetails>) => void;
  species: "dog" | "cat";
}) {
  return (
    <div className="rounded-xl border border-border bg-sk-surface-muted p-4">
      <SectionTitle>{species === "cat" ? "Cattery" : "Hotel"} details</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <div className="mb-1 text-xs font-medium">Accommodation type</div>
          <input
            className={inputCls}
            value={value.accommodation_type ?? ""}
            onChange={(e) => onChange({ accommodation_type: e.target.value || null })}
            placeholder={species === "cat" ? "Standard / suite" : "Kennel / suite / run"}
          />
        </div>
        <div>
          <div className="mb-1 text-xs font-medium">Check-in window</div>
          <input
            className={inputCls}
            value={value.check_in_window ?? ""}
            onChange={(e) => onChange({ check_in_window: e.target.value || null })}
            placeholder="e.g. 08:00 – 10:00"
          />
        </div>
        <div>
          <div className="mb-1 text-xs font-medium">Check-out window</div>
          <input
            className={inputCls}
            value={value.check_out_window ?? ""}
            onChange={(e) => onChange({ check_out_window: e.target.value || null })}
            placeholder="e.g. 16:00 – 18:00"
          />
        </div>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <div className="mb-1 text-xs font-medium">Feeding instructions</div>
          <textarea
            rows={2}
            className={areaCls}
            value={value.feeding_instructions ?? ""}
            onChange={(e) => onChange({ feeding_instructions: e.target.value || null })}
          />
        </div>
        <div>
          <div className="mb-1 text-xs font-medium">Medication instructions</div>
          <textarea
            rows={2}
            className={areaCls}
            value={value.medication_instructions ?? ""}
            onChange={(e) => onChange({ medication_instructions: e.target.value || null })}
          />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={value.grooming_required ?? false}
            onChange={(e) => onChange({ grooming_required: e.target.checked })}
          />
          Groom during stay
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={value.pickup_required ?? false}
            onChange={(e) => onChange({ pickup_required: e.target.checked })}
          />
          Pickup required
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={value.dropoff_required ?? false}
            onChange={(e) => onChange({ dropoff_required: e.target.checked })}
          />
          Drop-off required
        </label>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <div className="mb-1 text-xs font-medium">Belongings notes</div>
          <textarea
            rows={2}
            className={areaCls}
            value={value.belongings_notes ?? ""}
            onChange={(e) => onChange({ belongings_notes: e.target.value || null })}
            placeholder="Bed, blanket, favourite toy, food container…"
          />
        </div>
        <div>
          <div className="mb-1 text-xs font-medium">Emergency notes</div>
          <textarea
            rows={2}
            className={areaCls}
            value={value.emergency_notes ?? ""}
            onChange={(e) => onChange({ emergency_notes: e.target.value || null })}
          />
        </div>
      </div>
    </div>
  );
}

export function TransportFields({
  value,
  onChange,
}: {
  value: Partial<TransportDetails>;
  onChange: (patch: Partial<TransportDetails>) => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-sk-surface-muted p-4">
      <SectionTitle>Transport details</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <div className="mb-1 text-xs font-medium">Direction</div>
          <select
            className={inputCls}
            value={value.direction ?? "pickup"}
            onChange={(e) => onChange({ direction: e.target.value as TransportDetails["direction"] })}
          >
            <option value="pickup">Pickup</option>
            <option value="dropoff">Drop-off</option>
            <option value="round_trip">Round trip</option>
          </select>
        </div>
        <div>
          <div className="mb-1 text-xs font-medium">Suburb</div>
          <input
            className={inputCls}
            value={value.suburb ?? ""}
            onChange={(e) => onChange({ suburb: e.target.value || null })}
          />
        </div>
        <div>
          <div className="mb-1 text-xs font-medium">Gate code</div>
          <input
            className={inputCls}
            value={value.gate_code ?? ""}
            onChange={(e) => onChange({ gate_code: e.target.value || null })}
          />
        </div>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <div className="mb-1 text-xs font-medium">Pickup address</div>
          <textarea
            rows={2}
            className={areaCls}
            value={value.pickup_address ?? ""}
            onChange={(e) => onChange({ pickup_address: e.target.value || null })}
          />
        </div>
        <div>
          <div className="mb-1 text-xs font-medium">Drop-off address</div>
          <textarea
            rows={2}
            className={areaCls}
            value={value.dropoff_address ?? ""}
            onChange={(e) => onChange({ dropoff_address: e.target.value || null })}
          />
        </div>
      </div>
      <div className="mt-3">
        <div className="mb-1 text-xs font-medium">Driver notes</div>
        <textarea
          rows={2}
          className={areaCls}
          value={value.driver_notes ?? ""}
          onChange={(e) => onChange({ driver_notes: e.target.value || null })}
        />
      </div>
    </div>
  );
}