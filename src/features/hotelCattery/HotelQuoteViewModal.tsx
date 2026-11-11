import { format, parseISO } from "date-fns";
import { FileDown } from "lucide-react";
import { toast } from "sonner";
import { ModalShell } from "@/components/modals/ModalShell";
import { useQuote, useQuoteItems, downloadQuotePdf, isQuoteExpired } from "@/features/quotes/queries";

const money = (n: number) => new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(n);

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-semibold">{value}</div>
    </div>
  );
}

/** Read-only quote preview so staff can check what the customer will see before sending. */
export function HotelQuoteViewModal({ estimateId, onClose }: { estimateId: string; onClose: () => void }) {
  const quoteQ = useQuote(estimateId);
  const itemsQ = useQuoteItems(estimateId);
  const q = quoteQ.data;
  const expired = q ? isQuoteExpired(q) : false;

  async function onDownload() {
    if (!q) return;
    try {
      await downloadQuotePdf(q.id, `${q.estimate_number ?? "quote"}.pdf`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not build the PDF");
    }
  }

  return (
    <ModalShell
      title={q?.estimate_number ? `Quote ${q.estimate_number}` : "Quote"}
      subtitle={q?.customer?.full_name ?? ""}
      onClose={onClose}
      wide
      headerRight={
        q ? (
          <button
            type="button"
            onClick={onDownload}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold"
          >
            <FileDown className="h-4 w-4" /> PDF
          </button>
        ) : undefined
      }
    >
      <div className="space-y-4 px-6 py-5">
        {quoteQ.isLoading && <p role="status" className="text-sm text-muted-foreground">Loading quote…</p>}
        {quoteQ.error && <p className="text-sm text-destructive">Could not load the quote.</p>}

        {q && (
          <>
            {expired && (
              <div className="rounded-lg border border-sk-orange/40 bg-sk-orange-soft p-3 text-sm text-sk-orange">
                This quote expired on {q.expiry_date ? format(parseISO(q.expiry_date), "dd MMM yyyy") : ""}. Prices may need re-checking.
              </div>
            )}

            <div className="grid gap-4 rounded-xl border border-border p-4 sm:grid-cols-4">
              <Info label="Status" value={expired ? "expired" : q.status} />
              <Info label="Check-in" value={q.start_at ? format(parseISO(q.start_at), "dd MMM yyyy") : "—"} />
              <Info label="Check-out" value={q.end_at ? format(parseISO(q.end_at), "dd MMM yyyy") : "—"} />
              <Info label="Valid until" value={q.expiry_date ? format(parseISO(q.expiry_date), "dd MMM yyyy") : "—"} />
            </div>

            {(q.extras?.check_in_window || q.extras?.check_out_window) && (
              <div className="grid gap-4 rounded-xl border border-border p-4 text-sm sm:grid-cols-2">
                <Info label="Check-in window" value={q.extras?.check_in_window ?? "—"} />
                <Info label="Collection window" value={q.extras?.check_out_window ?? "—"} />
              </div>
            )}

            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3">Qty</th>
                    <th className="px-4 py-3">Unit</th>
                    <th className="px-4 py-3 text-right">Line total</th>
                  </tr>
                </thead>
                <tbody>
                  {itemsQ.isLoading && (
                    <tr><td colSpan={4} className="px-4 py-3 text-muted-foreground">Loading lines…</td></tr>
                  )}
                  {(itemsQ.data ?? []).map((i) => (
                    <tr key={i.id} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-3">{i.description}</td>
                      <td className="px-4 py-3">{Number(i.quantity)}</td>
                      <td className="px-4 py-3">{money(Number(i.unit_price))}</td>
                      <td className="px-4 py-3 text-right font-semibold">{money(Number(i.line_total))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border bg-sk-surface-muted">
                    <td colSpan={3} className="px-4 py-3 text-right text-sm font-semibold">Total</td>
                    <td className="px-4 py-3 text-right text-base font-bold">{money(Number(q.total ?? 0))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {q.notes && <div className="rounded-xl border border-border p-4 text-sm text-muted-foreground">{q.notes}</div>}
          </>
        )}
      </div>
    </ModalShell>
  );
}
