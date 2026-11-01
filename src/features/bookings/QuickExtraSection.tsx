import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { useGroomingAddons, useGroomingPackages } from "@/features/settings/groomingRateCardQueries";
import { useBookingGroomingAddons } from "@/features/grooming/workflowQueries";
import { groomingAddonPrice } from "@/features/grooming/priceListRules";

const fmtZar = (n: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", minimumFractionDigits: 2 }).format(n);

/**
 * One-tap "add an extra" for a grooming booking (e.g. dematting, nail clip).
 * Writes a single grooming_booking_addons row (or bumps its qty); the existing
 * add-on invoice trigger keeps the booking's invoice in step, as with the full edit form.
 */
export function QuickExtraSection({
  tenantId,
  bookingId,
  packageId,
  locked,
}: {
  tenantId: string;
  bookingId: string;
  packageId: string | null;
  locked: boolean;
}) {
  const qc = useQueryClient();
  const addonsQ = useGroomingAddons(tenantId, { activeOnly: true });
  const packagesQ = useGroomingPackages(tenantId, { activeOnly: true });
  const existingQ = useBookingGroomingAddons(bookingId);
  const [open, setOpen] = useState(false);
  const [addonId, setAddonId] = useState("");
  const [busy, setBusy] = useState(false);

  const pkgType = (packagesQ.data ?? []).find((p) => p.id === packageId)?.package_type ?? null;
  const addons = (addonsQ.data ?? []).filter((a) => !["travel_mobile", "mobile_travel"].includes(a.code));
  const existing = existingQ.data ?? [];

  async function add() {
    const addon = addons.find((a) => a.id === addonId);
    if (!addon) return;
    setBusy(true);
    try {
      const price = groomingAddonPrice(addon.code, Number(addon.price_zar ?? 0), pkgType);
      const row = existing.find((r: any) => r.addon_id === addon.id) as any;
      const res = row
        ? await supabase.from("grooming_booking_addons" as any).update({ qty: Number(row.qty ?? 1) + 1 } as any).eq("id", row.id)
        : await supabase.from("grooming_booking_addons" as any).insert({
            tenant_id: tenantId,
            booking_id: bookingId,
            addon_id: addon.id,
            addon_code: addon.code,
            addon_name: addon.name,
            price_zar_snapshot: price,
            qty: 1,
          } as any);
      if (res.error) throw res.error;
      qc.invalidateQueries({ queryKey: ["grooming_booking_addons", bookingId] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["bookings"] });
      toast.success(`${addon.name} added${price ? ` (${fmtZar(price)})` : " (included in package)"}`);
      setAddonId("");
      setOpen(false);
    } catch (err: any) {
      toast.error(err?.message ?? "Could not add the extra");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Extras</div>
        {!locked && !open && (
          <button
            onClick={() => setOpen(true)}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-semibold hover:bg-muted"
          >
            <Plus className="h-3.5 w-3.5" /> Add extra
          </button>
        )}
      </div>
      {existing.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {existing.map((r: any) => (
            <li key={r.id} className="flex justify-between text-sm">
              <span>{r.addon_name ?? r.addon_code}{Number(r.qty) > 1 ? ` × ${r.qty}` : ""}</span>
              <span className="tabular-nums text-muted-foreground">{fmtZar(Number(r.price_zar_snapshot ?? 0) * Number(r.qty ?? 1))}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">No extras yet.</p>
      )}
      {open && (
        <div className="mt-2 flex flex-wrap gap-2">
          <select
            value={addonId}
            onChange={(e) => setAddonId(e.target.value)}
            className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-sm"
            aria-label="Extra to add"
          >
            <option value="">Choose an extra…</option>
            {addons.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} — {fmtZar(groomingAddonPrice(a.code, Number(a.price_zar ?? 0), pkgType))}
              </option>
            ))}
          </select>
          <button
            onClick={add}
            disabled={!addonId || busy}
            className="h-9 rounded-lg bg-sk-coral px-3 text-sm font-semibold text-primary-foreground hover:bg-sk-coral-dark disabled:opacity-50"
          >
            {busy ? "Adding…" : "Add"}
          </button>
          <button onClick={() => setOpen(false)} className="h-9 rounded-lg border border-border px-3 text-sm hover:bg-muted">
            Cancel
          </button>
        </div>
      )}
    </section>
  );
}
