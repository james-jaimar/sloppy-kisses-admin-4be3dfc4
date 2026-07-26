import { useMemo, useState } from "react";
import { Plus, Save, X, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant, useCurrentUser } from "@/lib/tenant/TenantContext";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  HOTEL_SPECIES_LABEL,
  useHotelRateCards, useCreateHotelRateCard, useUpdateHotelRateCard, useDeleteHotelRateCard,
  useHotelSurcharges, useCreateHotelSurcharge, useUpdateHotelSurcharge, useDeleteHotelSurcharge,
  type HotelRateCard, type HotelSurcharge, type HotelSpecies,
  type PetSizeBand, SIZE_BAND_ORDER, SIZE_BAND_LABEL,
} from "./hotelRateCardQueries";

const PERMISSION = "settings.hotel.manage";

type RCDraft = Partial<HotelRateCard> & { active?: boolean };
type SDraft = Partial<HotelSurcharge> & { active?: boolean };

function emptyRate(): RCDraft {
  return { species: "dog", accommodation_type: "standard", display_name: "", nightly_rate_zar: 0, peak_uplift_pct: 0, extra_pet_rate_zar: 0, active: true, sort_order: 100, min_size_band: null, max_size_band: null };
}
function emptySurcharge(): SDraft {
  return { code: "", name: "", price_zar: 0, per_night: false, active: true, sort_order: 100 };
}

export default function HotelRatesPage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const confirm = useConfirm();
  const { hasPermission } = useCurrentUser();
  const canManage = hasPermission(PERMISSION);
  const [tab, setTab] = useState<"rates" | "surcharges">("rates");

  return (
    <>
      <AppHeader
        title="Hotel & Cattery rates"
        subtitle="Nightly rates by species and accommodation, and optional per-stay surcharges."
      />
      <div className="flex-1 space-y-4 p-6">
        {!canManage && (
          <div className="sk-card p-4 text-sm text-muted-foreground">
            Read-only view. Ask an admin with the <code>{PERMISSION}</code> permission to make changes.
          </div>
        )}
        <div className="flex gap-2 border-b border-border">
          <button onClick={() => setTab("rates")}
            className={"px-4 py-2 text-sm font-semibold " + (tab === "rates" ? "border-b-2 border-sk-coral text-foreground" : "text-muted-foreground")}>Rate cards</button>
          <button onClick={() => setTab("surcharges")}
            className={"px-4 py-2 text-sm font-semibold " + (tab === "surcharges" ? "border-b-2 border-sk-coral text-foreground" : "text-muted-foreground")}>Surcharges</button>
        </div>

        {tab === "rates"
          ? <RateCardsTable tenantId={tenantId} canManage={canManage} confirm={confirm} />
          : <SurchargesTable tenantId={tenantId} canManage={canManage} confirm={confirm} />}
      </div>
    </>
  );
}

function RateCardsTable({ tenantId, canManage, confirm }: { tenantId: string | null; canManage: boolean; confirm: ReturnType<typeof useConfirm> }) {
function SizeBandRangeEditor({ min, max, onChange }: { min: PetSizeBand | null; max: PetSizeBand | null; onChange: (min: PetSizeBand | null, max: PetSizeBand | null) => void }) {
  return (
    <div className="flex items-center gap-1">
      <select value={min ?? ""} onChange={(e) => onChange((e.target.value || null) as PetSizeBand | null, max)}
        className="h-8 rounded border border-border bg-white px-1 text-xs">
        <option value="">any</option>
        {SIZE_BAND_ORDER.map((s) => <option key={s} value={s}>{SIZE_BAND_LABEL[s]}</option>)}
      </select>
      <span className="text-xs text-muted-foreground">→</span>
      <select value={max ?? ""} onChange={(e) => onChange(min, (e.target.value || null) as PetSizeBand | null)}
        className="h-8 rounded border border-border bg-white px-1 text-xs">
        <option value="">any</option>
        {SIZE_BAND_ORDER.map((s) => <option key={s} value={s}>{SIZE_BAND_LABEL[s]}</option>)}
      </select>
    </div>
  );
}

function RateCardsTable_placeholder() { return null; }
// original RateCardsTable follows
function RateCardsTable({ tenantId, canManage, confirm }: { tenantId: string | null; canManage: boolean; confirm: ReturnType<typeof useConfirm> }) {
  const listQ = useHotelRateCards(tenantId);
  const create = useCreateHotelRateCard(tenantId ?? "");
  const update = useUpdateHotelRateCard(tenantId ?? "");
  const del = useDeleteHotelRateCard(tenantId ?? "");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<RCDraft>({});
  const [creating, setCreating] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const rows = useMemo(() => (listQ.data ?? []).filter((r) => showInactive || r.active), [listQ.data, showInactive]);

  async function saveNew() {
    if (!draft.display_name || !draft.accommodation_type) { toast.error("Display name and accommodation type are required"); return; }
    try {
      await create.mutateAsync({
        species: (draft.species ?? "dog") as HotelSpecies,
        accommodation_type: draft.accommodation_type!,
        display_name: draft.display_name!,
        nightly_rate_zar: Number(draft.nightly_rate_zar ?? 0),
        peak_uplift_pct: Number(draft.peak_uplift_pct ?? 0),
        extra_pet_rate_zar: Number(draft.extra_pet_rate_zar ?? 0),
        active: draft.active ?? true,
        sort_order: Number(draft.sort_order ?? 100),
        min_size_band: (draft.min_size_band ?? null) as PetSizeBand | null,
        max_size_band: (draft.max_size_band ?? null) as PetSizeBand | null,
      });
      toast.success("Rate created");
      setCreating(false); setDraft({});
    } catch (err: any) { toast.error(err?.message ?? "Failed to create"); }
  }

  async function saveEdit() {
    if (!editingId) return;
    try {
      await update.mutateAsync({ id: editingId, patch: {
        display_name: draft.display_name,
        nightly_rate_zar: Number(draft.nightly_rate_zar ?? 0),
        peak_uplift_pct: Number(draft.peak_uplift_pct ?? 0),
        extra_pet_rate_zar: Number(draft.extra_pet_rate_zar ?? 0),
        active: draft.active,
        sort_order: Number(draft.sort_order ?? 100),
        min_size_band: (draft.min_size_band ?? null) as PetSizeBand | null,
        max_size_band: (draft.max_size_band ?? null) as PetSizeBand | null,
      }});
      toast.success("Rate updated");
      setEditingId(null);
    } catch (err: any) { toast.error(err?.message ?? "Failed to update"); }
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="h-4 w-4" />
          Show inactive
        </label>
        {canManage && (
          <button onClick={() => { setCreating(true); setEditingId(null); setDraft(emptyRate()); }}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-sk-coral px-4 text-sm font-semibold text-white hover:bg-sk-coral-dark">
            <Plus className="h-4 w-4" /> New rate
          </button>
        )}
      </div>

      <div className="sk-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-sk-surface-muted text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Species</th>
              <th className="px-4 py-3">Accommodation</th>
              <th className="px-4 py-3">Display name</th>
              <th className="px-4 py-3 text-right">Nightly (ZAR)</th>
              <th className="px-4 py-3 text-right">Peak uplift %</th>
              <th className="px-4 py-3 text-right">Extra pet (ZAR)</th>
              <th className="px-4 py-3">Size range</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {creating && (
              <tr className="bg-sk-coral-soft/40">
                <td className="px-4 py-2">
                  <select value={draft.species ?? "dog"} onChange={(e) => setDraft({ ...draft, species: e.target.value as HotelSpecies })}
                    className="h-8 rounded border border-border bg-white px-2 text-sm">
                    <option value="dog">Dog</option><option value="cat">Cat</option>
                  </select>
                </td>
                <td className="px-4 py-2">
                  <input value={draft.accommodation_type ?? ""} onChange={(e) => setDraft({ ...draft, accommodation_type: e.target.value })}
                    placeholder="e.g. standard, suite, cattery"
                    className="h-8 w-40 rounded border border-border bg-white px-2 text-sm" />
                </td>
                <td className="px-4 py-2">
                  <input value={draft.display_name ?? ""} onChange={(e) => setDraft({ ...draft, display_name: e.target.value })}
                    className="h-8 w-full rounded border border-border bg-white px-2 text-sm" />
                </td>
                <td className="px-4 py-2 text-right">
                  <input type="number" value={draft.nightly_rate_zar ?? 0} onChange={(e) => setDraft({ ...draft, nightly_rate_zar: Number(e.target.value) })}
                    className="h-8 w-24 rounded border border-border bg-white px-2 text-right text-sm" />
                </td>
                <td className="px-4 py-2 text-right">
                  <input type="number" value={draft.peak_uplift_pct ?? 0} onChange={(e) => setDraft({ ...draft, peak_uplift_pct: Number(e.target.value) })}
                    className="h-8 w-20 rounded border border-border bg-white px-2 text-right text-sm" />
                </td>
                <td className="px-4 py-2 text-right">
                  <input type="number" value={draft.extra_pet_rate_zar ?? 0} onChange={(e) => setDraft({ ...draft, extra_pet_rate_zar: Number(e.target.value) })}
                    className="h-8 w-24 rounded border border-border bg-white px-2 text-right text-sm" />
                </td>
                <td className="px-4 py-2">
                  <SizeBandRangeEditor
                    min={draft.min_size_band ?? null}
                    max={draft.max_size_band ?? null}
                    onChange={(min, max) => setDraft({ ...draft, min_size_band: min, max_size_band: max })}
                  />
                </td>
                <td className="px-4 py-2 text-muted-foreground">New</td>
                <td className="px-4 py-2">
                  <div className="flex justify-end gap-1">
                    <button onClick={saveNew} className="grid h-8 w-8 place-items-center rounded text-sk-green hover:bg-sk-green-soft"><Save className="h-4 w-4" /></button>
                    <button onClick={() => { setCreating(false); setDraft({}); }} className="grid h-8 w-8 place-items-center rounded text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
                  </div>
                </td>
              </tr>
            )}
            {listQ.isLoading && <tr><td colSpan={9} className="px-4 py-6 text-center text-muted-foreground">Loading…</td></tr>}
            {!listQ.isLoading && rows.length === 0 && !creating && (
              <tr><td colSpan={9} className="px-4 py-6 text-center text-muted-foreground">No rates configured yet.</td></tr>
            )}
            {rows.map((r) => {
              const isEditing = editingId === r.id;
              return (
                <tr key={r.id} className={r.active ? "" : "opacity-60"}>
                  <td className="px-4 py-3">{HOTEL_SPECIES_LABEL[r.species]}</td>
                  <td className="px-4 py-3 capitalize">{r.accommodation_type}</td>
                  <td className="px-4 py-3">
                    {isEditing
                      ? <input value={draft.display_name ?? ""} onChange={(e) => setDraft({ ...draft, display_name: e.target.value })}
                          className="h-8 w-full rounded border border-border bg-white px-2 text-sm" />
                      : <span className="font-medium">{r.display_name}</span>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {isEditing
                      ? <input type="number" value={draft.nightly_rate_zar ?? 0} onChange={(e) => setDraft({ ...draft, nightly_rate_zar: Number(e.target.value) })}
                          className="h-8 w-24 rounded border border-border bg-white px-2 text-right text-sm" />
                      : `R ${r.nightly_rate_zar}`}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {isEditing
                      ? <input type="number" value={draft.peak_uplift_pct ?? 0} onChange={(e) => setDraft({ ...draft, peak_uplift_pct: Number(e.target.value) })}
                          className="h-8 w-20 rounded border border-border bg-white px-2 text-right text-sm" />
                      : `${r.peak_uplift_pct}%`}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {isEditing
                      ? <input type="number" value={draft.extra_pet_rate_zar ?? 0} onChange={(e) => setDraft({ ...draft, extra_pet_rate_zar: Number(e.target.value) })}
                          className="h-8 w-24 rounded border border-border bg-white px-2 text-right text-sm" />
                      : `R ${r.extra_pet_rate_zar}`}
                  </td>
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <SizeBandRangeEditor
                        min={draft.min_size_band ?? null}
                        max={draft.max_size_band ?? null}
                        onChange={(min, max) => setDraft({ ...draft, min_size_band: min, max_size_band: max })}
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {r.min_size_band || r.max_size_band
                          ? `${r.min_size_band ? SIZE_BAND_LABEL[r.min_size_band] : "any"} → ${r.max_size_band ? SIZE_BAND_LABEL[r.max_size_band] : "any"}`
                          : "All sizes"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <label className="flex items-center gap-2 text-xs">
                        <input type="checkbox" checked={draft.active ?? true} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} className="h-4 w-4" />
                        Active
                      </label>
                    ) : (
                      <span className={"inline-flex rounded-full px-2 py-0.5 text-xs font-medium " + (r.active ? "bg-sk-green-soft text-sk-green" : "bg-muted text-muted-foreground")}>
                        {r.active ? "Active" : "Inactive"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {isEditing ? (
                        <>
                          <button onClick={saveEdit} className="grid h-8 w-8 place-items-center rounded text-sk-green hover:bg-sk-green-soft"><Save className="h-4 w-4" /></button>
                          <button onClick={() => { setEditingId(null); setDraft({}); }} className="grid h-8 w-8 place-items-center rounded text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
                        </>
                      ) : canManage ? (
                        <>
                          <button onClick={() => { setEditingId(r.id); setDraft({ ...r }); setCreating(false); }}
                            className="rounded-lg px-3 py-1 text-xs font-medium text-sk-coral-dark hover:bg-sk-coral-soft">Edit</button>
                          <button
                            onClick={async () => {
                              if (!(await confirm({ title: `Delete rate "${r.display_name}"?`, confirmLabel: "Delete", tone: "destructive" }))) return;
                              try { await del.mutateAsync(r.id); toast.success("Deleted"); }
                              catch (err: any) { toast.error(err?.message ?? "Failed to delete"); }
                            }}
                            disabled={del.isPending}
                            className="grid h-8 w-8 place-items-center rounded text-sk-coral-dark hover:bg-sk-coral-soft disabled:opacity-50"
                          ><Trash2 className="h-4 w-4" /></button>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function SurchargesTable({ tenantId, canManage, confirm }: { tenantId: string | null; canManage: boolean; confirm: ReturnType<typeof useConfirm> }) {
  const listQ = useHotelSurcharges(tenantId);
  const create = useCreateHotelSurcharge(tenantId ?? "");
  const update = useUpdateHotelSurcharge(tenantId ?? "");
  const del = useDeleteHotelSurcharge(tenantId ?? "");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<SDraft>({});
  const [creating, setCreating] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const rows = useMemo(() => (listQ.data ?? []).filter((r) => showInactive || r.active), [listQ.data, showInactive]);

  async function saveNew() {
    if (!draft.code || !draft.name) { toast.error("Code and name are required"); return; }
    try {
      await create.mutateAsync({
        code: draft.code!, name: draft.name!,
        price_zar: Number(draft.price_zar ?? 0),
        per_night: draft.per_night ?? false,
        active: draft.active ?? true,
        sort_order: Number(draft.sort_order ?? 100),
      });
      toast.success("Surcharge created");
      setCreating(false); setDraft({});
    } catch (err: any) { toast.error(err?.message ?? "Failed to create"); }
  }
  async function saveEdit() {
    if (!editingId) return;
    try {
      await update.mutateAsync({ id: editingId, patch: {
        name: draft.name,
        price_zar: Number(draft.price_zar ?? 0),
        per_night: draft.per_night,
        active: draft.active,
        sort_order: Number(draft.sort_order ?? 100),
      }});
      toast.success("Surcharge updated"); setEditingId(null);
    } catch (err: any) { toast.error(err?.message ?? "Failed to update"); }
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="h-4 w-4" />
          Show inactive
        </label>
        {canManage && (
          <button onClick={() => { setCreating(true); setEditingId(null); setDraft(emptySurcharge()); }}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-sk-coral px-4 text-sm font-semibold text-white hover:bg-sk-coral-dark">
            <Plus className="h-4 w-4" /> New surcharge
          </button>
        )}
      </div>
      <div className="sk-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-sk-surface-muted text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3 text-right">Price (ZAR)</th>
              <th className="px-4 py-3">Per-night?</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {creating && (
              <tr className="bg-sk-coral-soft/40">
                <td className="px-4 py-2">
                  <input value={draft.code ?? ""} onChange={(e) => setDraft({ ...draft, code: e.target.value })}
                    className="h-8 w-32 rounded border border-border bg-white px-2 text-sm" />
                </td>
                <td className="px-4 py-2">
                  <input value={draft.name ?? ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    className="h-8 w-full rounded border border-border bg-white px-2 text-sm" />
                </td>
                <td className="px-4 py-2 text-right">
                  <input type="number" value={draft.price_zar ?? 0} onChange={(e) => setDraft({ ...draft, price_zar: Number(e.target.value) })}
                    className="h-8 w-24 rounded border border-border bg-white px-2 text-right text-sm" />
                </td>
                <td className="px-4 py-2">
                  <label className="flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={draft.per_night ?? false} onChange={(e) => setDraft({ ...draft, per_night: e.target.checked })} className="h-4 w-4" />
                    Per night
                  </label>
                </td>
                <td className="px-4 py-2 text-muted-foreground">New</td>
                <td className="px-4 py-2">
                  <div className="flex justify-end gap-1">
                    <button onClick={saveNew} className="grid h-8 w-8 place-items-center rounded text-sk-green hover:bg-sk-green-soft"><Save className="h-4 w-4" /></button>
                    <button onClick={() => { setCreating(false); setDraft({}); }} className="grid h-8 w-8 place-items-center rounded text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
                  </div>
                </td>
              </tr>
            )}
            {listQ.isLoading && <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">Loading…</td></tr>}
            {!listQ.isLoading && rows.length === 0 && !creating && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">No surcharges yet.</td></tr>
            )}
            {rows.map((r) => {
              const isEditing = editingId === r.id;
              return (
                <tr key={r.id} className={r.active ? "" : "opacity-60"}>
                  <td className="px-4 py-3 font-mono text-xs">{r.code}</td>
                  <td className="px-4 py-3">
                    {isEditing
                      ? <input value={draft.name ?? ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                          className="h-8 w-full rounded border border-border bg-white px-2 text-sm" />
                      : <span className="font-medium">{r.name}</span>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {isEditing
                      ? <input type="number" value={draft.price_zar ?? 0} onChange={(e) => setDraft({ ...draft, price_zar: Number(e.target.value) })}
                          className="h-8 w-24 rounded border border-border bg-white px-2 text-right text-sm" />
                      : `R ${r.price_zar}`}
                  </td>
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <label className="flex items-center gap-2 text-xs">
                        <input type="checkbox" checked={draft.per_night ?? false} onChange={(e) => setDraft({ ...draft, per_night: e.target.checked })} className="h-4 w-4" />
                        Per night
                      </label>
                    ) : (r.per_night ? "Per night" : "Per stay")}
                  </td>
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <label className="flex items-center gap-2 text-xs">
                        <input type="checkbox" checked={draft.active ?? true} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} className="h-4 w-4" />
                        Active
                      </label>
                    ) : (
                      <span className={"inline-flex rounded-full px-2 py-0.5 text-xs font-medium " + (r.active ? "bg-sk-green-soft text-sk-green" : "bg-muted text-muted-foreground")}>
                        {r.active ? "Active" : "Inactive"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {isEditing ? (
                        <>
                          <button onClick={saveEdit} className="grid h-8 w-8 place-items-center rounded text-sk-green hover:bg-sk-green-soft"><Save className="h-4 w-4" /></button>
                          <button onClick={() => { setEditingId(null); setDraft({}); }} className="grid h-8 w-8 place-items-center rounded text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
                        </>
                      ) : canManage ? (
                        <>
                          <button onClick={() => { setEditingId(r.id); setDraft({ ...r }); setCreating(false); }}
                            className="rounded-lg px-3 py-1 text-xs font-medium text-sk-coral-dark hover:bg-sk-coral-soft">Edit</button>
                          <button
                            onClick={async () => {
                              if (!(await confirm({ title: `Delete surcharge "${r.name}"?`, confirmLabel: "Delete", tone: "destructive" }))) return;
                              try { await del.mutateAsync(r.id); toast.success("Deleted"); }
                              catch (err: any) { toast.error(err?.message ?? "Failed to delete (in use?)"); }
                            }}
                            disabled={del.isPending}
                            className="grid h-8 w-8 place-items-center rounded text-sk-coral-dark hover:bg-sk-coral-soft disabled:opacity-50"
                          ><Trash2 className="h-4 w-4" /></button>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}