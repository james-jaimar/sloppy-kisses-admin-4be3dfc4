import { useNavigate, useParams, Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { ArrowLeft, CheckCircle2, Send, Ban, Download } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/layout/AppHeader";
import {
  useQuote, useQuoteItems, useUpdateQuoteStatus, useAcceptQuote,
  useSendQuote, downloadQuotePdf, isQuoteExpired,
} from "./queries";

export default function QuoteDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const quoteQ = useQuote(id);
  const itemsQ = useQuoteItems(id);
  const setStatus = useUpdateQuoteStatus();
  const accept = useAcceptQuote();
  const send = useSendQuote();

  const q = quoteQ.data;
  const expired = q ? isQuoteExpired(q) : false;
  async function onSend() {
    if (!id) return;
    try {
      await send.mutateAsync(id);
      toast.success("Quote emailed to the customer");
    } catch (err: any) {
      toast.error(err?.message ?? "Could not send the quote");
    }
  }

  async function onDownload() {
    if (!q) return;
    try {
      await downloadQuotePdf(q.id, `${q.estimate_number ?? "quote"}.pdf`);
    } catch (err: any) {
      toast.error(err?.message ?? "Could not build the PDF");
    }
  }


  async function onAccept() {
    if (!id) return;
    try {
      const bookingId = await accept.mutateAsync(id);
      toast.success("Booking created — deposit invoice issued");
      navigate(`/admin/bookings/${bookingId}`);
    } catch (err: any) {
      toast.error(err?.message ?? "Could not accept quote");
    }
  }

  return (
    <>
      <AppHeader
        title={q?.estimate_number ? `Quote ${q.estimate_number}` : "Quote"}
        subtitle={q?.customer?.full_name ?? ""}
        actions={
          <div className="flex flex-wrap gap-2">
            {q && (
              <button
                onClick={onDownload}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold"
              >
                <Download className="h-4 w-4" /> PDF
              </button>
            )}
            {q && q.status !== "cancelled" && (
              <button
                onClick={onSend}
                disabled={send.isPending}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold disabled:opacity-50"
              >
                <Send className="h-4 w-4" /> {send.isPending ? "Sending…" : q.sent_at ? "Resend to customer" : "Email to customer"}
              </button>
            )}
            {q && !q.booking_id && q.status !== "cancelled" && (
              <button
                onClick={onAccept}
                disabled={accept.isPending}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-sk-coral px-4 text-sm font-semibold text-white hover:bg-sk-coral/90 disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" /> Accept &amp; create booking
              </button>
            )}
            {q && q.status !== "accepted" && q.status !== "cancelled" && (
              <button
                onClick={() => setStatus.mutate({ id: q.id, status: "cancelled" })}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-4 text-sm text-muted-foreground"
              >
                <Ban className="h-4 w-4" /> Cancel
              </button>
            )}
          </div>
        }
      />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <Link to="/admin/quotes" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> All quotes
        </Link>

        {expired && (
          <div className="rounded-lg border border-sk-orange/40 bg-sk-orange-soft p-3 text-sm text-sk-orange">
            This quote expired on {q?.expiry_date ? format(parseISO(q.expiry_date), "dd MMM yyyy") : ""}. Prices may need re-checking before you accept it.
          </div>
        )}

        {q && (
          <div className="sk-card grid gap-4 p-4 sm:grid-cols-4">
            <Info label="Status" value={expired ? "expired" : q.status} />
            <Info label="Check-in" value={q.start_at ? format(parseISO(q.start_at), "dd MMM yyyy") : "—"} />
            <Info label="Check-out" value={q.end_at ? format(parseISO(q.end_at), "dd MMM yyyy") : "—"} />
            <Info label="Total" value={`R${Number(q.total ?? 0).toFixed(2)}`} />
          </div>
        )}

        {q && (
          <div className="sk-card grid gap-4 p-4 text-sm sm:grid-cols-4">
            <Info label="Valid until" value={q.expiry_date ? format(parseISO(q.expiry_date), "dd MMM yyyy") : "—"} />
            <Info label="Sent" value={q.sent_at ? format(parseISO(q.sent_at), "dd MMM yyyy HH:mm") : "Not sent yet"} />
            <Info label="Accepted" value={q.accepted_at ? format(parseISO(q.accepted_at), "dd MMM yyyy HH:mm") : "—"} />
            <Info label="Pets" value={String((q.pet_ids ?? []).length || "—")} />
          </div>
        )}

        <div className="sk-card overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Qty</th>
                <th className="px-4 py-3">Unit</th>
                <th className="px-4 py-3">Line total</th>
              </tr>
            </thead>
            <tbody>
              {(itemsQ.data ?? []).map((i) => (
                <tr key={i.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3">{i.description}</td>
                  <td className="px-4 py-3">{Number(i.quantity)}</td>
                  <td className="px-4 py-3">R{Number(i.unit_price).toFixed(2)}</td>
                  <td className="px-4 py-3 font-semibold">R{Number(i.line_total).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {q?.notes && <div className="sk-card p-4 text-sm text-muted-foreground">{q.notes}</div>}

        {q?.booking_id && (
          <Link to={`/admin/bookings/${q.booking_id}`} className="text-sm font-semibold text-sk-coral-dark">
            View the booking created from this quote →
          </Link>
        )}
      </div>
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-semibold">{value}</div>
    </div>
  );
}
