import { useEffect, useMemo } from "react";
import { petSizeToBand } from "@/features/pets/sizeUtils";
import type { GroomingSizeBand } from "@/features/settings/groomingRateCardQueries";
import { useGroomingPackages, useGroomingAddons, type GroomingAddon, type GroomingPackage } from "@/features/settings/groomingRateCardQueries";
import { useGroomingWorkflowSettings, useBookingGroomingAddons } from "@/features/grooming/workflowQueries";
import { useInstructionCatalog } from "@/features/grooming/instructions/queries";

export interface GroomingAddonSelection {
  addon_id: string;
  qty: number;
}

const fmtZar = (n: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", minimumFractionDigits: 2 }).format(n);

export function GroomingExtrasPanel({
  tenantId,
  bookingId,
  species,
  mode,
  packageId,
  onPackageChange,
  addonSelection,
  onAddonChange,
  pensionerDiscount,
  mattedSurchargeZar,
  sedationSurchargeZar,
  travelFee,
  onTravelFeeChange,
  petSize,
}: {
  tenantId: string;
  bookingId: string | null;
  species: "dog" | "cat" | "rabbit";
  mode: "inhouse" | "mobile";
  packageId: string | null;
  onPackageChange: (id: string | null) => void;
  addonSelection: GroomingAddonSelection[];
  onAddonChange: (rows: GroomingAddonSelection[]) => void;
  pensionerDiscount: boolean;
  mattedSurchargeZar: number | null;
  sedationSurchargeZar: number | null;
  travelFee: number | null;
  /** Mobile bookings always carry the travel fee — this lets an admin override the amount. */
  onTravelFeeChange?: (v: number) => void;
  /** Effective grooming size of the primary pet — filters packages to matching band. */
  petSize?: string | null;
}) {
  const packagesQ = useGroomingPackages(tenantId, { activeOnly: true });
  const addonsQ = useGroomingAddons(tenantId, { activeOnly: true });
  const wfQ = useGroomingWorkflowSettings(tenantId);
  const existingQ = useBookingGroomingAddons(bookingId);
  const catalogQ = useInstructionCatalog(tenantId);

  // Add-on codes that are already exposed through the Grooming instructions panel
  // (e.g. Tick & Flea shampoo, Anal glands). We hide them from this checkbox list
  // so there's one tick, one place. Standalone fees (travel, pickup, Stay & Play,
  // toothbrush purchase, etc.) have no linked instruction option and stay here.
  const linkedAddonCodes = useMemo(() => {
    const set = new Set<string>();
    const opts = catalogQ.data?.options ?? [];
    for (const o of opts) if (o.addon_code) set.add(o.addon_code);
    // hand_strip is triggered by the boolean instruction group of the same code.
    set.add("hand_strip");
    // Travel on a mobile groom is enforced on the booking itself, never a tick box.
    set.add("travel_mobile");
    set.add("mobile_travel");
    return set;
  }, [catalogQ.data]);

  // Add-on codes that are already INCLUDED in the "Full" package (per the PDF):
  // teeth cleaning (gel), nail trimming, ear cleaning, anal gland express.
  // Hide these from Extras when the customer picks a Full package so we don't
  // double-charge. They stay available for Express or "no package" bookings.
  const BUNDLED_IN_FULL = new Set(["teeth_gel", "nails_trim", "ear_clean", "anal_gland"]);

  const speciesPackagesAll = (packagesQ.data ?? []).filter((p: GroomingPackage) => p.species === species);
  const petBand: GroomingSizeBand | null = petSizeToBand(petSize);
  // Filter by size band: keep packages that either target this band or are size-agnostic (null band).
  const filteredBySize = petBand
    ? speciesPackagesAll.filter((p) => p.size_band === petBand || p.size_band == null)
    : speciesPackagesAll;
  const activePkgEarly = speciesPackagesAll.find((p) => p.id === packageId) ?? null;
  const isFullPackage = activePkgEarly?.package_type === "full";

  // Individual treatments the customer can book on their own (nails only, ears only…).
  // Only offered when no package is picked — inside a package they're extras/instructions.
  const standaloneAddons = useMemo(
    () => (packageId ? [] : (addonsQ.data ?? []).filter((a) => a.bookable_standalone)),
    [addonsQ.data, packageId],
  );

  const visibleAddons = useMemo(
    () => (addonsQ.data ?? []).filter((a) => {
      if (standaloneAddons.some((s) => s.id === a.id)) return false;
      if (linkedAddonCodes.has(a.code)) return false;
      if (isFullPackage && BUNDLED_IN_FULL.has(a.code)) return false;
      return true;
    }),
    [addonsQ.data, linkedAddonCodes, isFullPackage, standaloneAddons],
  );

  // Seed selection from existing addons in edit mode.
  useEffect(() => {
    if (!bookingId) return;
    if (!existingQ.data) return;
    if (addonSelection.length > 0) return;
    onAddonChange(existingQ.data.map((r) => ({ addon_id: r.addon_id, qty: Number(r.qty) })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId, existingQ.data]);

  const speciesPackages = filteredBySize;
  const activePkg = activePkgEarly;
  const discountPct = Number(wfQ.data?.pensioner_discount_pct ?? 0);
  // Mobile grooming always carries the travel fee: fall back to the tenant default
  // when the booking hasn't got an explicit amount yet (the DB enforces the same rule).
  const defaultTravel = Number(wfQ.data?.default_mobile_travel_fee_zar ?? 0);
  const effectiveTravel = mode === "mobile" ? (Number(travelFee ?? 0) || defaultTravel) : 0;

  const preview = useMemo(() => {
    const base = Number(activePkg?.price_zar ?? 0);
    const addonRows = addonSelection
      .map((s) => {
        const a = (addonsQ.data ?? []).find((x: GroomingAddon) => x.id === s.addon_id);
        if (!a) return null;
        return { name: a.name, qty: s.qty, unit: Number(a.price_zar), total: Number(a.price_zar) * s.qty };
      })
      .filter(Boolean) as { name: string; qty: number; unit: number; total: number }[];
    const addonTotal = addonRows.reduce((s, r) => s + r.total, 0);
    const matted = Number(mattedSurchargeZar ?? 0);
    const sedation = Number(sedationSurchargeZar ?? 0);
    const travel = mode === "mobile" ? effectiveTravel : 0;
    const discountAmt = pensionerDiscount ? (base * discountPct) / 100 : 0;
    const total = base - discountAmt + addonTotal + matted + sedation + travel;
    const addonMinutes = addonSelection.reduce((sum, s) => {
      const a = (addonsQ.data ?? []).find((x: GroomingAddon) => x.id === s.addon_id);
      return sum + (Number(a?.duration_minutes ?? 0) * (s.qty || 1));
    }, 0);
    const minutes = Number(activePkg?.expected_minutes ?? 0) + addonMinutes;
    return { base, addonRows, addonTotal, matted, sedation, travel, discountAmt, total, addonMinutes, minutes };
  }, [activePkg, addonSelection, addonsQ.data, mode, effectiveTravel, mattedSurchargeZar, sedationSurchargeZar, pensionerDiscount, discountPct]);

  function toggleAddon(id: string) {
    const exists = addonSelection.find((s) => s.addon_id === id);
    if (exists) onAddonChange(addonSelection.filter((s) => s.addon_id !== id));
    else onAddonChange([...addonSelection, { addon_id: id, qty: 1 }]);
  }

  function setQty(id: string, qty: number) {
    onAddonChange(addonSelection.map((s) => (s.addon_id === id ? { ...s, qty: Math.max(1, qty) } : s)));
  }

  return (
    <div className="rounded-xl border border-border bg-white p-4">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Package, add-ons & price
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <div className="mb-1 text-xs font-medium">Package (rate card)</div>
          <select
            className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm"
            value={packageId ?? ""}
            onChange={(e) => onPackageChange(e.target.value || null)}
          >
            <option value="">— Select package —</option>
            {speciesPackages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {fmtZar(Number(p.price_zar))}
              </option>
            ))}
          </select>
          {speciesPackages.length === 0 && (
            <div className="mt-1 text-[11px] text-sk-orange">
              {petBand
                ? "No packages match this pet's size. Adjust the pet's size, apply a grooming size override, or add packages in Settings → Grooming rate card."
                : "No packages configured for this species. Set them up in Settings → Grooming rate card."}
            </div>
          )}
        </div>
        <div className="rounded-lg border border-dashed border-border bg-sk-surface-muted p-3 text-xs">
          {activePkg ? (
            <>
              <div className="font-medium">{activePkg.name}</div>
              <div className="text-muted-foreground">
                {fmtZar(Number(activePkg.price_zar))} · ~{activePkg.expected_minutes} min
              </div>
            </>
          ) : (
            <span className="text-muted-foreground">
              Pick a package — or choose individual treatments below for a quick visit.
            </span>
          )}
        </div>
      </div>

      {standaloneAddons.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 text-xs font-medium">Individual treatments (no package)</div>
          <div className="mb-2 text-[11px] text-muted-foreground">
            Quick single treatments — nails, ears, teeth, anal glands, hand stripping. Each one adds its own time to the appointment.
          </div>
          <div className="space-y-2">
            {standaloneAddons.map((a) => {
              const sel = addonSelection.find((s) => s.addon_id === a.id);
              return (
                <div key={a.id} className="flex items-center gap-3 rounded-lg border border-border bg-white px-3 py-2 text-sm">
                  <label className="flex flex-1 items-center gap-2">
                    <input type="checkbox" className="h-4 w-4" checked={!!sel} onChange={() => toggleAddon(a.id)} />
                    <span className="font-medium">{a.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {fmtZar(Number(a.price_zar))}{a.duration_minutes ? ` · ${a.duration_minutes} min` : ""}
                    </span>
                  </label>
                  {sel && (
                    <input
                      type="number" min={1} step={1} value={sel.qty}
                      onChange={(e) => setQty(a.id, Number(e.target.value))}
                      className="h-8 w-20 rounded-md border border-border bg-white px-2 text-sm"
                      title="Quantity"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-4">
        <div className="mb-2 text-xs font-medium">Extras & fees</div>
        <div className="mb-2 text-[11px] text-muted-foreground">
          Shampoo, teeth, ears, nails and other styling extras are picked in the Grooming instructions panel below.
        </div>
        {visibleAddons.length === 0 ? (
          <div className="text-[11px] text-muted-foreground">No standalone fees configured.</div>
        ) : (
          <div className="space-y-2">
            {visibleAddons.map((a) => {
              const sel = addonSelection.find((s) => s.addon_id === a.id);
              return (
                <div key={a.id} className="flex items-center gap-3 rounded-lg border border-border bg-white px-3 py-2 text-sm">
                  <label className="flex flex-1 items-center gap-2">
                    <input type="checkbox" className="h-4 w-4" checked={!!sel} onChange={() => toggleAddon(a.id)} />
                    <span className="font-medium">{a.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {fmtZar(Number(a.price_zar))}{a.duration_minutes ? ` · +${a.duration_minutes} min` : ""}
                    </span>
                  </label>
                  {sel && (
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={sel.qty}
                      onChange={(e) => setQty(a.id, Number(e.target.value))}
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

      {(activePkg || preview.addonTotal > 0 || preview.travel > 0 || preview.matted > 0 || preview.sedation > 0) && (
        <div className="mt-4 rounded-lg border border-border bg-sk-surface-muted p-3 text-sm">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Price preview</div>
          <div className="space-y-1">
            {activePkg ? (
              <Row label={`Package · ${activePkg.name}`} value={fmtZar(preview.base)} />
            ) : (
              <Row label="Individual treatments only" value={fmtZar(0)} />
            )}
            {preview.discountAmt > 0 && (
              <Row label={`Pensioner discount (${discountPct}%)`} value={"− " + fmtZar(preview.discountAmt)} />
            )}
            {preview.addonRows.map((r, i) => (
              <Row key={i} label={`${r.name}${r.qty > 1 ? ` × ${r.qty}` : ""}`} value={fmtZar(r.total)} />
            ))}
            {preview.matted > 0 && <Row label="Matted coat surcharge" value={fmtZar(preview.matted)} />}
            {preview.sedation > 0 && <Row label="Sedation surcharge" value={fmtZar(preview.sedation)} />}
            {preview.travel > 0 && <Row label="Mobile travel fee (always charged)" value={fmtZar(preview.travel)} />}
            <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-sm font-semibold">
              <span>Total (VAT incl.)</span>
              <span>{fmtZar(preview.total)}</span>
            </div>
            {preview.minutes > 0 && (
              <div className="flex items-center justify-between pt-1 text-xs text-muted-foreground">
                <span>Appointment length</span>
                <span>{preview.minutes} min{preview.addonMinutes > 0 ? ` (incl. ${preview.addonMinutes} min extras)` : ""}</span>
              </div>
            )}
          </div>
          <div className="mt-2 text-[11px] text-muted-foreground">
            The booking's invoice is re-priced automatically after save (until it is sent or paid).
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