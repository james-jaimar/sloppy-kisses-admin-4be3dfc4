import { useMemo, useState } from "react";
import { toast } from "sonner";
import { X, Search, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useCreateInvoice, useUpsertInvoiceItem, useLinkBookingToInvoice, useUninvoicedBookings, useInvoicingSettings } from "./queries";

interface Props { tenantId: string; presetCustomerId?: string; onClose: () => void; onCreated: (id: string) => void }

export function NewInvoiceDrawer({ tenantId, presetCustomerId, onClose, onCreated }: Props) {
  const [customerId, setCustomerId] = useState<string | null>(presetCustomerId ?? null);
  const [selectedBookings, setSelectedBookings] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState("");
  const [dueDays, setDueDays] = useState<number>(14);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  const settingsQ = useInvoicingSettings(tenantId);
  const settings = settingsQ.data;
  const effectiveDueDays = dueDays;

  const createInvoice = useCreateInvoice(tenantId);
  const addItem = useUpsertInvoiceItem(tenantId);
  const linkBooking = useLinkBookingToInvoice(tenantId);

  const custSearchQ = useQuery({
    queryKey: ["invoice_new_customer_search", tenantId, q],
    enabled: !presetCustomerId && q.trim().length >= 1,
    queryFn: async () => {
      const term = q.trim();
      const { data, error } = await supabase.from("customers")
        .select("id, full_name, customer_number, email")
        .eq("tenant_id", tenantId)
        .or(`full_name.ilike.%${term}%,customer_number.ilike.%${term}%,email.ilike.%${term}%`)
        .limit(15);
      if (error) throw error;
      return data ?? [];
    },
  });

  const bookingsQ = useUninvoicedBookings(tenantId, customerId);

  const totalPre = useMemo(() => 0, []); // no prices tracked; user edits later

  async function submit() {
    if (!customerId) { toast.error("Pick a customer first"); return; }
    setBusy(true);
    try {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + effectiveDueDays);
      const invoiceId = await createInvoice.mutateAsync({
        customer_id: customerId,
        notes: notes || null,
        due_date: dueDate.toISOString().slice(0, 10),
      });
      // add lines from selected bookings
      const chosen = (bookingsQ.data ?? []).filter((b) => selectedBookings[b.id]);
      let order = 0;
      for (const b of chosen) {
        await addItem.mutateAsync({
          invoice_id: invoiceId,
          description: `${b.booking_number} · ${labelService(b.service_type)}`,
          quantity: 1,
          unit_price: 0,
          booking_id: b.id,
          sort_order: order++,
        });
        await linkBooking.mutateAsync({ booking_id: b.id, invoice_id: invoiceId });
      }
      toast.success("Draft invoice created");
      onCreated(invoiceId);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to create invoice");
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-md bg-white shadow-xl flex flex-col">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold">New invoice</h2>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Customer</div>
            {customerId ? (
              <div className="flex items-center justify-between rounded-lg border border-border bg-sk-surface-muted px-3 py-2 text-sm">
                <span>Customer selected</span>
                {!presetCustomerId && (
                  <button onClick={() => setCustomerId(null)} className="text-xs text-sk-coral-dark hover:underline">Change</button>
                )}
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customers…"
                    className="h-9 w-full rounded-lg border border-border bg-white pl-9 pr-3 text-sm" />
                </div>
                <div className="mt-2 max-h-60 overflow-y-auto rounded-lg border border-border">
                  {(custSearchQ.data ?? []).map((c: any) => (
                    <button key={c.id} onClick={() => setCustomerId(c.id)}
                      className="block w-full border-b border-border px-3 py-2 text-left text-sm hover:bg-sk-surface-muted last:border-b-0">
                      <div className="font-medium">{c.full_name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{c.customer_number} · {c.email ?? "no email"}</div>
                    </button>
                  ))}
                  {q && (custSearchQ.data ?? []).length === 0 && !custSearchQ.isLoading && (
                    <div className="px-3 py-4 text-center text-xs text-muted-foreground">No matches.</div>
                  )}
                </div>
              </>
            )}
          </div>

          {customerId && (
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Add un-invoiced bookings
              </div>
              {bookingsQ.isLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Loading…</div>
              ) : (bookingsQ.data ?? []).length === 0 ? (
                <div className="text-xs text-muted-foreground">No completed / confirmed bookings without an invoice.</div>
              ) : (
                <div className="space-y-2">
                  {(bookingsQ.data ?? []).map((b: any) => (
                    <label key={b.id} className="flex items-center gap-3 rounded-lg border border-border p-2 text-sm hover:bg-sk-surface-muted">
                      <input type="checkbox" checked={!!selectedBookings[b.id]}
                        onChange={(e) => setSelectedBookings((s) => ({ ...s, [b.id]: e.target.checked }))} />
                      <div className="flex-1">
                        <div className="font-mono text-xs">{b.booking_number}</div>
                        <div className="text-xs text-muted-foreground">
                          {labelService(b.service_type)} · {b.start_at ? new Date(b.start_at).toLocaleDateString("en-ZA") : ""}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
              <div className="mt-1 text-[11px] text-muted-foreground">
                Prices default to R 0.00 — edit line prices on the invoice detail page after creation.
              </div>
            </div>
          )}

          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payment terms</div>
            <div className="flex items-center gap-2 text-sm">
              Net
              <input type="number" min={0} value={dueDays}
                onChange={(e) => setDueDays(Number(e.target.value))}
                className="h-9 w-20 rounded border border-border bg-white px-2 text-sm" />
              days {settings?.payment_terms_days != null && (
                <span className="text-xs text-muted-foreground">(default {settings.payment_terms_days})</span>
              )}
            </div>
          </div>

          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes (optional)</div>
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
          <button onClick={onClose} className="rounded-lg border border-border px-3 py-2 text-sm">Cancel</button>
          <button disabled={busy || !customerId} onClick={submit}
            className="inline-flex items-center gap-2 rounded-lg bg-sk-coral px-4 py-2 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-50">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Create draft
          </button>
        </div>
      </div>
    </div>
  );
}

function labelService(s: string): string {
  const map: Record<string, string> = {
    daycare: "Daycare",
    daycare_assessment: "Daycare assessment",
    hotel_dog: "Hotel — dog",
    hotel_cat: "Hotel — cat",
    grooming_inhouse: "Grooming (in-house)",
    grooming_mobile: "Grooming (mobile)",
    pickup_dropoff: "Pick up / drop-off",
  };
  return map[s] ?? s;
}