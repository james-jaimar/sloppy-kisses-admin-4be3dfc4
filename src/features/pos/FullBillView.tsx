import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { ModalShell } from "@/components/modals/ModalShell";
import { billTotals } from "./billTotals";
import { lineUnitPrice, type PosLine } from "./queries";

export function usePosInvoice(tenantId: string, invoiceId?: string | null) {
  return useQuery({ queryKey: ["pos_full_bill", tenantId, invoiceId], enabled: Boolean(tenantId && invoiceId),
    queryFn: async () => {
      const { data, error } = await supabase.from("invoices")
        .select("id, invoice_number, status, total, tax_total, discount_total, amount_paid, balance_due, invoice_items(id, description, quantity, unit_price, line_total, vat_amount, discount_pct, discount_amount, sort_order), payments(id, amount, payment_method, payment_reference, status)")
        .eq("tenant_id", tenantId).eq("id", invoiceId ?? "").single();
      if (error) throw error;
      return data;
    },
  });
}

export function FullBillContent({ tenantId, invoiceId, lines = [], discount = 0, customerName }: {
  tenantId: string; invoiceId?: string | null; lines?: PosLine[]; discount?: number; customerName: string;
}) {
  const q = usePosInvoice(tenantId, invoiceId);
  if (invoiceId && q.isPending) return <p role="status" className="p-4 text-sm text-muted-foreground">Loading full bill…</p>;
  if (q.isError) return <div role="alert" className="p-4 text-sm text-destructive">Could not load the full bill. <Button variant="outline" onClick={() => q.refetch()}>Retry</Button></div>;
  const invoice = q.data;
  const totals = billTotals(invoice ? { total: Number(invoice.total), tax_total: Number(invoice.tax_total), amount_paid: Number(invoice.amount_paid), balance_due: Number(invoice.balance_due) } : null,
    lines.map(l => ({ quantity: l.qty, unit_price: lineUnitPrice(l), vat_rate: Number(l.product.vat_rate ?? 0) })), discount);
  return <div className="space-y-4 p-4 text-sm">
    <div className="flex flex-wrap justify-between gap-2"><strong>{customerName}</strong><span>{invoice?.invoice_number ?? "New sale"}</span></div>
    {invoice && <section><h3 className="mb-2 font-semibold">On this invoice</h3>
      {[...invoice.invoice_items].sort((a,b) => a.sort_order-b.sort_order).map(l => <div key={l.id} className="flex justify-between gap-4 border-b border-border py-2">
        <div className="min-w-0 break-words">{l.description}<div className="text-xs text-muted-foreground">{Number(l.quantity)} × R {Number(l.unit_price).toFixed(2)}{Number(l.discount_pct) > 0 ? ` · ${l.discount_pct}% discount` : Number(l.discount_amount) > 0 ? ` · R ${Number(l.discount_amount).toFixed(2)} discount` : ""}</div></div>
        <span className="shrink-0 tabular-nums">R {Number(l.line_total).toFixed(2)}</span>
      </div>)}</section>}
    {lines.length > 0 && <section><h3 className="mb-2 font-semibold">{invoice ? "Shop items to add" : "Shop items"}</h3>
      {lines.map(l => <div key={l.product.id} className="flex justify-between gap-4 border-b border-border py-2"><span className="min-w-0 break-words">{l.qty} × {l.product.name}<span className="block text-xs text-muted-foreground">@ R {lineUnitPrice(l).toFixed(2)}</span></span><span className="shrink-0 tabular-nums">R {(l.qty * lineUnitPrice(l)).toFixed(2)}</span></div>)}
      {discount > 0 && <Amount label="Shop discount" value={-discount} />}
    </section>}
    <div className="space-y-2 border-t border-border pt-3">
      <Amount label="Full invoice total" value={totals.total} /><Amount label="VAT included" value={totals.vat} />
      <Amount label="Payments / credits already applied" value={totals.paid} />
      <div className="text-lg font-bold"><Amount label="Balance due" value={totals.due} /></div>
    </div>
    {invoice && invoice.payments.length > 0 && <section><h3 className="font-semibold">Payment history</h3>{invoice.payments.map(p => <div key={p.id} className="flex justify-between gap-3 py-1 text-xs"><span className="break-words">{p.payment_method === "yoko" ? "Yoco" : p.payment_method} · {p.status}{p.payment_reference ? ` · ${p.payment_reference}` : ""}</span><span className="shrink-0">R {Number(p.amount).toFixed(2)}</span></div>)}</section>}
  </div>;
}
function Amount({ label, value }: { label: string; value: number }) { return <div className="flex justify-between gap-4"><span>{label}</span><span className="shrink-0 tabular-nums">R {value.toFixed(2)}</span></div>; }
export function FullBillDialog(props: React.ComponentProps<typeof FullBillContent> & { onClose: () => void }) {
  return <ModalShell title="Full bill" onClose={props.onClose} className="rounded-lg" footer={<Button variant="outline" onClick={props.onClose}>Close</Button>}><FullBillContent {...props} /></ModalShell>;
}