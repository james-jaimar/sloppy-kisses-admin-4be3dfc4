import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { CreditCard, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase/client";

const zar = (n: number) => "R " + Number(n ?? 0).toLocaleString("en-ZA", { minimumFractionDigits: 2 });

interface InvoiceLite {
  id: string;
  invoice_number: string | null;
  total: number;
  amount_paid: number;
  balance_due: number;
  status: string;
  due_date: string | null;
  deposit_due: number | null;
}

/** One invoice per hotel stay: the deposit is an amount to collect, not a second document. */
export function useHotelMoney(bookingId: string | null | undefined) {
  return useQuery({
    queryKey: ["hotel_money", bookingId],
    enabled: Boolean(bookingId),
    queryFn: async () => {
      const { data: b, error } = await supabase
        .from("bookings")
        .select("id, invoice_id, deposit_waived, start_date, service_type")
        .eq("id", bookingId as string)
        .maybeSingle();
      if (error) throw error;
      if (!b || !b.invoice_id) return null;
      const { data: inv, error: e2 } = await supabase
        .from("invoices")
        .select("id, invoice_number, total, amount_paid, balance_due, status, due_date, deposit_due")
        .eq("id", b.invoice_id)
        .maybeSingle();
      if (e2) throw e2;
      if (!inv) return null;
      return { booking: b as any, invoice: inv as unknown as InvoiceLite };
    },
  });
}

export function HotelMoneyStrip({
  bookingId,
  mode = "portal",
}: {
  bookingId: string;
  mode?: "portal" | "admin";
}) {
  const qc = useQueryClient();
  const q = useHotelMoney(bookingId);
  const [busy, setBusy] = useState<null | "deposit" | "full">(null);

  if (q.isLoading || !q.data) return null;
  const { invoice, booking } = q.data;
  if (Number(invoice.total ?? 0) <= 0 || invoice.status === "cancelled") return null;

  const total = Number(invoice.total ?? 0);
  const paid = Number(invoice.amount_paid ?? 0);
  const outstanding = Number(invoice.balance_due ?? 0);
  const depositDue = Number(invoice.deposit_due ?? 0);
  const depositOutstanding = Math.max(0, Math.min(depositDue - paid, outstanding));
  const depositSettled = depositDue > 0 && depositOutstanding <= 0;
  const arrivalCleared = outstanding <= 0;
  const invoiceHref = mode === "portal" ? `/customer/invoices/${invoice.id}` : `/admin/invoices/${invoice.id}`;

  async function checkout(amount?: number) {
    const { data, error } = await supabase.functions.invoke("portal-invoice-checkout", {
      body: { invoice_id: invoice.id, ...(amount ? { amount } : {}) },
    });
    if (error) throw error;
    const url = (data as any)?.redirect_url;
    if (!url) throw new Error("No redirect URL returned");
    window.location.href = url;
  }

  async function payDeposit() {
    setBusy("deposit");
    try { await checkout(depositOutstanding); }
    catch (e: any) { toast.error(e?.message ?? "Could not start checkout"); setBusy(null); }
  }

  async function payInFull() {
    setBusy("full");
    try {
      await supabase.rpc("hotel_pay_in_full" as any, { p_booking_id: bookingId });
      await qc.invalidateQueries({ queryKey: ["hotel_money", bookingId] });
      await checkout();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not start checkout");
      setBusy(null);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-sk-surface-muted p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payment for this stay</div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${arrivalCleared ? "bg-sk-green/10 text-sk-green" : "bg-sk-orange-soft text-sk-orange"}`}>
          {arrivalCleared ? "Paid — arrival cleared" : depositSettled ? "Deposit paid — balance outstanding" : "Deposit outstanding"}
        </span>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Cell label="Stay total" value={zar(total)} href={invoiceHref} number={invoice.invoice_number} />
        {depositDue > 0 && (
          <Cell
            label="Deposit due now"
            value={zar(depositDue)}
            sub={depositSettled ? "Paid" : "Due now"}
            paid={depositSettled}
          />
        )}
        <Cell
          label="Balance outstanding"
          value={zar(outstanding)}
          sub={
            outstanding <= 0
              ? "Paid"
              : invoice.due_date
                ? `Due ${format(parseISO(invoice.due_date), "dd MMM yyyy")}`
                : "Due before arrival"
          }
          paid={outstanding <= 0}
        />
      </div>

      {mode === "portal" && outstanding > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {depositOutstanding > 0 && depositOutstanding < outstanding && (
            <button
              onClick={payDeposit}
              disabled={busy !== null}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {busy === "deposit" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
              Pay {zar(depositOutstanding)} deposit now
            </button>
          )}
          <button
            onClick={payInFull}
            disabled={busy !== null}
            className="inline-flex items-center gap-2 rounded-lg bg-sk-coral px-4 py-2 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-50"
          >
            {busy === "full" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
            Pay {zar(outstanding)} in full
          </button>
        </div>
      )}

      {mode === "admin" && booking?.start_date && !arrivalCleared && (
        <div className="mt-3 text-xs text-muted-foreground">
          Arrival {format(parseISO(booking.start_date), "dd MMM yyyy")} — {zar(outstanding)} still outstanding.
        </div>
      )}
    </div>
  );
}

function Cell({
  label, value, sub, paid, href, number,
}: {
  label: string; value: string; sub?: string; paid?: boolean; href?: string; number?: string | null;
}) {
  return (
    <div className="rounded-lg border border-border bg-white p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-semibold">{value}</div>
      {sub && (
        <div className={`mt-0.5 text-xs ${paid ? "text-sk-green" : "text-muted-foreground"}`}>{sub}</div>
      )}
      {href && number && (
        <Link to={href} className="mt-1 inline-block text-xs font-semibold text-sk-coral-dark hover:underline">
          {number}
        </Link>
      )}
    </div>
  );
}
