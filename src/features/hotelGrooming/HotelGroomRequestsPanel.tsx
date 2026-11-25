import { useState } from "react";
import { Link } from "react-router-dom";
import { Scissors, CheckCircle2, XCircle, Loader2, Plus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { useGroomingPackages } from "@/features/settings/groomingRateCardQueries";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  useBookingGroomRequests,
  useDeclineHotelGroom,
  useCheckoutGroomDiscountPct,
  type HotelGroomRequest,
} from "./queries";
import { hotelGroomPrice } from "./groomQuoteChanges";
import { ScheduleHotelGroomDialog } from "./ScheduleHotelGroomDialog";

/** Staff panel on a hotel booking: grooms the customer asked for during the stay. */
export function HotelGroomRequestsPanel({
  tenantId,
  bookingId,
  customerId,
  endAt,
  pets = [],
}: {
  tenantId: string | null;
  bookingId: string;
  customerId?: string | null;
  endAt?: string | null;
  pets?: { id: string; name: string; species?: string | null }[];
}) {
  const qc = useQueryClient();
  const packagesQ = useGroomingPackages(tenantId, { activeOnly: true });
  const pctQ = useCheckoutGroomDiscountPct(tenantId);
  const pct = pctQ.data ?? 0;
  const dogs = pets.filter((p) => p.species !== "cat");
  const [adding, setAdding] = useState(false);
  const [petId, setPetId] = useState("");
  const [pkgId, setPkgId] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const addGroom = async () => {
    const pet = dogs.find((p) => p.id === petId);
    if (!tenantId || !pet || !pkgId) return toast.error("Choose a dog and a groom package");
    setSaving(true);
    const end = endAt ? new Date(endAt) : new Date();
    const start = new Date(end); start.setHours(8, 0, 0, 0);
    const { error } = await supabase.from("hotel_grooming_requests" as any).insert({
      tenant_id: tenantId, hotel_booking_id: bookingId, pet_id: pet.id, customer_id: customerId ?? null,
      pet_name: pet.name, window_start: start.toISOString(), window_end: end.toISOString(),
      customer_notes: notes.trim() || "Groom added by staff", status: "pending", package_id: pkgId, addon_ids: [],
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Groom added successfully");
    setAdding(false); setPetId(""); setPkgId(""); setNotes("");
    qc.invalidateQueries({ queryKey: ["hotel_groom_requests"] });
    ["hotel_quote_actions", "estimate", "estimate_items", "estimates"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  };
  const q = useBookingGroomRequests(bookingId);
  const decline = useDeclineHotelGroom();
  const confirm = useConfirm();
  const [active, setActive] = useState<HotelGroomRequest | null>(null);

  const rows = q.data ?? [];
  const visible = rows.filter((r) => r.status !== "cancelled");
  if (q.isLoading) {
    return (
      <div className="sk-card flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Checking grooming requests…
      </div>
    );
  }
  if (!visible.length && !dogs.length) return null;

  const pending = visible.filter((r) => r.status === "pending").length;

  return (
    <div
      className={
        "sk-card p-5 " + (pending ? "border-sk-orange bg-sk-orange-soft/40" : "")
      }
    >
      <div className="flex items-center gap-2">
        <Scissors className="h-4 w-4 text-sk-coral-dark" />
        <h3 className="text-sm font-semibold">
          Grooming requested during this stay
        </h3>
        {pending > 0 && (
          <span className="rounded-full bg-sk-orange px-2 py-0.5 text-[11px] font-semibold text-white">
            {pending} to schedule
          </span>
        )}
        {dogs.length > 0 && (
          <button onClick={() => setAdding((v) => !v)} className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-white px-3 text-xs font-semibold hover:bg-muted">
            <Plus className="h-4 w-4" /> Add groom
          </button>
        )}
      </div>
      {!visible.length && !adding && <p className="mt-2 text-xs text-muted-foreground">No grooming on this stay yet.</p>}
      {adding && (
        <div className="mt-3 grid gap-2 rounded-xl border border-border bg-white p-3 sm:grid-cols-[1fr_1fr_2fr_auto]">
          <select aria-label="Dog" value={petId} onChange={(e) => setPetId(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
            <option value="">Choose dog…</option>
            {dogs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select aria-label="Groom package" value={pkgId} onChange={(e) => setPkgId(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
            <option value="">Choose package…</option>
            {(packagesQ.data ?? []).filter((x: any) => x.species === "dog").map((x: any) => <option key={x.id} value={x.id}>{x.name} · {pct > 0 ? `R${hotelGroomPrice(Number(x.price_zar), pct).toFixed(0)} hotel price (was R${Number(x.price_zar).toFixed(0)})` : `R${Number(x.price_zar).toFixed(0)}`}</option>)}
          </select>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
          {pct > 0 && <p className="text-xs text-muted-foreground sm:col-span-4">Hotel guests get {pct}% off when the groom is on their check-out day.</p>}
          <button disabled={saving} onClick={addGroom} className="h-9 rounded-xl bg-sk-coral px-3 text-xs font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-50">{saving ? "Saving…" : "Add"}</button>
        </div>
      )}

      <ul className="mt-3 space-y-2">
        {visible.map((r) => (
          <li
            key={r.id}
            className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-white p-3"
          >
            <div className="min-w-0">
              <div className="text-sm font-medium">{r.pet_name ?? "Pet"}</div>
              {r.customer_notes && (
                <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">
                  {r.customer_notes}
                </p>
              )}
              {r.status === "declined" && r.decline_reason && (
                <p className="mt-0.5 text-xs text-sk-coral-dark">
                  Declined — {r.decline_reason}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {r.status === "scheduled" && r.grooming_booking_id ? (
                <Link
                  to={`/admin/bookings/${r.grooming_booking_id}`}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-white px-3 text-xs font-medium hover:bg-muted"
                >
                  <CheckCircle2 className="h-4 w-4 text-sk-green" /> View groom
                </Link>
              ) : r.status === "pending" ? (
                <>
                  <button
                    onClick={() => setActive(r)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-sk-coral px-3 text-xs font-semibold text-white hover:bg-sk-coral-dark"
                  >
                    <Scissors className="h-4 w-4" /> Schedule
                  </button>
                  <button
                    onClick={async () => {
                      if (
                        !(await confirm({
                          title: `Decline groom for ${r.pet_name ?? "this pet"}?`,
                          description:
                            "The request stays on record so the customer can see it was reviewed.",
                          confirmLabel: "Decline",
                          tone: "destructive",
                        }))
                      )
                        return;
                      try {
                        await decline.mutateAsync({
                          requestId: r.id,
                          reason: "No slot available during the stay",
                        });
                        toast.success("Request declined");
                      } catch (err: any) {
                        toast.error(err?.message ?? "Failed to decline");
                      }
                    }}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-white px-3 text-xs font-medium text-sk-coral-dark hover:bg-sk-coral-soft"
                  >
                    <XCircle className="h-4 w-4" /> Decline
                  </button>
                </>
              ) : (
                <span className="text-xs text-muted-foreground">Declined</span>
              )}
            </div>
          </li>
        ))}
      </ul>

      {active && (
        <ScheduleHotelGroomDialog
          tenantId={tenantId}
          request={active}
          open
          onClose={() => setActive(null)}
        />
      )}
    </div>
  );
}
