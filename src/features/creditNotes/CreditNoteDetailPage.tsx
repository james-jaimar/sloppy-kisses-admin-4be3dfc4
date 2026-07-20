import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Send, Ban, Plus, Trash2, Download, Save, X, CreditCard, RotateCcw } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant, useCurrentUser } from "@/lib/tenant/TenantContext";
import { Can } from "@/components/auth/Can";
import {
  useCreditNote, useIssueCreditNote, useVoidCreditNote,
  useUpsertCreditNoteItem, useDeleteCreditNoteItem, useReverseCreditNoteApplication,
} from "./queries";
import { CreditNoteStatusChip, fmtZar } from "./status";
import { ApplyCreditDialog } from "./ApplyCreditDialog";

export default function CreditNoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const navigate = useNavigate();
  const { hasPermission, profile } = useCurrentUser();
  const isPlatform = profile?.user_type === "platform";
  const can = (code: string) => isPlatform || hasPermission(code);

  const cnQ = useCreditNote(id, tenantId);
  const upsert = useUpsertCreditNoteItem(tenantId ?? "");
  const del = useDeleteCreditNoteItem(tenantId ?? "");
  const issue = useIssueCreditNote(tenantId ?? "");
  const voidCn = useVoidCreditNote(tenantId ?? "");
  const reverse = useReverseCreditNoteApplication(tenantId ?? "");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ description: "", quantity: 1, unit_price: 0 });
  const [applyOpen, setApplyOpen] = useState(false);

  const cn = cnQ.data;
  const isDraft = cn?.status === "draft";
  const canApply = cn && (cn.status === "issued") && Number(cn.balance) > 0;

  async function saveLine() {
    if (!cn) return;
    if (!draft.description.trim()) { toast.error("Description required"); return; }
    try {
      await upsert.mutateAsync({
        id: editingId ?? undefined,
        credit_note_id: cn.id,
        description: draft.description,
        quantity: Number(draft.quantity),
        unit_price: Number(draft.unit_price),
      });
      setEditingId(null); setAdding(false);
      setDraft({ description: "", quantity: 1, unit_price: 0 });
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  }

  async function doIssue() {
    if (!cn) return;
    if (cn.items.length === 0) { toast.error("Add at least one line first"); return; }
    if (!(await confirm({ title: `Issue credit note ${cn.credit_note_number}?`, description: "Once issued, line items are locked.", confirmLabel: "Issue" }))) return;
    try { await issue.mutateAsync(cn.id); toast.success("Credit note issued"); }
    catch (e: any) { toast.error(e?.message ?? "Failed"); }
  }

  async function doVoid() {
    if (!cn) return;
    if (cn.applications.length > 0) { toast.error("Reverse all applications before voiding"); return; }
    if (!(await confirm({ title: "Void this credit note?", confirmLabel: "Void", tone: "destructive" }))) return;
    try { await voidCn.mutateAsync(cn.id); toast.success("Credit note voided"); }
    catch (e: any) { toast.error(e?.message ?? "Failed"); }
  }

  return (
    <>
      <AppHeader
        title={cn ? `Credit note ${cn.credit_note_number}` : "Credit note"}
        subtitle={cn?.customer?.full_name ?? "Loading…"}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => navigate("/admin/credit-notes")}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-white px-3 text-sm font-medium hover:bg-muted">
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            {cn && isDraft && (
              <Can code="credit_notes.issue">
                <button onClick={doIssue} disabled={issue.isPending}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-sk-coral px-4 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-50">
                  <Send className="h-4 w-4" /> Issue
                </button>
              </Can>
            )}
            {cn && canApply && (
              <Can code="credit_notes.apply">
                <button onClick={() => setApplyOpen(true)}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-sk-green px-4 text-sm font-semibold text-white hover:bg-sk-green/90">
                  <CreditCard className="h-4 w-4" /> Apply to invoice
                </button>
              </Can>
            )}
            {cn && cn.status !== "cancelled" && (
              <Can code="credit_notes.void">
                <button onClick={doVoid}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-white px-3 text-sm font-medium hover:bg-muted">
                  <Ban className="h-4 w-4" /> Void
                </button>
              </Can>
            )}
            <button onClick={async () => {
              if (!cn) return;
              try {
                const { downloadCreditNotePdf } = await import("./pdf");
                await downloadCreditNotePdf(cn.id, `${cn.credit_note_number}.pdf`);
              } catch (e: any) { toast.error(e?.message ?? "PDF failed"); }
            }} className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-white px-3 text-sm font-medium hover:bg-muted">
              <Download className="h-4 w-4" /> PDF
            </button>
          </div>
        }
      />
      <div className="flex-1 p-6">
        {cnQ.isLoading ? (
          <div className="flex items-center gap-2 py-20 justify-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : !cn ? (
          <div className="sk-card p-6 text-sm text-muted-foreground">Credit note not found.</div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
            <div className="space-y-6">
              <div className="sk-card p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">{cn.credit_note_number}</div>
                    <div className="mt-1"><CreditNoteStatusChip status={cn.status} /></div>
                    {cn.invoice && (
                      <div className="mt-2 text-xs text-muted-foreground">
                        Against invoice{" "}
                        <Link to={`/admin/invoices/${cn.invoice.id}`} className="font-mono text-sk-coral-dark hover:underline">
                          {cn.invoice.invoice_number}
                        </Link>
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Available credit</div>
                    <div className="text-2xl font-semibold tabular-nums">{fmtZar(cn.balance)}</div>
                  </div>
                </div>
                <div className="mt-5 grid gap-4 sm:grid-cols-3">
                  <Field label="Issued">{cn.issue_date ? format(new Date(cn.issue_date), "dd MMM yyyy") : "—"}</Field>
                  <Field label="Total">{fmtZar(cn.total)}</Field>
                  <Field label="Applied">{fmtZar(cn.amount_applied)}</Field>
                </div>
                {cn.reason && (
                  <div className="mt-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reason</div>
                    <div className="mt-1 text-sm">{cn.reason}</div>
                  </div>
                )}
              </div>

              <div className="sk-card overflow-hidden">
                <div className="flex items-center justify-between border-b border-border px-5 py-3">
                  <div className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Line items</div>
                  {isDraft && can("credit_notes.create") && !adding && !editingId && (
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
                      <th className="px-5 py-2 w-24" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {cn.items.map((it) => editingId === it.id ? (
                      <LineEditor key={it.id} draft={draft} setDraft={setDraft}
                        onCancel={() => setEditingId(null)} onSave={saveLine} pending={upsert.isPending} />
                    ) : (
                      <tr key={it.id}>
                        <td className="px-5 py-3">{it.description}</td>
                        <td className="px-5 py-3 text-right tabular-nums">{Number(it.quantity)}</td>
                        <td className="px-5 py-3 text-right tabular-nums">{fmtZar(it.unit_price)}</td>
                        <td className="px-5 py-3 text-right tabular-nums font-semibold">{fmtZar(it.line_total)}</td>
                        <td className="px-5 py-3 text-right">
                          {isDraft && can("credit_notes.create") && (
                            <div className="inline-flex gap-1">
                              <button onClick={() => { setEditingId(it.id); setDraft({ description: it.description, quantity: Number(it.quantity), unit_price: Number(it.unit_price) }); }}
                                className="rounded border border-border px-2 py-0.5 text-xs">Edit</button>
                              <button onClick={async () => {
                                if (!(await confirm({ title: "Remove line?", confirmLabel: "Remove", tone: "destructive" }))) return;
                                await del.mutateAsync({ id: it.id, credit_note_id: cn.id });
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
                        onCancel={() => setAdding(false)} onSave={saveLine} pending={upsert.isPending} />
                    )}
                    {cn.items.length === 0 && !adding && (
                      <tr><td colSpan={5} className="px-5 py-10 text-center text-muted-foreground">No lines yet.</td></tr>
                    )}
                  </tbody>
                  <tfoot className="bg-sk-surface-muted">
                    <tr>
                      <td colSpan={3} className="px-5 py-3 text-right text-sm font-semibold">Total</td>
                      <td className="px-5 py-3 text-right text-sm font-semibold tabular-nums">{fmtZar(cn.total)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>

              {cn.notes && (
                <div className="sk-card p-5">
                  <div className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Notes</div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{cn.notes}</p>
                </div>
              )}
            </div>

            <div className="space-y-6">
              <div className="sk-card p-5">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Customer</div>
                {cn.customer ? (
                  <div className="mt-2 text-sm">
                    <Link to={`/admin/customers/${cn.customer.id}`} className="font-medium hover:text-sk-coral-dark">
                      {cn.customer.full_name ?? "Unnamed"}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {cn.customer.customer_number} · {cn.customer.mobile ?? cn.customer.email ?? "—"}
                    </div>
                  </div>
                ) : <div className="mt-1 text-sm text-muted-foreground">—</div>}
              </div>

              <div className="sk-card p-5">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Applications</div>
                {cn.applications.length === 0 ? (
                  <div className="mt-2 text-sm text-muted-foreground">Not yet applied to any invoice.</div>
                ) : (
                  <ul className="mt-2 space-y-2 text-sm">
                    {cn.applications.map((a) => (
                      <li key={a.id} className="flex items-center justify-between gap-2 border-b border-border pb-2 last:border-0 last:pb-0">
                        <div className="min-w-0">
                          <div className="font-mono text-xs">
                            {a.invoice ? (
                              <Link to={`/admin/invoices/${a.invoice.id}`} className="hover:text-sk-coral-dark">
                                {a.invoice.invoice_number}
                              </Link>
                            ) : "—"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {format(new Date(a.applied_at), "dd MMM yyyy HH:mm")}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold tabular-nums">{fmtZar(a.amount)}</span>
                          {can("credit_notes.apply") && (
                            <button title="Reverse application"
                              onClick={async () => {
                                if (!(await confirm({ title: "Reverse application?", description: "The invoice balance will be restored.", confirmLabel: "Reverse", tone: "destructive" }))) return;
                                try {
                                  await reverse.mutateAsync({ id: a.id, credit_note_id: cn.id, invoice_id: a.invoice_id });
                                  toast.success("Application reversed");
                                } catch (e: any) { toast.error(e?.message ?? "Failed"); }
                              }}
                              className="rounded border border-border p-1 text-muted-foreground hover:bg-muted">
                              <RotateCcw className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-3 flex justify-between border-t border-border pt-3 text-sm">
                  <span className="text-muted-foreground">Applied</span>
                  <span className="tabular-nums">{fmtZar(cn.amount_applied)}</span>
                </div>
                <div className="mt-1 flex justify-between text-sm">
                  <span className="text-muted-foreground">Available</span>
                  <span className="tabular-nums font-semibold">{fmtZar(cn.balance)}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {applyOpen && cn && tenantId && (
        <ApplyCreditDialog tenantId={tenantId} cn={cn} onClose={() => setApplyOpen(false)} />
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
            className="rounded bg-sk-coral px-2 py-1 text-xs font-semibold text-white disabled:opacity-50">
            <Save className="h-3 w-3 inline" /> Save
          </button>
          <button onClick={onCancel} className="rounded border border-border px-2 py-1 text-xs">
            <X className="h-3 w-3" />
          </button>
        </div>
      </td>
    </tr>
  );
}