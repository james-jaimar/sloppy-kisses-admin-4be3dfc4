import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2, Download } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/lib/supabase/client";
import { fmtZar } from "./status";

type Data = {
  invoice: any;
  customer: any;
  items: any[];
  tenant: any;
  settings: any;
};

export default function PublicInvoicePage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    (supabase as any).rpc("get_public_invoice", { p_token: token })
      .then(({ data, error }: any) => {
        if (error) setError(error.message);
        else if (!data) setError("This invoice link is invalid or has expired.");
        else setData(data as Data);
      })
      .finally(() => setLoading(false));
  }, [token]);

  async function downloadPdf() {
    if (!data) return;
    setDownloading(true);
    try {
      const url = `${(import.meta as any).env.VITE_SUPABASE_URL}/functions/v1/generate-invoice-public-pdf`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) throw new Error("PDF unavailable");
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${data.invoice.invoice_number}.pdf`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      // Best-effort — public PDF endpoint isn't required for this slice.
    } finally { setDownloading(false); }
  }

  if (loading) return (
    <div className="min-h-screen grid place-items-center text-muted-foreground">
      <div className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading invoice…</div>
    </div>
  );
  if (error || !data) return (
    <div className="min-h-screen grid place-items-center p-6">
      <div className="sk-card max-w-md p-6 text-center">
        <div className="text-lg font-semibold">Can't open this invoice</div>
        <p className="mt-2 text-sm text-muted-foreground">{error ?? "Unknown error"}</p>
      </div>
    </div>
  );

  const { invoice, customer, items, tenant, settings } = data;
  const brand = tenant?.primary_colour || "#ff5a5a";

  return (
    <div className="min-h-screen bg-sk-surface-muted py-10">
      <div className="mx-auto max-w-3xl px-4">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-sm text-muted-foreground">Invoice from <span className="font-medium text-foreground">{tenant?.name}</span></div>
          <button onClick={downloadPdf} disabled={downloading}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-white px-3 text-xs font-medium hover:bg-muted disabled:opacity-50">
            <Download className="h-3.5 w-3.5" /> Download PDF
          </button>
        </div>

        <div className="sk-card overflow-hidden">
          <div className="h-2" style={{ background: brand }} />
          <div className="p-8">
            <div className="flex items-start justify-between gap-6">
              <div>
                <div className="text-2xl font-semibold" style={{ color: brand }}>{settings?.company_name || tenant?.name}</div>
                {settings?.vat_number && <div className="text-xs text-muted-foreground">VAT {settings.vat_number}</div>}
                {settings?.address && <div className="mt-2 whitespace-pre-line text-xs text-muted-foreground">{settings.address}</div>}
              </div>
              <div className="text-right">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Tax invoice</div>
                <div className="text-lg font-semibold">{invoice.invoice_number}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Issued: {invoice.issue_date ? format(new Date(invoice.issue_date), "dd MMM yyyy") : "—"}
                </div>
                <div className="text-xs text-muted-foreground">
                  Due: {invoice.due_date ? format(new Date(invoice.due_date), "dd MMM yyyy") : "—"}
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-lg border border-border bg-white p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Bill to</div>
              <div className="mt-1 font-medium">{customer?.full_name}</div>
              <div className="text-xs text-muted-foreground">
                {[customer?.address_line_1, customer?.suburb, customer?.city, customer?.postcode].filter(Boolean).join(", ")}
              </div>
              {customer?.email && <div className="text-xs text-muted-foreground">{customer.email}</div>}
            </div>

            <table className="mt-6 w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="py-2">Description</th>
                  <th className="py-2 text-right w-16">Qty</th>
                  <th className="py-2 text-right w-24">Unit</th>
                  <th className="py-2 text-right w-28">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((it) => (
                  <tr key={it.id}>
                    <td className="py-2">{it.description}</td>
                    <td className="py-2 text-right tabular-nums">{Number(it.quantity)}</td>
                    <td className="py-2 text-right tabular-nums">{fmtZar(it.unit_price)}</td>
                    <td className="py-2 text-right tabular-nums font-medium">{fmtZar(it.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-6 flex justify-end">
              <div className="w-64 space-y-1 text-sm">
                <Row label="Subtotal" value={fmtZar(invoice.subtotal)} />
                <Row label="Total" value={fmtZar(invoice.total)} bold />
                <Row label="Paid" value={fmtZar(invoice.amount_paid)} />
                <div className="mt-2 rounded-lg px-3 py-2" style={{ background: `${brand}20` }}>
                  <Row label="Balance due" value={fmtZar(invoice.balance_due)} bold />
                </div>
              </div>
            </div>

            {settings?.banking_details && (
              <div className="mt-6 rounded-lg border border-border bg-white p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Banking details</div>
                <div className="mt-1 whitespace-pre-line text-sm">{settings.banking_details}</div>
              </div>
            )}

            {(invoice.notes || settings?.footer_notes) && (
              <div className="mt-4 whitespace-pre-line text-xs text-muted-foreground">
                {[invoice.notes, settings?.footer_notes].filter(Boolean).join("\n\n")}
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 text-center text-xs text-muted-foreground">
          Questions? Reply to the email or contact {tenant?.contact_email || tenant?.name}.
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={"flex justify-between " + (bold ? "font-semibold" : "text-muted-foreground")}>
      <span>{label}</span>
      <span className="tabular-nums text-foreground">{value}</span>
    </div>
  );
}