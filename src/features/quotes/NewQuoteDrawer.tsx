import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Trash2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { addDays, format } from "date-fns";
import { ModalShell } from "@/components/modals/ModalShell";
import { useCustomerPets } from "@/features/customers/queries";
import { CustomerCombobox } from "@/components/customers/CustomerCombobox";
import { useHotelRateCards } from "@/features/settings/hotelRateCardQueries";
import { useCreateQuote, useHotelStayLines, useQuoteValidityDays } from "./queries";

const input = "h-10 w-full rounded-lg border border-border bg-white px-3 text-sm";

interface Line { description: string; quantity: number; unit_price: number }

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

  const petsQ = useCustomerPets(customerId || null, tenantId);
  const ratesQ = useHotelRateCards(tenantId, { activeOnly: true });
  const validityQ = useQuoteValidityDays(tenantId);
  const create = useCreateQuote(tenantId);

  const species: "dog" | "cat" = serviceType === "hotel_cat" ? "cat" : "dog";
  const rates = (ratesQ.data ?? []).filter((r) => r.species === species);

  const pricedQ = useHotelStayLines({
    tenantId,
    species,
    accommodationType: accommodation || null,
    start: startDate || null,
    end: endDate || null,
    petCount: Math.max(1, petIds.length),
  });

  useEffect(() => {
    if (!expiry && validityQ.data) {
      setExpiry(format(addDays(new Date(), validityQ.data), "yyyy-MM-dd"));
    }
  }, [validityQ.data, expiry]);

  useEffect(() => { setPetIds([]); }, [customerId]);

  const stayLines: Line[] = useMemo(
    () => (pricedQ.data ?? []).map((l) => ({ description: l.description, quantity: l.quantity, unit_price: l.unit_price })),
    [pricedQ.data],
  );
  const allLines = [...stayLines, ...extraLines];
  const total = allLines.reduce((s, l) => s + l.quantity * l.unit_price, 0);

  const nights = useMemo(() => {
    if (!startDate || !endDate) return 0;
    return Math.max(0, Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000));
  }, [startDate, endDate]);

  async function save() {
    if (!customerId) { toast.error("Pick a customer"); return; }
    if (petIds.length === 0) { toast.error("Pick at least one pet"); return; }
    if (!accommodation || nights < 1) { toast.error("Choose an accommodation type and dates"); return; }
    if (stayLines.length === 0) { toast.error(pricedQ.error ? String((pricedQ.error as Error).message) : "No price could be worked out"); return; }
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
      subtitle="Hotel enquiry → quote. Accepting it creates the booking and deposit invoice."
      onClose={onClose}
      wide
      footer={
        <div className="flex items-center justify-between gap-2">
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
      <div className="space-y-4">
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Customer</div>
          <CustomerCombobox
            tenantId={tenantId}
            value={customerId || null}
            onChange={(id) => setCustomerId(id ?? "")}
          />
        </div>

        {customerId && (
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pets on this stay</div>
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
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Service</div>
            <select value={serviceType} onChange={(e) => { setServiceType(e.target.value); setAccommodation(""); }} className={input}>
              <option value="hotel_dog">Dog hotel</option>
              <option value="hotel_cat">Cattery</option>
            </select>
          </label>
          <label className="block">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Accommodation</div>
            <select value={accommodation} onChange={(e) => setAccommodation(e.target.value)} className={input}>
              <option value="">Select…</option>
              {rates.map((r) => (
                <option key={r.id} value={r.accommodation_type}>
                  {r.display_name} — R{Number(r.nightly_rate_zar).toFixed(2)}/night
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Check-in</div>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={input} />
          </label>
          <label className="block">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Check-out</div>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={input} />
          </label>
          <label className="block">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quote valid until</div>
            <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} className={input} />
          </label>
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
            {stayLines.map((l, i) => (
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
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes</div>
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" />
        </label>
      </div>
    </ModalShell>
  );
}
