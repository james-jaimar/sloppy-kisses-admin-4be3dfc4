import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Plus, Trash2, Send, Ban, CreditCard, Save, X, Loader2, Download, Mail, Link as LinkIcon, BellOff, Bell, FileMinus, RotateCcw, Undo2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import { useInvoice, useIssueInvoice, useVoidInvoice, useUpsertInvoiceItem, useDeleteInvoiceItem, useInvoicingSettings, useUpdateInvoice, useInvoiceEvents, useSendInvoiceEmail, type InvoiceEvent } from "./queries";
import { InvoiceStatusChip, fmtZar } from "./status";
import { RecordPaymentDialog } from "./RecordPaymentDialog";
import { Can } from "@/components/auth/Can";
import { useCurrentUser } from "@/lib/tenant/TenantContext";
import { useCreditNotesForInvoice } from "@/features/creditNotes/queries";
import { CreditNoteStatusChip } from "@/features/creditNotes/status";
import { IssueCreditNoteDrawer } from "@/features/creditNotes/IssueCreditNoteDrawer";
import { RecordRefundDialog } from "@/features/refunds/RecordRefundDialog";
import { useRefundsForInvoice, useVoidRefund } from "@/features/refunds/queries";
import { AllocateCreditDialog } from "@/features/customerCredit/AllocateCreditDialog";
import { useCustomerCreditBalance } from "@/features/customerCredit/queries";
import { useConfirm } from "@/components/ui/confirm-dialog";

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { hasPermission, profile } = useCurrentUser();
  const isPlatform = profile?.user_type === "platform";
  const can = (code: string) => isPlatform || hasPermission(code);
  const canUpdate = can("invoices.update");

  const invQ = useInvoice(id, tenantId);
  const eventsQ = useInvoiceEvents(tenantId, id);
  const settingsQ = useInvoicingSettings(tenantId);
  const issue = useIssueInvoice(tenantId ?? "");
  const voidInv = useVoidInvoice(tenantId ?? "");
  const upsert = useUpsertInvoiceItem(tenantId ?? "");
  const del = useDeleteInvoiceItem(tenantId ?? "");
  const updateInv = useUpdateInvoice(tenantId ?? "");
  const sendEmail = useSendInvoiceEmail(tenantId ?? "");

  const [payOpen, setPayOpen] = useState(false);
  const [issueCnOpen, setIssueCnOpen] = useState(false);
  const [refundFor, setRefundFor] = useState<any | null>(null);
  const [allocateOpen, setAllocateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  type Draft = { description: string; quantity: number; unit_price: number; vat_rate: number; discount_pct: number; vat_inclusive: boolean };
  const [draft, setDraft] = useState<Draft>({ description: "", quantity: 1, unit_price: 0, vat_rate: 15, discount_pct: 0, vat_inclusive: false });
  const [adding, setAdding] = useState(false);
  const [notesEdit, setNotesEdit] = useState<string | null>(null);

  const inv = invQ.data;
  const isDraft = inv?.status === "draft";
  // Issued-but-not-yet-sent invoices are still editable (booking edits re-price them).
  const isEditable = inv?.status === "draft" || inv?.status === "issued";
  const balance = Number(inv?.balance_due ?? 0);
  const hasBeenSent = Boolean((inv as any)?.sent_at);
  const cnQ = useCreditNotesForInvoice(tenantId, inv?.id ?? null);
  const creditsApplied = Number(cnQ.data?.totalApplied ?? 0);
  const refundsQ = useRefundsForInvoice(tenantId, inv?.id ?? null);
  const voidRefund = useVoidRefund(tenantId ?? "");
  const creditBalQ = useCustomerCreditBalance(tenantId, inv?.customer_id ?? null);
  const creditBalance = Number(creditBalQ.data ?? 0);
  const totalRefunded = (refundsQ.data ?? [])
    .filter((r) => r.status === "succeeded")
    .reduce((s, r) => s + Number(r.amount), 0);

  const refundsByPayment = new Map<string, typeof refundsQ.data>();
  for (const r of refundsQ.data ?? []) {
    if (!r.payment_id) continue;
    const arr = refundsByPayment.get(r.payment_id) ?? [];
    arr.push(r as any);
    refundsByPayment.set(r.payment_id, arr as any);
  }

  async function saveLine(invoice_id: string) {
    if (!draft.description.trim()) { toast.error("Description required"); return; }
    try {
      await upsert.mutateAsync({
        id: editingId ?? undefined,
        invoice_id,
        description: draft.description,
        quantity: Number(draft.quantity),
        unit_price: Number(draft.unit_price),
        vat_rate: Number(draft.vat_rate),
        discount_pct: Number(draft.discount_pct),
        vat_inclusive: !!draft.vat_inclusive,
      });
      setEditingId(null); setAdding(false);
      setDraft({ description: "", quantity: 1, unit_price: 0, vat_rate: Number(settingsQ.data?.default_vat_rate ?? 15), discount_pct: 0, vat_inclusive: !!(settingsQ.data as any)?.prices_include_vat });
    } catch (err: any) { toast.error(err?.message ?? "Failed"); }
  }

  async function doIssue() {
    if (!inv) return;
    try {
      await issue.mutateAsync({ id: inv.id, due_days: settingsQ.data?.payment_terms_days ?? 14 });
      toast.success("Invoice issued");
    } catch (err: any) { toast.error(err?.message ?? "Failed"); }
  }

  async function doVoid() {
    if (!inv) return;
    if (!(await confirm({ title: "Void invoice?", description: "It will be marked as cancelled.", confirmLabel: "Void", tone: "destructive" }))) return;
    try { await voidInv.mutateAsync(inv.id); toast.success("Invoice voided"); }
    catch (err: any) { toast.error(err?.message ?? "Failed"); }
  }

  async function doSend() {
    if (!inv) return;
    const to = inv.customer?.email ?? "";
    if (!to) { toast.error("Customer has no email on file."); return; }
    if (!(await confirm({ title: `Email invoice ${inv.invoice_number}?`, description: `We'll send it to ${to}.`, confirmLabel: "Send email" }))) return;
    try {
      await sendEmail.mutateAsync({ invoice_id: inv.id, kind: "send" });
      toast.success(`Invoice emailed to ${to}`);
    } catch (err: any) { toast.error(err?.message ?? "Failed to send"); }
  }

  async function saveNotes() {
    if (!inv || notesEdit === null) return;
    try {
      await updateInv.mutateAsync({ id: inv.id, patch: { notes: notesEdit } as any });
      toast.success("Notes saved");
      setNotesEdit(null);
    } catch (err: any) { toast.error(err?.message ?? "Failed"); }
  }

  return (
    <>
      <AppHeader
        title={inv ? `Invoice ${inv.invoice_number}` : "Invoice"}
        subtitle={inv?.customer?.full_name ?? "Loading…"}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => navigate("/admin/invoices")}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-white px-3 text-sm font-medium hover:bg-muted">
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            {inv && isDraft && (
              <Can code="invoices.send">
                <button onClick={doIssue} disabled={issue.isPending}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-sk-coral px-4 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-50">
                  <Send className="h-4 w-4" /> Issue
                </button>
              </Can>
            )}
            {inv && !isDraft && inv.status !== "cancelled" && (
              <Can code="invoices.send">
                <button onClick={doSend} disabled={sendEmail.isPending}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-white px-3 text-sm font-medium hover:bg-muted disabled:opacity-50">
                  <Mail className="h-4 w-4" /> {hasBeenSent ? "Resend" : "Send"}
                </button>
              </Can>
            )}
            {inv && !isDraft && inv.status !== "cancelled" && balance > 0 && (
              <Can code="payments.create">
                <button onClick={() => setPayOpen(true)}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-sk-green px-4 text-sm font-semibold text-white hover:bg-sk-green/90">
                  <CreditCard className="h-4 w-4" /> Record payment
                </button>
              </Can>
            )}
            {inv && !isDraft && inv.status !== "cancelled" && balance > 0 && creditBalance > 0 && (
              <Can code="customer_credit.allocate">
                <button onClick={() => setAllocateOpen(true)}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-white px-3 text-sm font-medium hover:bg-muted">
                  <CreditCard className="h-4 w-4" /> Apply credit ({fmtZar(creditBalance)})
                </button>
              </Can>
            )}
            {inv && inv.status !== "cancelled" && (
              <Can code="invoices.void">
                <button onClick={doVoid}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-white px-3 text-sm font-medium hover:bg-muted">
                  <Ban className="h-4 w-4" /> Void
                </button>
              </Can>
            )}
            {inv && !isDraft && inv.status !== "cancelled" && (
              <Can code="credit_notes.create">
                <button onClick={() => setIssueCnOpen(true)}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-white px-3 text-sm font-medium hover:bg-muted">
                  <FileMinus className="h-4 w-4" /> Credit note
                </button>
              </Can>
            )}
            <button onClick={async () => {
              if (!inv) return;
              try {
                const { downloadInvoicePdf } = await import("./pdf");
                await downloadInvoicePdf(inv.id, `${inv.invoice_number}.pdf`);
              } catch (e: any) { toast.error(e?.message ?? "PDF failed"); }
            }}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-white px-3 text-sm font-medium hover:bg-muted">
              <Download className="h-4 w-4" /> PDF
            </button>
          </div>
        }
      />
      <div className="flex-1 p-6">
        {invQ.isLoading ? (
          <div className="flex items-center gap-2 py-20 justify-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : !inv ? (
          <div className="sk-card p-6 text-sm text-muted-foreground">Invoice not found.</div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
            <div className="space-y-6">
              <div className="sk-card p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">{inv.invoice_number}</div>
                      {(inv as any).billing_period_start && (
                        <span className="rounded-full bg-sk-teal/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sk-teal">
                          {format(new Date((inv as any).billing_period_start), "MMM yyyy")}
                        </span>
                      )}
                    </div>
                    <div className="mt-1"><InvoiceStatusChip status={inv.status} /></div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Balance due</div>
                    <div className="text-2xl font-semibold tabular-nums">{fmtZar(inv.balance_due)}</div>
                  </div>
                </div>
                <div className="mt-5 grid gap-4 sm:grid-cols-3">
                  <Field label="Issued">{inv.issue_date ? format(new Date(inv.issue_date), "dd MMM yyyy") : "—"}</Field>
                  <Field label="Due">{inv.due_date ? format(new Date(inv.due_date), "dd MMM yyyy") : "—"}</Field>
                  <Field label="Total">{fmtZar(inv.total)}</Field>
                </div>
              </div>

              <div className="sk-card overflow-hidden">
                <div className="flex items-center justify-between border-b border-border px-5 py-3">
                  <div className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Line items</div>
                  {isEditable && canUpdate && !adding && !editingId && (
                    <button onClick={() => { setAdding(true); setDraft({ description: "", quantity: 1, unit_price: 0, vat_rate: Number(settingsQ.data?.default_vat_rate ?? 15), discount_pct: 0, vat_inclusive: !!(settingsQ.data as any)?.prices_include_vat }); }}
                      className="inline-flex items-center gap-1 rounded-lg bg-sk-coral px-2.5 py-1 text-xs font-semibold text-white hover:bg-sk-coral-dark">
                      <Plus className="h-3.5 w-3.5" /> Add line
                    </button>
                  )}
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-sk-surface-muted text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-5 py-2">Description</th>
                      <th className="px-5 py-2 w-20 text-right">Qty</th>
                      <th className="px-5 py-2 w-32 text-right">Unit</th>
                      <th className="px-5 py-2 w-16 text-right">Disc%</th>
                      <th className="px-5 py-2 w-16 text-right">VAT%</th>
                      <th className="px-5 py-2 w-32 text-right">Total</th>
                      <th className="px-5 py-2 w-24"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {inv.items.map((it) => editingId === it.id ? (
                      <LineEditor key={it.id} draft={draft} setDraft={setDraft}
                        onCancel={() => setEditingId(null)} onSave={() => saveLine(inv.id)} pending={upsert.isPending} />
                    ) : (
                      <tr key={it.id}>
                        <td className="px-5 py-3">{it.description}</td>
                        <td className="px-5 py-3 text-right tabular-nums">{Number(it.quantity)}</td>
                        <td className="px-5 py-3 text-right tabular-nums">{fmtZar(it.unit_price)}</td>
                        <td className="px-5 py-3 text-right tabular-nums text-xs text-muted-foreground">{Number((it as any).discount_pct ?? 0) || "—"}</td>
                        <td className="px-5 py-3 text-right tabular-nums text-xs text-muted-foreground">{Number((it as any).vat_rate ?? 0) || "—"}</td>
                        <td className="px-5 py-3 text-right tabular-nums font-semibold">{fmtZar(it.line_total)}</td>
                        <td className="px-5 py-3 text-right">
                          {isEditable && canUpdate && (
                            <div className="inline-flex gap-1">
                              <button onClick={() => { setEditingId(it.id); setDraft({ description: it.description, quantity: Number(it.quantity), unit_price: Number(it.unit_price), vat_rate: Number((it as any).vat_rate ?? settingsQ.data?.default_vat_rate ?? 15), discount_pct: Number((it as any).discount_pct ?? 0), vat_inclusive: !!(it as any).vat_inclusive }); }}
                                className="rounded border border-border px-2 py-0.5 text-xs">Edit</button>
                              <button onClick={async () => {
                                if (!(await confirm({ title: "Remove line?", confirmLabel: "Remove", tone: "destructive" }))) return;
                                await del.mutateAsync({ id: it.id, invoice_id: inv.id });
                              }} className="rounded border border-border px-2 py-0.5 text-xs text-sk-coral-dark">
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                    {adding && (
                      <LineEditor draft={draft} setDraft={setDraft}
                        onCancel={() => setAdding(false)} onSave={() => saveLine(inv.id)} pending={upsert.isPending} />
                    )}
                    {inv.items.length === 0 && !adding && (
                      <tr><td colSpan={7} className="px-5 py-10 text-center text-muted-foreground">No lines yet.</td></tr>
                    )}
                  </tbody>
                  <tfoot className="bg-sk-surface-muted">
                    <tr>
                      <td colSpan={5} className="px-5 py-2 text-right text-xs text-muted-foreground">Subtotal</td>
                      <td className="px-5 py-2 text-right text-xs tabular-nums">{fmtZar(inv.subtotal)}</td>
                      <td />
                    </tr>
                    {Number((inv as any).discount_total ?? 0) > 0 && (
                      <tr>
                        <td colSpan={5} className="px-5 py-2 text-right text-xs text-muted-foreground">Discount</td>
                        <td className="px-5 py-2 text-right text-xs tabular-nums">−{fmtZar((inv as any).discount_total)}</td>
                        <td />
                      </tr>
                    )}
                    <tr>
                      <td colSpan={5} className="px-5 py-2 text-right text-xs text-muted-foreground">VAT</td>
                      <td className="px-5 py-2 text-right text-xs tabular-nums">{fmtZar((inv as any).tax_total ?? 0)}</td>
                      <td />
                    </tr>
                    <tr>
                      <td colSpan={5} className="px-5 py-3 text-right text-sm font-semibold">Total</td>
                      <td className="px-5 py-3 text-right text-sm font-semibold tabular-nums">{fmtZar(inv.total)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="sk-card p-5">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Notes</div>
                  {notesEdit === null ? canUpdate ? (
                    <button onClick={() => setNotesEdit(inv.notes ?? "")}
                      className="text-xs text-sk-coral-dark hover:underline">Edit</button>
                  ) : null : (
                    <div className="flex gap-2">
                      <button onClick={saveNotes} className="inline-flex items-center gap-1 rounded bg-sk-coral px-2 py-1 text-xs font-semibold text-white">
                        <Save className="h-3 w-3" /> Save
                      </button>
                      <button onClick={() => setNotesEdit(null)} className="rounded border border-border px-2 py-1 text-xs">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
                {notesEdit === null ? (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{inv.notes || "—"}</p>
                ) : (
                  <textarea rows={3} value={notesEdit} onChange={(e) => setNotesEdit(e.target.value)}
                    className="mt-2 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" />
                )}
              </div>
            </div>

            <div className="space-y-6">
              <div className="sk-card p-5">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Customer</div>
                {inv.customer ? (
                  <div className="mt-2 text-sm">
                    <Link to={`/admin/customers/${inv.customer.id}`} className="font-medium hover:text-sk-coral-dark">
                      {inv.customer.full_name ?? "Unnamed"}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {inv.customer.customer_number} · {inv.customer.mobile ?? inv.customer.email ?? "—"}
                    </div>
                  </div>
                ) : <div className="mt-1 text-sm text-muted-foreground">—</div>}
              </div>

              {!isDraft && inv.status !== "cancelled" && (inv as any).public_view_token && (
                <div className="sk-card p-5">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Share link</div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    Send: <span className="tabular-nums">{(inv as any).send_count ?? 0}×</span>
                    {(inv as any).last_sent_at && <> · Last: {format(new Date((inv as any).last_sent_at), "dd MMM yyyy HH:mm")}</>}
                    {(inv as any).viewed_at && <> · Viewed: {format(new Date((inv as any).viewed_at), "dd MMM yyyy HH:mm")}</>}
                  </div>
                  <button
                    onClick={() => {
                      const url = `${window.location.origin}/i/${(inv as any).public_view_token}`;
                      navigator.clipboard.writeText(url).then(() => toast.success("Link copied"));
                    }}
                    className="mt-2 inline-flex items-center gap-1 text-xs text-sk-coral-dark hover:underline">
                    <LinkIcon className="h-3 w-3" /> Copy public link
                  </button>
                </div>
              )}

              {!isDraft && inv.status !== "cancelled" && balance > 0 && (
                <div className="sk-card p-5">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reminders</div>
                    {canUpdate && (
                      <button
                        onClick={async () => {
                          try {
                            await updateInv.mutateAsync({ id: inv.id, patch: { reminders_paused: !(inv as any).reminders_paused } as any });
                            toast.success((inv as any).reminders_paused ? "Reminders resumed" : "Reminders paused");
                          } catch (e: any) { toast.error(e?.message ?? "Failed"); }
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-medium hover:bg-muted">
                        {(inv as any).reminders_paused
                          ? (<><Bell className="h-3 w-3" /> Resume</>)
                          : (<><BellOff className="h-3 w-3" /> Pause</>)}
                      </button>
                    )}
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    {(inv as any).reminders_paused
                      ? "Automatic reminders are paused for this invoice."
                      : "Sent daily at 08:00 SAST on the offsets configured in Settings → Invoicing."}
                  </div>
                  {(inv as any).last_reminder_at && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      Last reminder: {format(new Date((inv as any).last_reminder_at), "dd MMM yyyy HH:mm")}
                      {typeof (inv as any).last_reminder_offset === "number" && <> · day {(inv as any).last_reminder_offset}</>}
                    </div>
                  )}
                </div>
              )}

              <div className="sk-card p-5">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payments</div>
                {inv.payments.length === 0 ? (
                  <div className="mt-2 text-sm text-muted-foreground">No payments yet.</div>
                ) : (
                  <ul className="mt-2 space-y-2 text-sm">
                    {inv.payments.map((p) => {
                      const pRefunds = refundsByPayment.get(p.id) ?? [];
                      const refundedOnP = Number((p as any).amount_refunded ?? 0);
                      const remaining = Math.max(0, Number(p.amount) - refundedOnP);
                      const canRefund = can("payments.refund") && remaining > 0.001 && inv.status !== "cancelled";
                      return (
                        <li key={p.id} className="border-b border-border pb-2 last:border-0 last:pb-0">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-medium capitalize">{p.payment_method}</div>
                              <div className="text-xs text-muted-foreground">
                                {p.paid_at ? format(new Date(p.paid_at), "dd MMM yyyy") : ""}
                                {p.payment_reference ? " · " + p.payment_reference : ""}
                                {refundedOnP > 0 && <> · <span className="text-sk-coral-dark">Refunded {fmtZar(refundedOnP)}</span></>}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="text-sm font-semibold tabular-nums">{fmtZar(p.amount)}</div>
                              {canRefund && (
                                <button
                                  onClick={() => setRefundFor(p)}
                                  title="Record a refund against this payment"
                                  className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[11px] font-medium hover:bg-muted">
                                  <RotateCcw className="h-3 w-3" /> Refund
                                </button>
                              )}
                            </div>
                          </div>
                          {pRefunds.length > 0 && (
                            <ul className="mt-2 space-y-1 pl-3 text-xs">
                              {pRefunds.map((r) => (
                                <li key={r.id} className="flex items-center justify-between">
                                  <div className="text-muted-foreground">
                                    <span className={r.status === "succeeded" ? "text-sk-coral-dark" : ""}>−{fmtZar(r.amount)}</span>
                                    {" · "}{format(new Date(r.refund_date), "dd MMM yyyy")}
                                    {r.reference ? ` · ${r.reference}` : ""}
                                    {r.status !== "succeeded" && (
                                      <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase">{r.status}</span>
                                    )}
                                  </div>
                                  {r.status === "succeeded" && r.provider === "manual" && can("payments.refund.void") && (
                                    <button
                                      onClick={async () => {
                                        if (!(await confirm({ title: "Void refund?", description: `This refund of ${fmtZar(r.amount)} will be voided and the invoice balance restored.`, confirmLabel: "Void refund", tone: "destructive" }))) return;
                                        try { await voidRefund.mutateAsync(r.id); toast.success("Refund voided"); }
                                        catch (e: any) { toast.error(e?.message ?? "Failed"); }
                                      }}
                                      className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-sk-coral-dark">
                                      <Undo2 className="h-3 w-3" /> Void
                                    </button>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
                <div className="mt-3 flex justify-between border-t border-border pt-3 text-sm">
                  <span className="text-muted-foreground">Paid</span>
                  <span className="tabular-nums">{fmtZar(inv.amount_paid)}</span>
                </div>
                {creditsApplied > 0 && (
                  <div className="mt-1 flex justify-between text-sm">
                    <span className="text-muted-foreground">Credits applied</span>
                    <span className="tabular-nums">{fmtZar(creditsApplied)}</span>
                  </div>
                )}
                {totalRefunded > 0 && (
                  <div className="mt-1 flex justify-between text-sm">
                    <span className="text-muted-foreground">Refunded</span>
                    <span className="tabular-nums text-sk-coral-dark">−{fmtZar(totalRefunded)}</span>
                  </div>
                )}
                <div className="mt-1 flex justify-between text-sm">
                  <span className="text-muted-foreground">Balance</span>
                  <span className="tabular-nums font-semibold">{fmtZar(inv.balance_due)}</span>
                </div>
              </div>

              {(cnQ.data?.linked?.length || cnQ.data?.applications?.length) ? (
                <div className="sk-card p-5">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Credit notes</div>
                  <ul className="mt-2 space-y-2 text-sm">
                    {(cnQ.data?.linked ?? []).map((c: any) => (
                      <li key={c.id} className="flex items-center justify-between border-b border-border pb-2 last:border-0 last:pb-0">
                        <div>
                          <Link to={`/admin/credit-notes/${c.id}`} className="font-mono text-xs hover:text-sk-coral-dark">{c.credit_note_number}</Link>
                          <div className="mt-0.5"><CreditNoteStatusChip status={c.status} /></div>
                        </div>
                        <div className="text-right text-xs">
                          <div className="tabular-nums font-semibold">{fmtZar(c.total)}</div>
                          <div className="text-muted-foreground">Bal {fmtZar(c.balance)}</div>
                        </div>
                      </li>
                    ))}
                    {(cnQ.data?.applications ?? []).map((a: any) => (
                      <li key={a.id} className="flex items-center justify-between border-b border-border pb-2 last:border-0 last:pb-0">
                        <div>
                          <Link to={`/admin/credit-notes/${a.credit_note?.id}`} className="font-mono text-xs hover:text-sk-coral-dark">
                            {a.credit_note?.credit_note_number ?? "—"}
                          </Link>
                          <div className="text-xs text-muted-foreground">
                            Applied {format(new Date(a.applied_at), "dd MMM yyyy")}
                          </div>
                        </div>
                        <div className="text-sm font-semibold tabular-nums">−{fmtZar(a.amount)}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="sk-card p-5">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Activity</div>
                {eventsQ.isLoading ? (
                  <div className="mt-2 text-sm text-muted-foreground">Loading…</div>
                ) : (eventsQ.data?.length ?? 0) === 0 ? (
                  <div className="mt-2 text-sm text-muted-foreground">No activity yet.</div>
                ) : (
                  <ul className="mt-3 space-y-3 text-sm">
                    {eventsQ.data!.map((ev) => (
                      <li key={ev.id} className="border-l-2 border-sk-coral/40 pl-3">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="font-medium">{eventLabel(ev)}</span>
                          <span className="text-xs text-muted-foreground">{format(new Date(ev.created_at), "dd MMM yyyy HH:mm")}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {ev.actor_label ?? "System"}
                          {eventDetail(ev) ? ` · ${eventDetail(ev)}` : ""}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {payOpen && inv && tenantId && (
        <RecordPaymentDialog tenantId={tenantId} invoiceId={inv.id} customerId={inv.customer_id}
          suggested={Number(inv.balance_due ?? 0)}
          onClose={() => setPayOpen(false)}
          onDone={() => setPayOpen(false)} />
      )}
      {issueCnOpen && inv && tenantId && (
        <IssueCreditNoteDrawer tenantId={tenantId} invoiceId={inv.id} onClose={() => setIssueCnOpen(false)} />
      )}
      {refundFor && tenantId && (
        <RecordRefundDialog
          tenantId={tenantId}
          payment={{
            id: refundFor.id,
            amount: Number(refundFor.amount),
            amount_refunded: Number((refundFor as any).amount_refunded ?? 0),
            payment_method: String(refundFor.payment_method),
            customer_id: refundFor.customer_id,
            invoice_id: refundFor.invoice_id,
          }}
          onClose={() => setRefundFor(null)}
          onDone={() => setRefundFor(null)}
        />
      )}
      {allocateOpen && inv && tenantId && (
        <AllocateCreditDialog
          tenantId={tenantId}
          customerId={inv.customer_id}
          invoiceId={inv.id}
          invoiceNumber={inv.invoice_number}
          invoiceBalance={Number(inv.balance_due ?? 0)}
          onClose={() => setAllocateOpen(false)}
        />
      )}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm">{children}</div>
    </div>
  );
}

function eventLabel(ev: InvoiceEvent): string {
  switch (ev.event_type) {
    case "created": return "Invoice created";
    case "issued": return "Invoice issued";
    case "voided": return "Invoice voided";
    case "marked_paid": return "Marked as paid";
    case "status_changed": return `Status changed`;
    case "payment_recorded": return "Payment recorded";
    case "payment_removed": return "Payment removed";
    case "sent": return "Emailed to customer";
    case "viewed": return "Viewed by customer";
    case "reminder_sent": return "Reminder sent";
    case "credit_note_issued": return "Credit note issued";
    case "credit_note_applied": return "Credit note applied";
    case "credit_note_reversed": return "Credit note reversed";
    case "credit_note_cancelled": return "Credit note cancelled";
    case "refund_recorded": return "Refund recorded";
    case "refund_voided": return "Refund voided";
    case "refund_failed": return "Refund failed";
    default: return ev.event_type;
  }
}

function eventDetail(ev: InvoiceEvent): string {
  const p = ev.payload ?? {};
  if (ev.event_type === "status_changed") return `${p.from ?? "?"} → ${p.to ?? "?"}`;
  if (ev.event_type === "payment_recorded" || ev.event_type === "payment_removed") {
    const parts: string[] = [];
    if (p.amount != null) parts.push(`R${Number(p.amount).toFixed(2)}`);
    if (p.method) parts.push(String(p.method));
    if (p.reference) parts.push(String(p.reference));
    return parts.join(" · ");
  }
  if (ev.event_type.startsWith("credit_note_")) {
    const parts: string[] = [];
    if (p.credit_note_number) parts.push(String(p.credit_note_number));
    if (p.amount != null) parts.push(`R${Number(p.amount).toFixed(2)}`);
    return parts.join(" · ");
  }
  if (ev.event_type.startsWith("refund_")) {
    const parts: string[] = [];
    if (p.amount != null) parts.push(`R${Number(p.amount).toFixed(2)}`);
    if (p.method) parts.push(String(p.method));
    if (p.provider && p.provider !== "manual") parts.push(String(p.provider));
    if (p.error) parts.push(String(p.error));
    return parts.join(" · ");
  }
  return "";
}

function LineEditor({ draft, setDraft, onCancel, onSave, pending }: {
  draft: { description: string; quantity: number; unit_price: number; vat_rate: number; discount_pct: number; vat_inclusive: boolean };
  setDraft: (d: any) => void; onCancel: () => void; onSave: () => void; pending: boolean;
}) {
  const gross = Number(draft.quantity) * Number(draft.unit_price);
  const disc = gross * (Number(draft.discount_pct) || 0) / 100;
  const net = draft.vat_inclusive
    ? (gross - disc) / (1 + (Number(draft.vat_rate) || 0) / 100)
    : (gross - disc);
  return (
    <>
      <tr className="bg-sk-surface-muted/60">
        <td className="px-5 py-2">
          <input autoFocus value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            className="h-9 w-full rounded border border-border bg-white px-2 text-sm" />
        </td>
        <td className="px-5 py-2">
          <input type="number" min={0} step="0.01" value={draft.quantity}
            onChange={(e) => setDraft({ ...draft, quantity: Number(e.target.value) })}
            className="h-9 w-full rounded border border-border bg-white px-2 text-sm text-right tabular-nums" />
        </td>
        <td className="px-5 py-2">
          <input type="number" min={0} step="0.01" value={draft.unit_price}
            onChange={(e) => setDraft({ ...draft, unit_price: Number(e.target.value) })}
            className="h-9 w-full rounded border border-border bg-white px-2 text-sm text-right tabular-nums" />
        </td>
        <td className="px-5 py-2">
          <input type="number" min={0} max={100} step="0.01" value={draft.discount_pct}
            onChange={(e) => setDraft({ ...draft, discount_pct: Number(e.target.value) })}
            className="h-9 w-full rounded border border-border bg-white px-2 text-sm text-right tabular-nums" />
        </td>
        <td className="px-5 py-2">
          <input type="number" min={0} max={100} step="0.01" value={draft.vat_rate}
            onChange={(e) => setDraft({ ...draft, vat_rate: Number(e.target.value) })}
            className="h-9 w-full rounded border border-border bg-white px-2 text-sm text-right tabular-nums" />
        </td>
        <td className="px-5 py-2 text-right tabular-nums text-sm text-muted-foreground">
          {fmtZar(net)}
        </td>
        <td className="px-5 py-2 text-right">
          <div className="inline-flex gap-1">
            <button onClick={onSave} disabled={pending}
              className="rounded bg-sk-coral px-2 py-1 text-xs font-semibold text-white disabled:opacity-50">Save</button>
            <button onClick={onCancel} className="rounded border border-border px-2 py-1 text-xs">Cancel</button>
          </div>
        </td>
      </tr>
      <tr className="bg-sk-surface-muted/60">
        <td colSpan={7} className="px-5 pb-2 pt-0 text-xs text-muted-foreground">
          <label className="inline-flex items-center gap-1.5">
            <input type="checkbox" checked={draft.vat_inclusive}
              onChange={(e) => setDraft({ ...draft, vat_inclusive: e.target.checked })} />
            Unit price includes VAT
          </label>
        </td>
      </tr>
    </>
  );
}