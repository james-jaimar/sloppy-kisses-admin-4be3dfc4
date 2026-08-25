import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { addDays, format } from "date-fns";
import { CalendarClock, Plus, Sparkles, Trash2 } from "lucide-react";
import { ModalShell } from "@/components/modals/ModalShell";
import { CustomerCombobox } from "@/components/customers/CustomerCombobox";
import { useCustomerPets } from "@/features/customers/queries";
import { useDaycarePlans, WEEKDAYS, WEEKDAY_LABEL, type Weekday } from "@/features/daycare/queries";
import { prorataQuote } from "@/features/daycare/prorata";
import { useCreateQuote, useQuoteValidityDays, type QuoteExtras } from "./queries";

const input = "h-10 w-full rounded-lg border border-border bg-white px-3 text-sm";
const label = "mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground";

interface Line { description: string; quantity: number; unit_price: number }

const zar = (n: number) => `R${n.toFixed(2)}`;

export function DaycareQuoteDrawer({
  tenantId,
  onClose,
  service,
  onServiceChange,
  initialCustomerId,
}: {
  tenantId: string;
  onClose: () => void;
  service: string;
  onServiceChange: (s: string) => void;
  initialCustomerId?: string | null;
}) {
  const navigate = useNavigate();
  const create = useCreateQuote(tenantId);
  const plansQ = useDaycarePlans(tenantId, { activeOnly: true });
  const validityQ = useQuoteValidityDays(tenantId);

  const [customerId, setCustomerId] = useState(initialCustomerId ?? "");
  const [petIds, setPetIds] = useState<string[]>([]);
  const [planId, setPlanId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [days, setDays] = useState<Weekday[]>([]);
  const [assessmentWaived, setAssessmentWaived] = useState(false);
  const [notes, setNotes] = useState("");
  const [expiry, setExpiry] = useState("");
  const [extraLines, setExtraLines] = useState<Line[]>([]);

  const petsQ = useCustomerPets(customerId || null);
  const plan = (plansQ.data ?? []).find((p: any) => p.id === planId) ?? null;
  const planPrice = Number((plan as any)?.price ?? 0);
  const petCount = Math.max(1, petIds.length);

  const quote = useMemo(
    () => prorataQuote(startDate, null, days, planPrice),
    [startDate, days, planPrice],
  );

  const monthLabel = startDate ? format(new Date(`${startDate}T00:00:00`), "MMMM yyyy") : "";

  const firstLines: Line[] = useMemo(() => {
    if (!plan || !startDate || days.length === 0 || planPrice <= 0 || !quote) return [];
    const partial = quote.isPartial;
    return [{
      description: partial
        ? `Daycare — ${plan.name} (pro-rata ${monthLabel}: ${quote.daysBilled} of ${quote.daysTotal} days)`
        : `Daycare — ${plan.name} (${monthLabel})`,
      quantity: petCount,
      unit_price: partial ? quote.amount : planPrice,
    }];
  }, [plan, startDate, days.length, planPrice, quote, monthLabel, petCount]);

  const allLines = [...firstLines, ...extraLines];
  const total = allLines.reduce((s, l) => s + l.quantity * l.unit_price, 0);
  const ongoing = planPrice * petCount;

  const defaultExpiry = format(addDays(new Date(), validityQ.data ?? 14), "yyyy-MM-dd");

  function toggleDay(d: Weekday) {
    setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));
  }

  async function save() {
    if (!customerId) { toast.error("Pick a customer"); return; }
    if (petIds.length === 0) { toast.error("Pick at least one pet"); return; }
    if (!planId) { toast.error("Pick a daycare plan"); return; }
    if (!startDate) { toast.error("Pick a start date"); return; }
    if (days.length === 0) { toast.error("Pick the attendance days"); return; }

    const extras: QuoteExtras = {
      notes: notes || null,
      daycare_plan_id: planId,
      daycare_plan_name: plan?.name ?? null,
      daycare_monthly_price: planPrice,
      weekdays: days,
      start_date: startDate,
      assessment_waived: assessmentWaived,
      pets: (petsQ.data ?? [])
        .filter((p: any) => petIds.includes(p.id))
        .map((p: any) => ({ pet_id: p.id, name: p.name })),
    };

    try {
      const id = await create.mutateAsync({
        customer_id: customerId,
        service_type: "daycare",
        start_at: new Date(`${startDate}T08:00:00`).toISOString(),
        end_at: null,
        accommodation_type: null,
        pet_ids: petIds,
        notes: notes || null,
        expiry_date: expiry || defaultExpiry,
        extras,
        items: allLines.filter((l) => l.description.trim()),
      });
      toast.success("Daycare quote created");
      onClose();
      navigate(`/admin/quotes/${id}`);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to create quote");
    }
  }

  return (
    <ModalShell
      title="New quote"
      subtitle="Daycare place → quote. Accepting it creates the enrolment and the first invoice."
      onClose={onClose}
      wide
      footer={
        <div className="flex items-center justify-between gap-2 px-1">
          <div className="text-sm font-semibold">Total {zar(total)}</div>
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
            onChange={(id) => { setCustomerId(id ?? ""); setPetIds([]); }}
          />
        </div>

        {customerId && (
          <div>
            <div className={label}>Dogs joining daycare</div>
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
            <div className={label}>Service</div>
            <select value={service} onChange={(e) => onServiceChange(e.target.value)} className={input}>
              <option value="hotel_dog">Dog hotel</option>
              <option value="hotel_cat">Cattery</option>
              <option value="daycare">Daycare</option>
            </select>
          </label>
          <label className="block">
            <div className={label}>Plan</div>
            <select value={planId} onChange={(e) => setPlanId(e.target.value)} className={input}>
              <option value="">Pick a plan…</option>
              {(plansQ.data ?? []).map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {zar(Number(p.price ?? 0))}/month
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <div className={label}>Start date</div>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={input} />
          </label>
          <label className="block">
            <div className={label}>Quote valid until</div>
            <input
              type="date"
              value={expiry || defaultExpiry}
              onChange={(e) => setExpiry(e.target.value)}
              className={input}
            />
            <p className="mt-1 text-xs text-muted-foreground">Default {validityQ.data ?? 14} days.</p>
          </label>
        </div>

        <div className="rounded-xl border border-border p-4">
          <div className={label}>Days per week</div>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((d) => {
              const on = days.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleDay(d)}
                  className={`h-9 rounded-full border px-3 text-sm ${on ? "border-sk-coral bg-sk-coral/10 font-semibold text-sk-coral-dark" : "border-border bg-white"}`}
                >
                  {WEEKDAY_LABEL[d]}
                </button>
              );
            })}
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={assessmentWaived}
              onChange={(e) => setAssessmentWaived(e.target.checked)}
            />
            Assessment day already done / waived
          </label>
          <p className="mt-1 text-xs text-muted-foreground">
            Leave unticked and the assessment is still required before the enrolment can start.
          </p>
        </div>

        {plan && quote && (
          <div className="rounded-xl border border-sk-coral/30 bg-sk-coral-soft p-4 text-sm text-sk-coral-dark">
            <div className="mb-1 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide">
              <CalendarClock className="h-3.5 w-3.5" /> Ongoing monthly
            </div>
            {zar(ongoing)} per month from {monthLabel ? `after ${monthLabel}` : "the next full month"} for{" "}
            {petCount} dog{petCount === 1 ? "" : "s"} on {plan.name}
            {quote.isPartial
              ? ` — the first month is pro-rata (${quote.daysBilled} of ${quote.daysTotal} days).`
              : " — billed in full from the start date."}
          </div>
        )}

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

          <div className="space-y-2">
            {firstLines.map((l, i) => (
              <div key={`f${i}`} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
                <span>{l.description}{l.quantity > 1 ? ` × ${l.quantity}` : ""}</span>
                <span className="font-semibold">{zar(l.quantity * l.unit_price)}</span>
              </div>
            ))}
            {firstLines.length === 0 && (
              <div className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
                Pick the dogs, plan, start date and days and the price appears here.
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
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
          />
        </label>
      </div>
    </ModalShell>
  );
}
