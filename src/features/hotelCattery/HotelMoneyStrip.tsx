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
  balance_due: number;
  status: string;
  due_date: string | null;
  invoice_kind: string | null;
}

export function useHotelMoney(bookingId: string | null | undefined) {
  return useQuery({
    queryKey: ["hotel_money", bookingId],
    enabled: Boolean(bookingId),
    queryFn: async () => {
      const { data: b, error } = await supabase
        .from("bookings")
        .select("id, invoice_id, deposit_invoice_id, deposit_waived, start_date, service_type")
        .eq("id", bookingId as string)
        .maybeSingle();
      if (error) throw error;
      if (!b) return null;
      const ids = [b.invoice_id, (b as any).deposit_invoice_id].filter(Boolean) as string[];
      let invoices: InvoiceLite[] = [];
      if (ids.length) {
        const { data: inv, error: e2 } = await supabase
          .from("invoices")
          .select("id, invoice_number, total, balance_due, status, due_date, invoice_kind")
          .in("id", ids);
        if (e2) throw e2;
        invoices = (inv ?? []) as unknown as InvoiceLite[];
      }
      return {
        booking: b as any,
        balance: invoices.find((i) => i.id === b.invoice_id) ?? null,
        deposit: invoices.find((i) => i.id === (b as any).deposit_invoice_id) ?? null,
      };
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
  const { deposit, balance, booking } = q.data;
  if (!deposit && !balance) return null;

  const total = Number(deposit?.total ?? 0) + Number(balance?.total ?? 0);
  const outstanding = Number(deposit?.balance_due ?? 0) + Number(balance?.balance_due ?? 0);
  const depositPaid = deposit ? Number(deposit.balance_due) <= 0 : false;
  const arrivalCleared = outstanding <= 0;
  const invoiceHref = (id: string) => (mode === "portal" ? `/customer/invoices/${id}` : `/admin/invoices/${id}`);

  async function checkout(invoiceId: string) {
    const { data, error } = await supabase.functions.invoke("portal-invoice-checkout", {
      body: { invoice_id: invoiceId },
    });
    if (error) throw error;
    const url = (data as any)?.redirect_url;
    if (!url) throw new Error("No redirect URL returned");
    window.location.href = url;
  }

  async function payDeposit() {
    if (!deposit) return;
    setBusy("deposit");
    try { await checkout(deposit.id); }
    catch (e: any) { toast.error(e?.message ?? "Could not start checkout"); setBusy(null); }
  }

  async function payInFull() {
    setBusy("full");
    try {
      let target = balance?.id ?? null;
      if (deposit && !depositPaid) {
        const { data, error } = await supabase.rpc("hotel_pay_in_full" as any, { p_booking_id: bookingId });
        if (error) throw error;
        target = (data as unknown as string) ?? target;
        await qc.invalidateQueries({ queryKey: ["hotel_money", bookingId] });
      }
      if (!target) throw new Error("No invoice to pay");
      await checkout(target);
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
          {arrivalCleared ? "Paid — arrival cleared" : depositPaid ? "Deposit paid — balance outstanding" : "Deposit outstanding"}
        </span>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Cell label="Stay total" value={zar(total)} />
        {deposit && (
          <Cell
            label="Deposit"
            value={zar(deposit.total)}
            sub={Number(deposit.balance_due) <= 0 ? "Paid" : "Due now"}
            paid={Number(deposit.balance_due) <= 0}
            href={invoiceHref(deposit.id)}
            number={deposit.invoice_number}
          />
        )}
        {balance && (
          <Cell
            label={deposit ? "Balance" : "Invoice"}
            value={zar(balance.total)}
            sub={
              Number(balance.balance_due) <= 0
                ? "Paid"
                : balance.due_date
                  ? `Due ${format(parseISO(balance.due_date), "dd MMM yyyy")}`
                  : "Due"
            }
            paid={Number(balance.balance_due) <= 0}
            href={invoiceHref(balance.id)}
            number={balance.invoice_number}
          />
        )}
      </div>

      {mode === "portal" && outstanding > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {deposit && !depositPaid && (
            <button
              onClick={payDeposit}
              disabled={busy !== null}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {busy === "deposit" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
              Pay {zar(deposit.balance_due)} deposit now
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
