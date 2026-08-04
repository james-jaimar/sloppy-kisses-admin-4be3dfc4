import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ModalShell } from "@/components/modals/ModalShell";
import { useCustomers } from "@/features/customers/queries";
import { useHotelRateCards } from "@/features/settings/hotelRateCardQueries";
import { useCreateQuote } from "./queries";

const input = "h-10 w-full rounded-lg border border-border bg-white px-3 text-sm";

interface Line { description: string; quantity: number; unit_price: number }

export function NewQuoteDrawer({ tenantId, onClose }: { tenantId: string; onClose: () => void }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [serviceType, setServiceType] = useState("hotel_dog");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [accommodation, setAccommodation] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([{ description: "", quantity: 1, unit_price: 0 }]);

  const customersQ = useCustomers({ tenantId, search, pageSize: 20 });
  const ratesQ = useHotelRateCards(tenantId, { activeOnly: true });
  const create = useCreateQuote(tenantId);

  const species = serviceType === "hotel_cat" ? "cat" : "dog";
  const rates = (ratesQ.data ?? []).filter((r) => r.species === species);

  const nights = useMemo(() => {
    if (!startDate || !endDate) return 0;
    const ms = new Date(endDate).getTime() - new Date(startDate).getTime();
    return Math.max(0, Math.round(ms / 86400000));
  }, [startDate, endDate]);

  const total = lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);

  function applyRate(code: string) {
    setAccommodation(code);
    const rate = rates.find((r) => r.accommodation_type === code);
    if (!rate) return;
    const qty = nights || 1;
    setLines([
      {
        description: `Hotel stay — ${rate.display_name} · ${qty} night${qty === 1 ? "" : "s"}`,
        quantity: qty,
        unit_price: Number(rate.nightly_rate_zar),
      },
      ...lines.filter((l) => l.description && !l.description.startsWith("Hotel stay —")),
    ]);
  }

  async function save() {
    if (!customerId) { toast.error("Pick a customer"); return; }
    try {
      const id = await create.mutateAsync({
        customer_id: customerId,
        service_type: serviceType,
        start_at: startDate ? new Date(`${startDate}T09:00:00`).toISOString() : null,
        end_at: endDate ? new Date(`${endDate}T10:00:00`).toISOString() : null,
        accommodation_type: accommodation || null,
        pet_ids: [],
        notes: notes || null,
        items: lines.filter((l) => l.description.trim()),
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
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="h-10 rounded-lg border border-border px-4 text-sm">Cancel</button>
          <button
            onClick={save}
            disabled={create.isPending}
            className="h-10 rounded-lg bg-sk-coral px-4 text-sm font-semibold text-white hover:bg-sk-coral/90 disabled:opacity-50"
          >
            {create.isPending ? "Saving…" : "Create quote"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Customer</div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email or mobile…"
            className={input}
          />
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className={input + " mt-2"}>
            <option value="">Select a customer…</option>
            {(customersQ.data?.rows ?? []).map((c: any) => (
              <option key={c.id} value={c.id}>
                {c.full_name} {c.email ? `· ${c.email}` : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Service</div>
            <select value={serviceType} onChange={(e) => setServiceType(e.target.value)} className={input}>
              <option value="hotel_dog">Dog hotel</option>
              <option value="hotel_cat">Cattery</option>
            </select>
          </label>
          <label className="block">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Accommodation</div>
            <select value={accommodation} onChange={(e) => applyRate(e.target.value)} className={input}>
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
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quote lines</div>
            <button
              onClick={() => setLines([...lines, { description: "", quantity: 1, unit_price: 0 }])}
              className="inline-flex items-center gap-1 text-xs font-semibold text-sk-coral-dark"
            >
              <Plus className="h-3.5 w-3.5" /> Add line
            </button>
          </div>
          <div className="space-y-2">
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-12 gap-2">
                <input
                  value={l.description}
                  onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))}
                  placeholder="Description"
                  className={input + " col-span-6"}
                />
                <input
                  type="number" min={0} step="0.5" value={l.quantity}
                  onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, quantity: Number(e.target.value) } : x)))}
                  className={input + " col-span-2"}
                />
                <input
                  type="number" min={0} step="0.01" value={l.unit_price}
                  onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, unit_price: Number(e.target.value) } : x)))}
                  className={input + " col-span-3"}
                />
                <button
                  onClick={() => setLines(lines.filter((_, j) => j !== i))}
                  className="col-span-1 grid place-items-center rounded-lg border border-border text-muted-foreground hover:text-sk-orange"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-2 text-right text-sm font-semibold">Total R{total.toFixed(2)}</div>
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
