import { Link } from "react-router-dom";
import { CheckCircle2, XCircle } from "lucide-react";

export function PaySuccessPage() {
  return (
    <div className="min-h-screen grid place-items-center bg-sk-surface-muted p-6">
      <div className="sk-card max-w-md p-8 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-sk-green" />
        <h1 className="mt-3 text-lg font-semibold">Thanks — payment received</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          PayFast has confirmed your payment. It may take a minute for the invoice to update.
          You can close this window.
        </p>
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