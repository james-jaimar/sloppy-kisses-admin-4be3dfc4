import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Trash2, Sparkles, AlertTriangle, Scissors, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { addDays, format } from "date-fns";
import { ModalShell } from "@/components/modals/ModalShell";
import { useCustomerPets } from "@/features/customers/queries";
import { CustomerCombobox } from "@/components/customers/CustomerCombobox";
import {
  useHotelRateCards, useHotelSurcharges, SIZE_BAND_ORDER, type PetSizeBand,
} from "@/features/settings/hotelRateCardQueries";
import {
  CHECK_IN_WINDOWS, checkOutWindowsFor, isStayPlayWindow,
} from "@/features/hotelForm/accommodationForm";
import {
  usePublicHolidays, movementBlockReason, MOVEMENT_RULES_NOTE,
} from "@/features/hotelForm/dayRules";
import {
  useCreateQuote, useHotelStayLinesPerPet, useQuoteValidityDays, usePencilledDays,
  type QuoteExtras,
} from "./queries";

const input = "h-10 w-full rounded-lg border border-border bg-white px-3 text-sm";
const label = "mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground";

interface Line { description: string; quantity: number; unit_price: number }

function bandIndex(b: PetSizeBand | null | undefined) {
  return b ? SIZE_BAND_ORDER.indexOf(b) : -1;
}
function rateAllowsSize(
  r: { min_size_band: PetSizeBand | null; max_size_band: PetSizeBand | null },
  size: PetSizeBand | null,
) {
  if (!r.min_size_band && !r.max_size_band) return true;
  if (!size) return false;
  const idx = bandIndex(size);
  const lo = r.min_size_band ? bandIndex(r.min_size_band) : 0;
  const hi = r.max_size_band ? bandIndex(r.max_size_band) : SIZE_BAND_ORDER.length - 1;
  return idx >= lo && idx <= hi;
}

export function NewQuoteDrawer({ tenantId, onClose }: { tenantId: string; onClose: () => void }) {
  const navigate = useNavigate();
  const [customerId, setCustomerId] = useState("");
  const [petIds, setPetIds] = useState<string[]>([]);
  const [serviceType, setServiceType] = useState("hotel_dog");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [accommodation, setAccommodation] = useState("");
  const [notes, setNotes] = useState("");
  const [extraLines, setExtraLines] = useState<Line[]>([]);
  const [expiry, setExpiry] = useState("");
  const [checkOutWindow, setCheckOutWindow] = useState("");
  const [surcharges, setSurcharges] = useState<Record<string, number>>({});
  const [grooming, setGrooming] = useState<Record<string, { on: boolean; notes: string }>>({});
  /** Accommodation per dog — two dogs of different sizes can be in different areas. */
  const [petAcc, setPetAcc] = useState<Record<string, string>>({});

  const petsQ = useCustomerPets(customerId || null, tenantId);
  const ratesQ = useHotelRateCards(tenantId, { activeOnly: true });
  const surchargesQ = useHotelSurcharges(tenantId, { activeOnly: true });
  const validityQ = useQuoteValidityDays(tenantId);
  const holidaysQ = usePublicHolidays(tenantId);
  const create = useCreateQuote(tenantId);

  const species: "dog" | "cat" = serviceType === "hotel_cat" ? "cat" : "dog";
  const rates = (ratesQ.data ?? []).filter((r) => r.species === species);
  const selectedPets = (petsQ.data ?? []).filter((p: any) => petIds.includes(p.id));

  const accFor = (petId: string) => petAcc[petId] || accommodation;

  const stayPets = useMemo(
    () =>
      selectedPets.map((p: any) => ({ name: p.name as string, accommodation_type: accFor(p.id) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedPets, petAcc, accommodation],
  );

  const pricedQ = useHotelStayLinesPerPet({
    tenantId,
    species,
    start: startDate || null,
    end: endDate || null,
    pets: stayPets,
  });
  const pencilledQ = usePencilledDays({ tenantId, start: startDate || null, end: endDate || null });

  useEffect(() => {
    if (!expiry && validityQ.data) {
      setExpiry(format(addDays(new Date(), validityQ.data), "yyyy-MM-dd"));
    }
  }, [validityQ.data, expiry]);

  useEffect(() => { setPetIds([]); setGrooming({}); setPetAcc({}); }, [customerId]);

  // Default each dog to an area that fits its size (falling back to the stay default).
  useEffect(() => {
    if (selectedPets.length === 0 || rates.length === 0) return;
    setPetAcc((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const p of selectedPets as any[]) {
        if (next[p.id]) continue;
        const fit = rates.find((r: any) => rateAllowsSize(r, p.size ?? null));
        const val = accommodation || fit?.accommodation_type;
        if (val) { next[p.id] = val; changed = true; }
      }
      return changed ? next : prev;
    });
  }, [selectedPets, rates, accommodation]);

  const checkOutOptions = useMemo(() => checkOutWindowsFor(endDate || null), [endDate]);
  useEffect(() => {
    if (checkOutOptions.length && !checkOutOptions.includes(checkOutWindow)) {
      setCheckOutWindow(checkOutOptions[0]);
    }
  }, [checkOutOptions, checkOutWindow]);

  const checkInBlock = movementBlockReason(startDate || null, "dropoff", holidaysQ.data);
  const checkOutBlock = movementBlockReason(endDate || null, "collection", holidaysQ.data);

  const nights = useMemo(() => {
    if (!startDate || !endDate) return 0;
    return Math.max(0, Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000));
  }, [startDate, endDate]);

  const stayLines: Line[] = useMemo(
    () => (pricedQ.data ?? []).map((l) => ({ description: l.description, quantity: l.quantity, unit_price: l.unit_price })),
    [pricedQ.data],
  );

  // Surcharge lines (Stay & Play, extra food, meds, etc.)
  const surchargeLines: Line[] = useMemo(() => {
    const cat = surchargesQ.data ?? [];
    return Object.entries(surcharges)
      .filter(([, qty]) => qty > 0)
      .map(([id, qty]) => {
        const s: any = cat.find((x: any) => x.id === id);
        if (!s) return null;
        const perNight = s.unit === "per_night" || s.per_night;
        const quantity = perNight ? qty * Math.max(1, nights) : qty;
        return {
          description: `${s.name}${perNight ? " (per night)" : ""}`,
          quantity,
          unit_price: Number(s.amount_zar ?? s.price_zar ?? 0),
        } as Line;
      })
      .filter(Boolean) as Line[];
  }, [surcharges, surchargesQ.data, nights]);

  const allLines = [...stayLines, ...surchargeLines, ...extraLines];
  const total = allLines.reduce((s, l) => s + l.quantity * l.unit_price, 0);

  const sizeWarnings = useMemo(() => {
    const out: string[] = [];
    for (const p of selectedPets as any[]) {
      const rate: any = rates.find((r: any) => r.accommodation_type === accFor(p.id));
      if (!rate) continue;
      if (!rateAllowsSize(rate, p.size ?? null)) {
        out.push(`${p.name}${p.size ? ` (${p.size})` : " (no size on file)"} does not fit ${rate.display_name}`);
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rates, accommodation, petAcc, selectedPets]);

  // Default to the accommodation that suits the selected pets.
  useEffect(() => {
    if (accommodation || selectedPets.length === 0 || rates.length === 0) return;
    const fit = rates.find((r: any) => selectedPets.every((p: any) => rateAllowsSize(r, p.size ?? null)));
    if (fit) setAccommodation(fit.accommodation_type);
  }, [rates, selectedPets, accommodation]);

  const pencilledForStay = useMemo(() => {
    const rows = (pencilledQ.data ?? []).filter((r) => !accommodation || r.accommodation_type === accommodation);
    if (rows.length === 0) return 0;
    return Math.max(...rows.map((r) => r.pets));
  }, [pencilledQ.data, accommodation]);

  const stayPlay = isStayPlayWindow(checkOutWindow);

  // Stay & Play is charged by the collection-window button, not by the extras list.
  const stayPlaySurcharge: any = useMemo(
    () => (surchargesQ.data ?? []).find((s: any) => s.code === "late_checkout") ?? null,
    [surchargesQ.data],
  );
  const stayPlayUnit = Number(stayPlaySurcharge?.amount_zar ?? stayPlaySurcharge?.price_zar ?? 0);
  const stayPlayQty = Math.max(1, petIds.length);

  useEffect(() => {
    if (!stayPlaySurcharge) return;
    const id = stayPlaySurcharge.id;
    setSurcharges((prev) => {
      const want = stayPlay ? stayPlayQty : 0;
      const cur = prev[id] ?? 0;
      if (cur === want) return prev;
      const next = { ...prev };
      if (want > 0) next[id] = want;
      else delete next[id];
      return next;
    });
  }, [stayPlay, stayPlayQty, stayPlaySurcharge]);

  async function save() {
    if (!customerId) { toast.error("Pick a customer"); return; }
    if (petIds.length === 0) { toast.error("Pick at least one pet"); return; }
    if (!accommodation || nights < 1) { toast.error("Choose an accommodation type and dates"); return; }
    if (checkInBlock) { toast.error(checkInBlock); return; }
    if (checkOutBlock) { toast.error(checkOutBlock); return; }
    if (stayLines.length === 0) { toast.error(pricedQ.error ? String((pricedQ.error as Error).message) : "No price could be worked out"); return; }

    const extras: QuoteExtras = {
      check_in_window: CHECK_IN_WINDOWS[0],
      check_out_window: checkOutWindow || null,
      notes: notes || null,
      surcharges: Object.entries(surcharges)
        .filter(([, q]) => q > 0)
        .map(([surcharge_id, quantity]) => ({ surcharge_id, quantity })),
      pets: selectedPets.map((p: any) => ({
        pet_id: p.id,
        name: p.name,
        accommodation_type: accFor(p.id),
        grooming_required: Boolean(grooming[p.id]?.on),
        grooming_notes: grooming[p.id]?.notes || null,
      })),
    };

    try {
      const id = await create.mutateAsync({
        customer_id: customerId,
        service_type: serviceType,
        start_at: new Date(`${startDate}T09:00:00`).toISOString(),
        end_at: new Date(`${endDate}T10:00:00`).toISOString(),
        accommodation_type: accommodation,
        pet_ids: petIds,
        notes: notes || null,
        expiry_date: expiry || null,
        extras,
        items: allLines.filter((l) => l.description.trim()),
      });
      toast.success("Quote created");
      onClose();
      navigate(`/admin/quotes/${id}`);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to create quote");
    }
  }

  return (
    <ModalShell
      title="New quote"
      subtitle="Hotel enquiry → quote. Accepting it creates the booking, extras and deposit invoice."
      onClose={onClose}
      wide
      footer={
        <div className="flex items-center justify-between gap-2 px-1">
          <div className="text-sm font-semibold">Total R{total.toFixed(2)}</div>
          <div className="flex gap-2">
            <button onClick={onClose} className="h-10 rounded-lg border border-border px-4 text-sm">Cancel</button>
            <button
              onClick={save}
              disabled={create.isPending}
              className="h-10 rounded-lg bg-sk-coral px-4 text-sm font-semibold text-white hover:bg-sk-coral/90 disabled:opacity-50"
            >
              {create.isPending ? "Saving…" : "Create quote"}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-5 px-5 py-5 sm:px-6">
        <div>
          <div className={label}>Customer</div>
          <CustomerCombobox
            tenantId={tenantId}
            value={customerId || null}
            onChange={(id) => setCustomerId(id ?? "")}
          />
        </div>

        {customerId && (
          <div>
            <div className={label}>Pets on this stay</div>
            {(petsQ.data ?? []).length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
                This customer has no pets on file yet.
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {(petsQ.data ?? []).map((p: any) => {
                  const on = petIds.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPetIds(on ? petIds.filter((x) => x !== p.id) : [...petIds, p.id])}
                      className={`h-9 rounded-full border px-3 text-sm ${on ? "border-sk-coral bg-sk-coral/10 font-semibold text-sk-coral-dark" : "border-border"}`}
                    >
                      {p.name}
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        {p.size ? p.size : "no size"}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <div className={label}>Service</div>
            <select value={serviceType} onChange={(e) => { setServiceType(e.target.value); setAccommodation(""); }} className={input}>
              <option value="hotel_dog">Dog hotel</option>
              <option value="hotel_cat">Cattery</option>
            </select>
          </label>
          <label className="block">
            <div className={label}>Accommodation</div>
            <select value={accommodation} onChange={(e) => setAccommodation(e.target.value)} className={input}>
              <option value="">Select…</option>
              {rates.map((r: any) => {
                const fits = selectedPets.length === 0 || selectedPets.every((p: any) => rateAllowsSize(r, p.size ?? null));
                return (
                  <option key={r.id} value={r.accommodation_type}>
                    {r.display_name} — R{Number(r.nightly_rate_zar).toFixed(2)}/night{fits ? "" : " (size mismatch)"}
                  </option>
                );
              })}
            </select>
          </label>
          <label className="block">
            <div className={label}>Check-in</div>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={input} />
          </label>
          <label className="block">
            <div className={label}>Check-out</div>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={input} />
          </label>
        </div>

        {sizeWarnings.length > 0 && (
          <div className="rounded-lg border border-sk-orange/40 bg-sk-orange-soft p-3 text-sm text-sk-orange">
            <div className="mb-1 inline-flex items-center gap-1.5 font-semibold">
              <AlertTriangle className="h-4 w-4" /> Size check
            </div>
            <ul className="list-disc pl-5">{sizeWarnings.map((w) => <li key={w}>{w}</li>)}</ul>
          </div>
        )}

        <div className="rounded-xl border border-border p-4">
          <div className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <CalendarClock className="h-3.5 w-3.5 text-sk-coral" /> Arrival &amp; collection
          </div>
          <p className="mb-3 text-xs text-muted-foreground">{MOVEMENT_RULES_NOTE}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="text-sm">
              <div className={label}>Check-in time</div>
              <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">{CHECK_IN_WINDOWS[0]}</div>
              {checkInBlock && (
                <p className="mt-1 text-xs font-semibold text-sk-orange">{checkInBlock}</p>
              )}
            </div>
            <div className="text-sm">
              <div className={label}>Collection time</div>
              <div className="flex flex-wrap gap-2">
                {checkOutOptions.map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => setCheckOutWindow(o)}
                    className={
                      "rounded-lg border px-3 py-2 text-sm " +
                      (checkOutWindow === o
                        ? "border-sk-coral bg-sk-coral/10 text-sk-coral-dark"
                        : "border-border bg-white hover:bg-muted")
                    }
                  >
                    {o}
                  </button>
                ))}
              </div>
              {stayPlay && (
                <p className="mt-1 text-xs text-sk-coral-dark">
                  {stayPlaySurcharge
                    ? `Stay & Play added — R${(stayPlayUnit * stayPlayQty).toFixed(2)}${stayPlayQty > 1 ? ` (${stayPlayQty} pets)` : ""}.`
                    : "No Stay & Play charge is set up in Settings → Hotel surcharges."}
                </p>
              )}
              {checkOutBlock && (
                <p className="mt-1 text-xs font-semibold text-sk-orange">{checkOutBlock}</p>
              )}
            </div>
          </div>
        </div>

        {(surchargesQ.data ?? []).filter((s: any) => s.code !== "late_checkout").length > 0 && (
          <div className="rounded-xl border border-border p-4">
            <div className={label}>Extras &amp; surcharges</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {(surchargesQ.data ?? []).filter((s: any) => s.code !== "late_checkout").map((s: any) => {
                const qty = surcharges[s.id] ?? 0;
                return (
                  <div key={s.id} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm">
                    <div>
                      <div className="font-medium">{s.name}</div>
                      <div className="text-xs text-muted-foreground">
                        R{Number(s.amount_zar ?? s.price_zar ?? 0).toFixed(2)}
                        {s.unit === "per_night" || s.per_night ? " per night" : ""}
                      </div>
                    </div>
                    <input
                      type="number" min={0} step={1} value={qty}
                      onChange={(e) => setSurcharges({ ...surcharges, [s.id]: Number(e.target.value) })}
                      className="h-9 w-20 rounded-lg border border-border px-2 text-sm"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {selectedPets.length > 0 && (
          <div className="rounded-xl border border-border p-4">
            <div className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Scissors className="h-3.5 w-3.5 text-sk-coral" /> Grooming during the stay
            </div>
            <div className="space-y-2">
              {selectedPets.map((p: any) => {
                const g = grooming[p.id] ?? { on: false, notes: "" };
                return (
                  <div key={p.id} className="rounded-lg border border-border p-3">
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <input
                        type="checkbox"
                        checked={g.on}
                        onChange={(e) => setGrooming({ ...grooming, [p.id]: { ...g, on: e.target.checked } })}
                      />
                      {p.name} — groom before going home
                    </label>
                    {g.on && (
                      <input
                        value={g.notes}
                        onChange={(e) => setGrooming({ ...grooming, [p.id]: { ...g, notes: e.target.value } })}
                        placeholder="What the groomer should know"
                        className={input + " mt-2"}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Groom requests are created when the quote is accepted and are priced separately at check-out
              (check-out groom discount applies).
            </p>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <div className={label}>Quote valid until</div>
            <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} className={input} />
            <p className="mt-1 text-xs text-muted-foreground">
              Default {validityQ.data ?? 14} days (Settings → Hotel &amp; Cattery workflow). The hold on these dates
              starts when the quote is emailed and is released automatically when it lapses.
            </p>
          </label>
          {pencilledForStay > 0 && (
            <div className="rounded-lg border border-sk-coral/30 bg-sk-coral-soft p-3 text-sm text-sk-coral-dark">
              {pencilledForStay} pet{pencilledForStay === 1 ? "" : "s"} already pencilled in on these dates by other
              open quotes. Dates are only guaranteed once a quote is accepted and paid.
            </div>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-sk-coral" /> Priced automatically
            </div>
            <button
              onClick={() => setExtraLines([...extraLines, { description: "", quantity: 1, unit_price: 0 }])}
              className="inline-flex items-center gap-1 text-xs font-semibold text-sk-coral-dark"
            >
              <Plus className="h-3.5 w-3.5" /> Add extra line
            </button>
          </div>

          {pricedQ.isError && (
            <div className="mb-2 rounded-lg border border-sk-orange/40 bg-sk-orange-soft p-3 text-sm text-sk-orange">
              {(pricedQ.error as Error).message}
            </div>
          )}

          <div className="space-y-2">
            {[...stayLines, ...surchargeLines].map((l, i) => (
              <div key={`s${i}`} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
                <span>{l.description}</span>
                <span className="font-semibold">R{(l.quantity * l.unit_price).toFixed(2)}</span>
              </div>
            ))}
            {stayLines.length === 0 && !pricedQ.isError && (
              <div className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
                Pick pets, accommodation and dates and the price appears here.
              </div>
            )}

            {extraLines.map((l, i) => (
              <div key={`e${i}`} className="grid grid-cols-12 gap-2">
                <input
                  value={l.description}
                  onChange={(e) => setExtraLines(extraLines.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))}
                  placeholder="Description"
                  className={input + " col-span-6"}
                />
                <input
                  type="number" min={0} step="0.5" value={l.quantity}
                  onChange={(e) => setExtraLines(extraLines.map((x, j) => (j === i ? { ...x, quantity: Number(e.target.value) } : x)))}
                  className={input + " col-span-2"}
                />
                <input
                  type="number" min={0} step="0.01" value={l.unit_price}
                  onChange={(e) => setExtraLines(extraLines.map((x, j) => (j === i ? { ...x, unit_price: Number(e.target.value) } : x)))}
                  className={input + " col-span-3"}
                />
                <button
                  onClick={() => setExtraLines(extraLines.filter((_, j) => j !== i))}
                  className="col-span-1 grid place-items-center rounded-lg border border-border text-muted-foreground hover:text-sk-orange"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <label className="block">
          <div className={label}>Notes</div>
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" />
        </label>
      </div>
    </ModalShell>
  );
}
