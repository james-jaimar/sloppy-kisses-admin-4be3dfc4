import { useEffect, useMemo } from "react";
import { useGroomingPackages, useGroomingAddons, type GroomingAddon, type GroomingPackage } from "@/features/settings/groomingRateCardQueries";
import { useGroomingWorkflowSettings, useBookingGroomingAddons } from "@/features/grooming/workflowQueries";

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
}: {
  tenantId: string;
  bookingId: string | null;
  species: "dog" | "cat" | "rabbit";
  mode: "in_house" | "mobile";
  packageId: string | null;
  onPackageChange: (id: string | null) => void;
  addonSelection: GroomingAddonSelection[];
  onAddonChange: (rows: GroomingAddonSelection[]) => void;
  pensionerDiscount: boolean;
  mattedSurchargeZar: number | null;
  sedationSurchargeZar: number | null;
  travelFee: number | null;
}) {
  const packagesQ = useGroomingPackages(tenantId, { activeOnly: true });
  const addonsQ = useGroomingAddons(tenantId, { activeOnly: true });
  const wfQ = useGroomingWorkflowSettings(tenantId);
  const existingQ = useBookingGroomingAddons(bookingId);

  // Seed selection from existing addons in edit mode.
  useEffect(() => {
    if (!bookingId) return;
    if (!existingQ.data) return;
    if (addonSelection.length > 0) return;
    onAddonChange(existingQ.data.map((r) => ({ addon_id: r.addon_id, qty: Number(r.qty) })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId, existingQ.data]);

  const speciesPackages = (packagesQ.data ?? []).filter((p: GroomingPackage) => p.species === species);
  const activePkg = speciesPackages.find((p) => p.id === packageId) ?? null;
  const discountPct = Number(wfQ.data?.pensioner_discount_pct ?? 0);

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
    const travel = mode === "mobile" ? Number(travelFee ?? 0) : 0;
    const discountAmt = pensionerDiscount ? (base * discountPct) / 100 : 0;
    const total = base - discountAmt + addonTotal + matted + sedation + travel;
    return { base, addonRows, addonTotal, matted, sedation, travel, discountAmt, total };
  }, [activePkg, addonSelection, addonsQ.data, mode, travelFee, mattedSurchargeZar, sedationSurchargeZar, pensionerDiscount, discountPct]);

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
              No packages configured for this species. Set them up in Settings → Grooming rate card.
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
            <span className="text-muted-foreground">Pick a package to price this booking.</span>
          )}
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-2 text-xs font-medium">Add-ons</div>
        {(addonsQ.data ?? []).length === 0 ? (
          <div className="text-[11px] text-muted-foreground">No add-ons configured.</div>
        ) : (
          <div className="space-y-2">
            {(addonsQ.data ?? []).map((a) => {
              const sel = addonSelection.find((s) => s.addon_id === a.id);
              return (
                <div key={a.id} className="flex items-center gap-3 rounded-lg border border-border bg-white px-3 py-2 text-sm">
                  <label className="flex flex-1 items-center gap-2">
                    <input type="checkbox" className="h-4 w-4" checked={!!sel} onChange={() => toggleAddon(a.id)} />
                    <span className="font-medium">{a.name}</span>
                    <span className="text-xs text-muted-foreground">{fmtZar(Number(a.price_zar))}</span>
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

      {activePkg && (
        <div className="mt-4 rounded-lg border border-border bg-sk-surface-muted p-3 text-sm">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Price preview</div>
          <div className="space-y-1">
            <Row label={`Package · ${activePkg.name}`} value={fmtZar(preview.base)} />
            {preview.discountAmt > 0 && (
              <Row label={`Pensioner discount (${discountPct}%)`} value={"− " + fmtZar(preview.discountAmt)} />
            )}
            {preview.addonRows.map((r, i) => (
              <Row key={i} label={`${r.name}${r.qty > 1 ? ` × ${r.qty}` : ""}`} value={fmtZar(r.total)} />
            ))}
            {preview.matted > 0 && <Row label="Matted coat surcharge" value={fmtZar(preview.matted)} />}
            {preview.sedation > 0 && <Row label="Sedation surcharge" value={fmtZar(preview.sedation)} />}
            {preview.travel > 0 && <Row label="Mobile travel fee" value={fmtZar(preview.travel)} />}
            <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-sm font-semibold">
              <span>Total (excl. VAT changes)</span>
              <span>{fmtZar(preview.total)}</span>
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