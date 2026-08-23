import { useNavigate, useParams, Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Clock, Loader2 } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { SERVICE_LABEL, fmtDate, statusTone, statusLabel } from "../portalCommon";
import { usePortalQuote, usePortalQuoteAction, holdRemaining } from "./queries";

const fmtZar = (n: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", minimumFractionDigits: 2 }).format(n);

export default function MyQuoteDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const q = usePortalQuote(id);
  const act = usePortalQuoteAction();

  const quote = q.data?.quote;
  const items = q.data?.items ?? [];
  const left = quote?.status === "sent" ? holdRemaining(quote?.hold_expires_at) : null;
  const canAct = quote?.status === "sent" && !quote?.booking_id && Boolean(left);

  async function run(action: "accept" | "cancel") {
    if (!id) return;
    try {
      const res = await act.mutateAsync({ quoteId: id, action });
      if (action === "accept") {
        toast.success("Quote accepted — your booking is confirmed.");
        if ((res as any)?.booking_id) nav(`/customer/bookings/${(res as any).booking_id}`);
      } else {
        toast.success("Quote cancelled and the dates released.");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Something went wrong");
    }
  }

  return (
    <>
      <AppHeader title={quote?.estimate_number ?? "Quote"} subtitle="Your saved stay quote" />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <Link to="/customer/quotes" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> All quotes
        </Link>

        {q.isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        )}

        {quote && (
          <>
            <div className="sk-card space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold">
                  {SERVICE_LABEL[quote.service_type ?? ""] ?? "Stay"}
                </div>
                <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${statusTone(quote.status)}`}>
                  {quote.status === "sent" ? "Held" : statusLabel(quote.status)}
                </span>
              </div>
              <div className="text-sm text-muted-foreground">
                {fmtDate(quote.start_at)} → {fmtDate(quote.end_at)}
              </div>
              {left ? (
                <div className="inline-flex items-center gap-1 rounded-lg bg-sk-orange-soft px-3 py-2 text-xs font-medium text-sk-orange">
                  <Clock className="h-3.5 w-3.5" /> These dates are held for you for another {left}. After that they're
                  released to other guests.
                </div>
              ) : quote.status === "sent" ? (
                <div className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                  The hold on these dates has lapsed. Please start a new booking to check availability.
                </div>
              ) : null}
            </div>

            <div className="sk-card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground">
                  <tr className="text-left">
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3 text-right">Qty</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((i: any) => (
                    <tr key={i.id} className="border-t border-border">
                      <td className="px-4 py-3">{i.description}</td>
                      <td className="px-4 py-3 text-right">{i.quantity}</td>
                      <td className="px-4 py-3 text-right">{fmtZar(Number(i.line_total ?? 0))}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-border font-semibold">
                    <td className="px-4 py-3" colSpan={2}>Total</td>
                    <td className="px-4 py-3 text-right">{fmtZar(Number(quote.total ?? 0))}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {canAct && (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => run("accept")}
                  disabled={act.isPending}
                  className="rounded-lg bg-sk-coral px-5 py-2 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-50"
                >
                  {act.isPending ? "Working…" : "Accept & book"}
                </button>
                <button
                  onClick={() => run("cancel")}
                  disabled={act.isPending}
                  className="rounded-lg border border-border px-5 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
                >
                  Cancel quote
                </button>
              </div>
            )}

            {quote.booking_id && (
              <Link
                to={`/customer/bookings/${quote.booking_id}`}
                className="inline-flex rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                View the booking
              </Link>
            )}
          </>
        )}
      </div>
    </>
  );
}
