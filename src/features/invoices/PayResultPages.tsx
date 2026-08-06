import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, XCircle, Loader2, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type AttemptStatus = {
  attempt_status: string;
  invoice_number: string | null;
  amount: number | null;
  balance_due: number | null;
  invoice_status: string | null;
  paid: boolean;
};

function money(v: number | null | undefined) {
  if (v == null) return "—";
  return `R ${Number(v).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`;
}

export function PaySuccessPage() {
  const [params] = useSearchParams();
  const attemptId = params.get("att");
  const [status, setStatus] = useState<AttemptStatus | null>(null);
  const [waiting, setWaiting] = useState(Boolean(attemptId));
  const [round, setRound] = useState(0);
  const timedOut = useRef(false);

  useEffect(() => {
    if (!attemptId) return;
    let cancelled = false;
    const started = Date.now();

    async function poll() {
      const { data } = await supabase.rpc("payment_attempt_status", { p_attempt_id: attemptId });
      const row = Array.isArray(data) ? (data[0] as AttemptStatus | undefined) : null;
      if (cancelled) return;
      if (row) setStatus(row);
      if (row?.paid) { setWaiting(false); return; }
      if (Date.now() - started > 60_000) { timedOut.current = true; setWaiting(false); return; }
      setTimeout(poll, 3000);
    }
    poll();
    return () => { cancelled = true; };
  }, [attemptId, round]);

  const confirmed = status?.paid ?? false;

  return (
    <div className="min-h-screen grid place-items-center bg-sk-surface-muted p-6">
      <div className="sk-card max-w-md p-8 text-center">
        {waiting ? (
          <>
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-sk-coral" />
            <h1 className="mt-3 text-lg font-semibold">Confirming your payment…</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              We're waiting for PayFast to confirm{status?.invoice_number ? ` invoice ${status.invoice_number}` : ""}. This usually takes a few seconds.
            </p>
          </>
        ) : confirmed ? (
          <>
            <CheckCircle2 className="mx-auto h-10 w-10 text-sk-green" />
            <h1 className="mt-3 text-lg font-semibold">Payment confirmed</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {status?.invoice_number ? `Invoice ${status.invoice_number} has been updated.` : "Your invoice has been updated."}
              {" "}Amount paid {money(status?.amount)}. Balance now {money(status?.balance_due)}.
            </p>
          </>
        ) : attemptId ? (
          <>
            <Clock className="mx-auto h-10 w-10 text-amber-500" />
            <h1 className="mt-3 text-lg font-semibold">Still waiting on PayFast</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Your payment may have gone through, but we haven't had confirmation yet.
              {status?.invoice_number ? ` Invoice ${status.invoice_number} still shows ${money(status.balance_due)} outstanding.` : ""}
              {" "}Please give it a few minutes and refresh your invoice — if it still shows unpaid, contact us and we'll check it.
            </p>
            <button
              onClick={() => { timedOut.current = false; setWaiting(true); setRound((r) => r + 1); }}
              className="mt-4 inline-flex h-10 items-center rounded-xl bg-sk-coral px-4 text-sm font-semibold text-white">
              Check again
            </button>
          </>
        ) : (
          <>
            <CheckCircle2 className="mx-auto h-10 w-10 text-sk-green" />
            <h1 className="mt-3 text-lg font-semibold">Thanks — payment submitted</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              It may take a minute for the invoice to update. You can close this window.
            </p>
          </>
        )}
        <Link to="/" className="mt-4 inline-block text-xs font-medium text-sk-coral-dark">Return home</Link>
      </div>
    </div>
  );
}

export function PayCancelPage() {
  return (
    <div className="min-h-screen grid place-items-center bg-sk-surface-muted p-6">
      <div className="sk-card max-w-md p-8 text-center">
        <XCircle className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="mt-3 text-lg font-semibold">Payment cancelled</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          No charge was made. You can retry the payment from your invoice link at any time.
        </p>
      </div>
    </div>
  );
}