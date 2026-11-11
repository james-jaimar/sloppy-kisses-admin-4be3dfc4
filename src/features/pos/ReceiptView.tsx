import { useEffect, useState } from "react";
import { Mail, Printer, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import { resolveLogoUrl } from "@/lib/branding/BrandingProvider";
import { useSendInvoiceEmail } from "@/features/invoices/queries";
import { type PosLine, type PosSaleResult, type PosTender } from "./queries";
import { FullBillContent, FullBillDialog } from "./FullBillView";
import ReceiptEmailStatus from "./ReceiptEmailStatus";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";

interface Props {
  tenantId: string;
  result: PosSaleResult;
  lines: PosLine[];
  discount: number;
  tenders: PosTender[];
  customerName: string;
  customerEmail: string | null;
  tillName: string;
  footer: string | null;
  onNewSale: () => void;
  /** Amount that was already on this bill before the shop items were added. */
  priorAmount?: number;
}

export default function ReceiptView({
  tenantId, result, lines, discount, tenders, customerName, customerEmail, tillName, footer, onNewSale, priorAmount = 0,
}: Props) {
  const { tenant } = useCurrentTenant();
  const [logo, setLogo] = useState<string | null>(null);
  const sendEmail = useSendInvoiceEmail(tenantId);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    resolveLogoUrl(tenant?.logo_url).then(setLogo);
  }, [tenant?.logo_url]);

  async function emailReceipt() {
    if (!customerEmail) {
      toast.error("This customer has no email address");
      return;
    }
    try {
      await sendEmail.mutateAsync({ invoice_id: result.invoice_id });
      toast.success(`Receipt emailed to ${customerEmail}`);
    } catch (err: any) {
      toast.error(err?.message ?? "Could not send the receipt");
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-background p-5">
      <div className="mx-auto max-w-md">
        <div className="mb-4 rounded-2xl bg-sk-coral p-6 text-center text-white print:hidden">
          <div className="text-sm font-semibold uppercase tracking-wide opacity-90">Sale complete</div>
          <div className="mt-1 text-4xl font-bold tabular-nums">R {result.total.toFixed(2)}</div>
          {result.change > 0 && (
            <div className="mt-2 text-lg font-semibold">Change due R {result.change.toFixed(2)}</div>
          )}
          <div className="mt-1 text-xs opacity-90">{result.invoice_number}</div>
        </div>

        {/* 80mm receipt */}
        <div id="pos-receipt" className="mx-auto w-full max-w-[80mm] rounded-2xl border border-border bg-white p-4 font-mono text-[12px] leading-snug">
          <div className="text-center">
            {logo && <img src={logo} alt="" className="mx-auto mb-2 h-12 object-contain" />}
            <div className="text-sm font-bold">{tenant?.name ?? "Sloppy Kisses"}</div>
            <div className="text-[11px]">{tillName}</div>
            <div className="text-[11px]">{new Date().toLocaleString("en-ZA")}</div>
            <div className="text-[11px]">{result.invoice_number}</div>
          </div>
          <Divider />
          <div>Customer: {customerName}</div>
          <Divider />
          <FullBillContent tenantId={tenantId} invoiceId={result.invoice_id} customerName={customerName} />
          <Divider />
          <div className="flex justify-between text-sm font-bold">
            <span>TOTAL</span>
            <span className="tabular-nums">R {result.total.toFixed(2)}</span>
          </div>
          <Divider />
          {tenders.map((t, i) => (
            <Row key={i} label={t.method.toUpperCase()} value={t.amount} />
          ))}
          {tenders.length === 0 && <div>Charged to account</div>}
          {result.change > 0 && <Row label="CHANGE" value={result.change} />}
          {result.total - result.paid > 0.004 && (
            <Row label="BALANCE STILL DUE" value={Number((result.total - result.paid).toFixed(2))} />
          )}
          <Divider />
          <div className="whitespace-pre-line text-center text-[11px]">
            {footer || "Thank you for shopping with us!"}
          </div>
        </div>

        <div className="mt-4 grid gap-2 print:hidden">
          <ReceiptEmailStatus tenantId={tenantId} invoiceId={result.invoice_id} />
          <Button variant="outline" onClick={() => setPreview(true)}><FileText className="mr-2 h-4 w-4" />View full invoice</Button>
          <button onClick={() => window.print()} className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl border border-border bg-white text-base font-semibold">
            <Printer className="h-5 w-5" /> Print receipt
          </button>
          <button
            onClick={emailReceipt}
            disabled={!customerEmail || sendEmail.isPending}
            className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl border border-border bg-white text-base font-semibold disabled:opacity-40"
          >
            <Mail className="h-5 w-5" /> {sendEmail.isPending ? "Sending…" : "Resend receipt"}
          </button>
          <button onClick={onNewSale} className="inline-flex h-16 items-center justify-center gap-2 rounded-2xl bg-sk-coral text-lg font-bold text-white">
            <RotateCcw className="h-5 w-5" /> New sale
          </button>
        </div>
      </div>

      {preview && <FullBillDialog tenantId={tenantId} invoiceId={result.invoice_id} customerName={customerName} onClose={() => setPreview(false)} />}

      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #pos-receipt, #pos-receipt * { visibility: visible !important; }
          #pos-receipt { position: absolute; left: 0; top: 0; width: 80mm; border: none; }
          @page { size: 80mm auto; margin: 4mm; }
        }
      `}</style>
    </div>
  );
}

function Divider() {
  return <div className="my-2 border-t border-dashed border-border" />;
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span className="tabular-nums">{value.toFixed(2)}</span>
    </div>
  );
}
