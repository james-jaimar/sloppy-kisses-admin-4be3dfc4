import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Plus, Trash2, Send, Ban, CreditCard, Save, X, Loader2, Download } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import { useInvoice, useIssueInvoice, useVoidInvoice, useUpsertInvoiceItem, useDeleteInvoiceItem, useInvoicingSettings, useUpdateInvoice } from "./queries";
import { InvoiceStatusChip, fmtZar } from "./status";
import { RecordPaymentDialog } from "./RecordPaymentDialog";
import { Can } from "@/components/auth/Can";
import { useCurrentUser } from "@/lib/tenant/TenantContext";

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const navigate = useNavigate();
  const { hasPermission, profile } = useCurrentUser();
  const isPlatform = profile?.user_type === "platform";
  const can = (code: string) => isPlatform || hasPermission(code);
  const canUpdate = can("invoices.update");

  const invQ = useInvoice(id, tenantId);
  const settingsQ = useInvoicingSettings(tenantId);
  const issue = useIssueInvoice(tenantId ?? "");
  const voidInv = useVoidInvoice(tenantId ?? "");
  const upsert = useUpsertInvoiceItem(tenantId ?? "");
  const del = useDeleteInvoiceItem(tenantId ?? "");
  const updateInv = useUpdateInvoice(tenantId ?? "");

  const [payOpen, setPayOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ description: string; quantity: number; unit_price: number }>({ description: "", quantity: 1, unit_price: 0 });
  const [adding, setAdding] = useState(false);
  const [notesEdit, setNotesEdit] = useState<string | null>(null);

  const inv = invQ.data;
  const isDraft = inv?.status === "draft";
  const balance = Number(inv?.balance_due ?? 0);

  async function saveLine(invoice_id: string) {
    if (!draft.description.trim()) { toast.error("Description required"); return; }
    try {
      await upsert.mutateAsync({
        id: editingId ?? undefined,
        invoice_id,
        description: draft.description,
        quantity: Number(draft.quantity),
        unit_price: Number(draft.unit_price),
      });
      setEditingId(null); setAdding(false);
      setDraft({ description: "", quantity: 1, unit_price: 0 });
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
    if (!confirm("Void this invoice? It will be marked as cancelled.")) return;
    try { await voidInv.mutateAsync(inv.id); toast.success("Invoice voided"); }
    catch (err: any) { toast.error(err?.message ?? "Failed"); }
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
            {inv && !isDraft && inv.status !== "cancelled" && balance > 0 && (
              <Can code="payments.create">
                <button onClick={() => setPayOpen(true)}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-sk-green px-4 text-sm font-semibold text-white hover:bg-sk-green/90">
                  <CreditCard className="h-4 w-4" /> Record payment
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
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">{inv.invoice_number}</div>
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
                  {isDraft && canUpdate && !adding && !editingId && (
                    <button onClick={() => { setAdding(true); setDraft({ description: "", quantity: 1, unit_price: 0 }); }}
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
                        <td className="px-5 py-3 text-right tabular-nums font-semibold">{fmtZar(it.line_total)}</td>
                        <td className="px-5 py-3 text-right">
                          {isDraft && canUpdate && (
                            <div className="inline-flex gap-1">
                              <button onClick={() => { setEditingId(it.id); setDraft({ description: it.description, quantity: Number(it.quantity), unit_price: Number(it.unit_price) }); }}
                                className="rounded border border-border px-2 py-0.5 text-xs">Edit</button>
                              <button onClick={async () => {
                                if (!confirm("Remove line?")) return;
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
                      <tr><td colSpan={5} className="px-5 py-10 text-center text-muted-foreground">No lines yet.</td></tr>
                    )}
                  </tbody>
                  <tfoot className="bg-sk-surface-muted">
                    <tr>
                      <td colSpan={3} className="px-5 py-3 text-right text-sm font-semibold">Total</td>
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

              <div className="sk-card p-5">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payments</div>
                {inv.payments.length === 0 ? (
                  <div className="mt-2 text-sm text-muted-foreground">No payments yet.</div>
                ) : (
                  <ul className="mt-2 space-y-2 text-sm">
                    {inv.payments.map((p) => (
                      <li key={p.id} className="flex items-center justify-between border-b border-border pb-2 last:border-0 last:pb-0">
                        <div>
                          <div className="font-medium capitalize">{p.payment_method}</div>
                          <div className="text-xs text-muted-foreground">
                            {p.paid_at ? format(new Date(p.paid_at), "dd MMM yyyy") : ""}
                            {p.payment_reference ? " · " + p.payment_reference : ""}
                          </div>
                        </div>
                        <div className="text-sm font-semibold tabular-nums">{fmtZar(p.amount)}</div>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-3 flex justify-between border-t border-border pt-3 text-sm">
                  <span className="text-muted-foreground">Paid</span>
                  <span className="tabular-nums">{fmtZar(inv.amount_paid)}</span>
                </div>
                <div className="mt-1 flex justify-between text-sm">
                  <span className="text-muted-foreground">Balance</span>
                  <span className="tabular-nums font-semibold">{fmtZar(inv.balance_due)}</span>
                </div>
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

function LineEditor({ draft, setDraft, onCancel, onSave, pending }: {
  draft: { description: string; quantity: number; unit_price: number };
  setDraft: (d: any) => void; onCancel: () => void; onSave: () => void; pending: boolean;
}) {
  return (
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
      <td className="px-5 py-2 text-right tabular-nums text-sm text-muted-foreground">
        {fmtZar(Number(draft.quantity) * Number(draft.unit_price))}
      </td>
      <td className="px-5 py-2 text-right">
        <div className="inline-flex gap-1">
          <button onClick={onSave} disabled={pending}
            className="rounded bg-sk-coral px-2 py-1 text-xs font-semibold text-white disabled:opacity-50">Save</button>
          <button onClick={onCancel} className="rounded border border-border px-2 py-1 text-xs">Cancel</button>
        </div>
      </td>
    </tr>
  );
}