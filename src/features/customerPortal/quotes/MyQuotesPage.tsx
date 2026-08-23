import { Link } from "react-router-dom";
import { Loader2, CalendarPlus, Clock } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentCustomer } from "../hooks";
import { SERVICE_LABEL, fmtDate, statusTone, statusLabel } from "../portalCommon";
import { usePortalQuotes, holdRemaining } from "./queries";

const fmtZar = (n: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", minimumFractionDigits: 2 }).format(n);

export default function MyQuotesPage() {
  const cust = useCurrentCustomer();
  const q = usePortalQuotes(cust.data?.id);

  return (
    <>
      <AppHeader title="My quotes" subtitle="Saved prices for stays you're still thinking about" />
      <div className="flex-1 p-4 sm:p-6">
        {q.isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        )}

        {q.data && q.data.length === 0 && (
          <div className="sk-card grid place-items-center gap-3 p-10 text-center">
            <div className="text-sm text-muted-foreground">You haven't saved any quotes yet.</div>
            <Link
              to="/customer/bookings/new/hotel"
              className="inline-flex items-center gap-2 rounded-lg bg-sk-coral px-4 py-2 text-sm font-semibold text-white hover:bg-sk-coral-dark"
            >
              <CalendarPlus className="h-4 w-4" /> Price a stay
            </Link>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {(q.data ?? []).map((quote) => {
            const left = quote.status === "sent" ? holdRemaining(quote.hold_expires_at) : null;
            return (
              <Link
                key={quote.id}
                to={`/customer/quotes/${quote.id}`}
                className="sk-card block p-4 transition hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">
                      {SERVICE_LABEL[quote.service_type ?? ""] ?? "Stay"} · {quote.estimate_number}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {fmtDate(quote.start_at)} → {fmtDate(quote.end_at)}
                    </div>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${statusTone(quote.status)}`}>
                    {quote.status === "sent" ? "Held" : statusLabel(quote.status)}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <div className="text-base font-semibold">{fmtZar(Number(quote.total ?? 0))}</div>
                  {left ? (
                    <div className="inline-flex items-center gap-1 text-xs font-medium text-sk-orange">
                      <Clock className="h-3.5 w-3.5" /> Dates held for {left}
                    </div>
                  ) : quote.status === "sent" ? (
                    <div className="text-xs text-muted-foreground">Hold lapsed</div>
                  ) : null}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
