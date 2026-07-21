import { useEffect, useMemo } from "react";
import {
  useHotelRateCards,
  useHotelSurcharges,
  useBookingHotelSurcharges,
  type HotelSpecies,
} from "@/features/settings/hotelRateCardQueries";
import { useHotelWorkflowSettings } from "@/features/hotelCattery/queries";

export interface SurchargeSelection {
  surcharge_id: string;
  quantity: number;
}

function nightsBetween(startAt: string | null, endAt: string | null): number {
  if (!startAt || !endAt) return 0;
  const s = new Date(startAt);
  const e = new Date(endAt);
  const diff = Math.round((e.getTime() - s.getTime()) / 86400000);
  return Math.max(1, diff);
}

function inPeak(startAt: string, endAt: string, peakStart: string | null, peakEnd: string | null): boolean {
  if (!peakStart || !peakEnd) return false;
  const s = new Date(startAt);
  const e = new Date(endAt);
  for (let d = new Date(s); d < e; d.setDate(d.getDate() + 1)) {
    const md = `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (md >= peakStart && md <= peakEnd) return true;
  }
  return false;
}

const fmtZar = (n: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", minimumFractionDigits: 2 }).format(n);

export function HotelExtrasPanel({
  tenantId,
  bookingId,
  species,
  accommodationType,
  onAccommodationChange,
  startAt,
  endAt,
  petCount,
  selection,
  onSelectionChange,
}: {
  tenantId: string;
  bookingId: string | null;
  species: HotelSpecies;
  accommodationType: string;
  onAccommodationChange: (v: string) => void;
  startAt: string | null;
  endAt: string | null;
  petCount: number;
  selection: SurchargeSelection[];
  onSelectionChange: (rows: SurchargeSelection[]) => void;
}) {
  const ratesQ = useHotelRateCards(tenantId, { activeOnly: true });
  const surchargesQ = useHotelSurcharges(tenantId, { activeOnly: true });
  const wfQ = useHotelWorkflowSettings(tenantId);
  const existingQ = useBookingHotelSurcharges(bookingId);

  // On first load in edit mode, seed selection from existing rows.
  useEffect(() => {
    if (!bookingId) return;
    if (!existingQ.data) return;
    if (selection.length > 0) return;
    onSelectionChange(
      existingQ.data.map((r) => ({ surcharge_id: r.surcharge_id, quantity: Number(r.quantity) })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId, existingQ.data]);

  const species_rates = (ratesQ.data ?? []).filter((r) => r.species === species);
  const activeRate = species_rates.find((r) => r.accommodation_type === accommodationType) ?? null;

  const nights = nightsBetween(startAt, endAt);
  const peak = activeRate && startAt && endAt && Number(activeRate.peak_uplift_pct) > 0
    ? inPeak(startAt, endAt, wfQ.data?.peak_start_month_day ?? null, wfQ.data?.peak_end_month_day ?? null)
    : false;

  const preview = useMemo(() => {
    if (!activeRate || nights === 0) return null;
    const nightlyBase = Number(activeRate.nightly_rate_zar);
    const uplift = peak ? Number(activeRate.peak_uplift_pct) / 100 : 0;
    const nightly = Math.round(nightlyBase * (1 + uplift) * 100) / 100;
    const stayTotal = Math.round(nightly * nights * 100) / 100;
    const extras = Math.max(0, petCount - 1);
    const extraTotal = extras > 0 && Number(activeRate.extra_pet_rate_zar) > 0
      ? Math.round(Number(activeRate.extra_pet_rate_zar) * extras * nights * 100) / 100
      : 0;

    const surchargeRows = selection
      .map((s) => {
        const cat = (surchargesQ.data ?? []).find((x) => x.id === s.surcharge_id);
        if (!cat) return null;
        const qty = s.quantity * (cat.per_night ? nights : 1);
        const total = Math.round(qty * Number(cat.price_zar) * 100) / 100;
        return { name: cat.name, qty, unit: Number(cat.price_zar), total, per_night: cat.per_night };
      })
      .filter(Boolean) as { name: string; qty: number; unit: number; total: number; per_night: boolean }[];

    const surchargeTotal = surchargeRows.reduce((sum, r) => sum + r.total, 0);
    const grand = stayTotal + extraTotal + surchargeTotal;
    return { nightly, nights, stayTotal, extras, extraTotal, surchargeRows, surchargeTotal, grand, peak, uplift: uplift * 100 };
  }, [activeRate, nights, peak, petCount, selection, surchargesQ.data]);

  function toggleSurcharge(id: string) {
    const exists = selection.find((s) => s.surcharge_id === id);
    if (exists) onSelectionChange(selection.filter((s) => s.surcharge_id !== id));
    else onSelectionChange([...selection, { surcharge_id: id, quantity: 1 }]);
  }

  function setQty(id: string, qty: number) {
    onSelectionChange(selection.map((s) => (s.surcharge_id === id ? { ...s, quantity: Math.max(0.1, qty) } : s)));
  }

  return (
    <div className="rounded-xl border border-border bg-white p-4">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Room, rate & add-ons
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <div className="mb-1 text-xs font-medium">Accommodation (rate card)</div>
          <select
            className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm"
            value={accommodationType}
            onChange={(e) => onAccommodationChange(e.target.value)}
          >
            <option value="">— Select accommodation —</option>
            {species_rates.map((r) => (
              <option key={r.id} value={r.accommodation_type}>
                {r.display_name} · {fmtZar(Number(r.nightly_rate_zar))}/night
              </option>
            ))}
          </select>
          {species_rates.length === 0 && (
            <div className="mt-1 text-[11px] text-sk-orange">
              No rate cards configured for {species === "cat" ? "cats" : "dogs"}. Set them up in Settings → Hotel & Cattery rates.
            </div>
          )}
        </div>
        <div className="rounded-lg border border-dashed border-border bg-sk-surface-muted p-3 text-xs">
          {activeRate ? (
            <>
              <div className="font-medium">{activeRate.display_name}</div>
              <div className="text-muted-foreground">
                {fmtZar(Number(activeRate.nightly_rate_zar))}/night · Peak uplift {Number(activeRate.peak_uplift_pct)}% · Extra pet {fmtZar(Number(activeRate.extra_pet_rate_zar))}/night
              </div>
              {peak && (
                <div className="mt-1 rounded bg-sk-orange-soft px-2 py-0.5 text-[10px] font-semibold text-sk-orange">
                  Peak season applies
                </div>
              )}
            </>
          ) : (
            <span className="text-muted-foreground">Pick an accommodation to price this stay.</span>
          )}
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-2 text-xs font-medium">Surcharges</div>
        {(surchargesQ.data ?? []).length === 0 ? (
          <div className="text-[11px] text-muted-foreground">No surcharges configured.</div>
        ) : (
          <div className="space-y-2">
            {(surchargesQ.data ?? []).map((s) => {
              const sel = selection.find((x) => x.surcharge_id === s.id);
              return (
                <div key={s.id} className="flex items-center gap-3 rounded-lg border border-border bg-white px-3 py-2 text-sm">
                  <label className="flex flex-1 items-center gap-2">
                    <input type="checkbox" className="h-4 w-4" checked={!!sel} onChange={() => toggleSurcharge(s.id)} />
                    <span className="font-medium">{s.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {fmtZar(Number(s.price_zar))} {s.per_night ? "/ night" : "/ stay"}
                    </span>
                  </label>
                  {sel && (
                    <input
                      type="number"
                      min={0.1}
                      step={0.1}
                      value={sel.quantity}
                      onChange={(e) => setQty(s.id, Number(e.target.value))}
                      className="h-8 w-20 rounded-md border border-border bg-white px-2 text-sm"
                      title="Quantity"
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {preview && (
        <div className="mt-4 rounded-lg border border-border bg-sk-surface-muted p-3 text-sm">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Price preview</div>
          <div className="space-y-1">
            <Row label={`Stay · ${preview.nights} night${preview.nights === 1 ? "" : "s"} @ ${fmtZar(preview.nightly)}${preview.peak ? ` (peak +${preview.uplift}%)` : ""}`} value={fmtZar(preview.stayTotal)} />
            {preview.extraTotal > 0 && (
              <Row label={`Extra pet${preview.extras > 1 ? "s" : ""} · ${preview.extras} × ${preview.nights} night`} value={fmtZar(preview.extraTotal)} />
            )}
            {preview.surchargeRows.map((r, i) => (
              <Row key={i} label={`${r.name}${r.per_night ? ` · ${preview.nights} night` : ""}`} value={fmtZar(r.total)} />
            ))}
            <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-sm font-semibold">
              <span>Total (excl. VAT changes)</span>
              <span>{fmtZar(preview.grand)}</span>
            </div>
          </div>
          <div className="mt-2 text-[11px] text-muted-foreground">
            Draft invoice is regenerated automatically after save.
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}