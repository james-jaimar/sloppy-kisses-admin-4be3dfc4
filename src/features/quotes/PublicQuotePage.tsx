import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2, CheckCircle2, CalendarDays, Clock } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/lib/supabase/client";

const fmtZar = (n: number) =>
  "R " + (Number.isFinite(n) ? n : 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d?: string | null) => (d ? format(new Date(d), "dd MMM yyyy") : "—");

type Data = {
  quote: any;
  items: any[];
  pets: { id: string; name: string; breed?: string | null }[];
  tenant: any;
  customer: any;
  expired: boolean;
  accepted: boolean;
};

type AcceptResult = {
  invoice_number?: string | null;
  invoice_token?: string | null;
  customer_email?: string | null;
  portal?: { activated: boolean; email_sent?: boolean };
};

export default function PublicQuotePage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [done, setDone] = useState<AcceptResult | null>(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    (supabase as any).rpc("get_public_quote", { p_token: token })
      .then(({ data, error }: any) => {
        if (error) setError(error.message);
        else if (!data) setError("This quote link is not valid or has expired.");
        else setData(data as Data);
      })
      .finally(() => setLoading(false));
  }, [token]);

  async function accept() {
    if (!token) return;
    setAccepting(true);
    setError(null);
    try {
      const res = await fetch(
        `${(import.meta as any).env.VITE_SUPABASE_URL}/functions/v1/public-quote-accept`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) },
      );
      const body = await res.json();
      if (!res.ok || body?.ok === false) throw new Error(body?.error ?? "Could not accept this quote");
      setDone(body as AcceptResult);
    } catch (e: any) {
      setError(e?.message ?? "Could not accept this quote");
    } finally {
      setAccepting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center text-muted-foreground">
        <div className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading quote…</div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="min-h-screen grid place-items-center p-6">
        <div className="sk-card max-w-md p-6 text-center">
          <div className="text-lg font-semibold">Can't open this quote</div>
          <p className="mt-2 text-sm text-muted-foreground">{error ?? "Unknown error"}</p>
        </div>
      </div>
    );
  }

  const { quote, items, pets, tenant, customer } = data;
  const brand = tenant?.primary_colour || "#ff5a5a";
  const total = Number(quote?.total ?? 0);
  const deposit = Math.round(total * 50) / 100;
  const nights = quote?.start_at && quote?.end_at
    ? Math.max(1, Math.round((new Date(quote.end_at).getTime() - new Date(quote.start_at).getTime()) / 86400000))
    : null;
  const accepted = data.accepted || Boolean(done);

  return (
    <div className="min-h-screen bg-sk-surface-muted py-6 sm:py-10">
      <div className="mx-auto max-w-2xl px-4">
        <div className="sk-card overflow-hidden">
          <div className="px-6 py-6 text-center sm:px-8" style={{ background: brand }}>
            <div className="text-xs font-bold uppercase tracking-[0.16em] text-white/85">
              Hotel quote {quote?.estimate_number}
            </div>
            <div className="mt-1 text-2xl font-extrabold text-white">{tenant?.name}</div>
          </div>

          {done ? (
            <div className="p-6 text-center sm:p-8">
              <CheckCircle2 className="mx-auto h-10 w-10" style={{ color: brand }} />
              <h1 className="mt-3 text-xl font-semibold">Thank you — your booking is confirmed</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {fmtDate(quote?.start_at)} – {fmtDate(quote?.end_at)}
                {nights ? ` · ${nights} night${nights === 1 ? "" : "s"}` : ""} for{" "}
                {pets.map((p) => p.name).join(", ") || "your dog"}.
              </p>
              <p className="mt-3 text-sm text-muted-foreground">
                {done.invoice_number
                  ? <>Invoice <span className="font-medium text-foreground">{done.invoice_number}</span> is on its way to {done.customer_email ?? "your email"}.</>
                  : <>Your invoice is on its way by email.</>}
              </p>
              {done.portal?.activated ? (
                <div className="mt-5 rounded-xl border border-border bg-white p-4 text-left">
                  <div className="text-sm font-semibold">Your online account is ready</div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    We've emailed {done.customer_email ?? "you"} a link to set your password. You can then see your
                    bookings, invoices and pay online.
                  </p>
                  <a href="/login"
                    className="mt-3 inline-flex h-10 items-center rounded-lg px-4 text-sm font-semibold text-white"
                    style={{ background: brand }}>
                    Sign in to pay the deposit
                  </a>
                </div>
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">
                  We'll email your invoice with the payment details.
                </p>
              )}
            </div>
          ) : (
            <div className="p-6 sm:p-8">
              <p className="text-sm text-muted-foreground">
                Hi {(customer?.full_name ?? "there").split(/\s+/)[0]}, here is your quote for{" "}
                {pets.map((p) => p.name).join(", ") || "your dog"}.
              </p>

              <div className="mt-5 rounded-xl border border-border">
                <dl className="divide-y divide-border text-sm">
                  <Row label="Dates" value={`${fmtDate(quote?.start_at)} – ${fmtDate(quote?.end_at)}${nights ? ` · ${nights} night${nights === 1 ? "" : "s"}` : ""}`} icon={<CalendarDays className="h-4 w-4" />} />
                  {quote?.accommodation_type && <Row label="Accommodation" value={quote.accommodation_type} />}
                  {quote?.extras?.check_in_window && <Row label="Arrival" value={quote.extras.check_in_window} icon={<Clock className="h-4 w-4" />} />}
                  {quote?.extras?.check_out_window && <Row label="Collection" value={quote.extras.check_out_window} icon={<Clock className="h-4 w-4" />} />}
                </dl>
              </div>

              {items.length > 0 && (
                <div className="mt-5 overflow-hidden rounded-xl border border-border">
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-border">
                      {items.map((it, idx) => (
                        <tr key={idx}>
                          <td className="px-4 py-2.5">{it.description}</td>
                          <td className="px-4 py-2.5 text-right text-muted-foreground">{Number(it.quantity)} ×</td>
                          <td className="px-4 py-2.5 text-right font-medium">{fmtZar(Number(it.line_total))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="mt-5 grid grid-cols-2 gap-4 rounded-xl border border-border p-4">
                <div>
                  <div className="text-xs text-muted-foreground">Total for the stay</div>
                  <div className="text-xl font-extrabold">{fmtZar(total)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">50% deposit to secure</div>
                  <div className="text-xl font-extrabold" style={{ color: brand }}>{fmtZar(deposit)}</div>
                </div>
              </div>

              {quote?.hold_until && !data.expired && !accepted && (
                <p className="mt-4 text-center text-sm text-muted-foreground">
                  These dates are held for you until <span className="font-medium text-foreground">{fmtDate(quote.hold_until)}</span>.
                </p>
              )}

              {error && <p className="mt-4 text-center text-sm text-destructive">{error}</p>}

              {accepted ? (
                <p className="mt-6 rounded-xl bg-muted p-4 text-center text-sm">
                  This quote has already been accepted — your invoice has been emailed to you.
                </p>
              ) : data.expired ? (
                <p className="mt-6 rounded-xl bg-muted p-4 text-center text-sm">
                  This quote has expired and the dates have been released. Please contact us for a new quote.
                </p>
              ) : (
                <div className="mt-6 text-center">
                  <button onClick={accept} disabled={accepting}
                    className="inline-flex h-12 items-center gap-2 rounded-full px-8 text-sm font-bold text-white disabled:opacity-60"
                    style={{ background: brand }}>
                    {accepting && <Loader2 className="h-4 w-4 animate-spin" />}
                    Accept this quote
                  </button>
                  <div className="mt-3 text-xs text-muted-foreground">
                    Accepting confirms the booking and generates your invoice.
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="border-t border-border bg-white px-6 py-4 text-center text-xs text-muted-foreground sm:px-8">
            {[tenant?.contact_phone, tenant?.contact_email].filter(Boolean).join(" · ")}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <dt className="inline-flex items-center gap-2 text-muted-foreground">{icon}{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}