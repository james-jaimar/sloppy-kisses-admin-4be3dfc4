import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { StageBand } from "@/features/hotelForm/StageBand";
import { AUTO_CHECKLIST_CODES, checklistFromReadiness } from "@/features/hotelForm/intakeReadiness";
import type { IntakeStatus } from "@/features/hotelForm/HotelIntakeEditor";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, CircleAlert, FileDown, Mail, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/lib/tenant/TenantContext";
import { useHotelWorkflowSettings } from "./queries";
import { useHotelReview, useHotelReviewAction } from "./reviewQueries";
import { hotelPaymentPercent } from "./paymentRules";
import { downloadQuotePdf } from "@/features/quotes/queries";
import { HotelIntakeEditor } from "@/features/hotelForm/HotelIntakeEditor";
import { HotelPaymentProof } from "./HotelPaymentProof";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { emailIssuedInvoice } from "@/features/invoices/autoEmail";

const money = (n: number) => new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(n);
export function HotelReviewPanel({ bookingId, tenantId, customerId, startDate, pets, portal = false, stay, vaxOverridden = false, checkedIn = false }: {
  bookingId: string; tenantId: string; customerId: string; startDate: string;
  pets: { id: string; name: string | null }[]; portal?: boolean;
  /** Section 1 (stay & logistics), rendered between the progress summary and the intake. */
  stay?: ReactNode; vaxOverridden?: boolean; checkedIn?: boolean;
}) {
  const [status, setStatus] = useState<IntakeStatus | null>(null);
  const { hasPermission } = useCurrentUser();
  const canEdit = !portal && hasPermission("bookings.edit");
  const canOverride = canEdit && hasPermission("settings.hotel.manage");
  const review = useHotelReview(bookingId, portal);
  const settings = useHotelWorkflowSettings(portal ? null : tenantId);
  const action = useHotelReviewAction(bookingId);
  const confirm = useConfirm();
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState("");
  const [collection, setCollection] = useState("");
  const [override, setOverride] = useState(false);
  const [percent, setPercent] = useState(50);
  const [reason, setReason] = useState("");
  const [payment, setPayment] = useState("");
  const [busy, setBusy] = useState(false);
  const r = review.data;
  useEffect(() => {
    if (!r) return;
    setChecks(r.checklist as Record<string, boolean>);
    setMessage(r.customer_message ?? ""); setCollection(r.collection_time?.slice(0, 5) ?? "");
    setOverride(r.payment_percent_override !== null); setPercent(Number(r.payment_percent_override ?? 50)); setReason(r.override_reason ?? "");
  }, [r]);
  const receipts = useQuery({ queryKey: ["hotel_receipts", tenantId, customerId], enabled: canEdit && hasPermission("payments.create"), queryFn: async () => {
    const { data, error } = await supabase.from("payments").select("id, amount, paid_at, payment_reference, payment_method, payment_allocations(id)").eq("tenant_id", tenantId).eq("customer_id", customerId).eq("status", "received").is("invoice_id", null).eq("amount_refunded", 0).gt("amount", 0).order("paid_at", { ascending: false }).limit(100);
    if (error) throw error;
    return (data ?? []).filter(p => !p.payment_allocations.length);
  }});
  const publicSettings = portal ? r?.public_settings : settings.data;
  const paid = Boolean(r?.verified_payment_id || r?.payment_verified);
  const checklist = publicSettings?.approval_checklist ?? [];
  const requiredPct = hotelPaymentPercent(startDate, new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" }), publicSettings?.payment_cutoff_days ?? 30, Number(publicSettings?.advance_deposit_pct ?? 50), r?.payment_percent_override == null ? null : Number(r.payment_percent_override));
  const estimate = r?.estimate;
  const liveChecks = status ? checklistFromReadiness(status.items, checklist.map(c => c.code), checks) : checks;
  async function run(kind: string) {
    try {
      if (kind === "receipt" && !await confirm({ title: "Verify received payment and issue invoice?", description: "Confirm this payment has cleared the bank or till. An uploaded proof alone is not a received payment.", confirmLabel: "Verify and issue" })) return;
      if (kind === "confirm" && !await confirm({ title: "Confirm booking and issue invoice?", description: `This confirms the stay and emails the tax invoice. ${requiredPct}% is payable now${requiredPct < 100 ? "; the balance is due before arrival" : ""}.`, confirmLabel: "Confirm & invoice" })) return;
      if (kind === "approve" || kind === "confirm") await action.mutateAsync({ action: "save", data: { checklist: liveChecks, customer_message: message, collection_time: collection, ...(canOverride ? { override_percent: override ? percent : null, override_reason: reason } : {}) } });
      const data = kind === "save" || kind === "needs_info" ? { checklist: liveChecks, customer_message: message, collection_time: collection, ...(canOverride ? { override_percent: override ? percent : null, override_reason: reason } : {}) } : kind === "receipt" ? { payment_id: payment } : {};
      const result = await action.mutateAsync({ action: kind, data });
      if (kind === "confirm" && typeof result === "string") {
        const sent = await emailIssuedInvoice(result);
        toast.success(sent ? "Booking confirmed — invoice emailed" : "Booking confirmed — invoice issued (email not sent)");
        return;
      }
      toast.success(kind === "receipt" ? "Payment allocated and invoice issued" : kind === "approve" ? "Approved — pro forma ready" : "Hotel review saved");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not update review"); }
  }
  async function document(send = false) {
    if (!estimate) return;
    setBusy(true);
    try {
      if (send) {
        const { data, error } = await supabase.functions.invoke("send-quote-email", { body: { quote_id: estimate.id } });
        if (error || !data?.ok) throw new Error(data?.error ?? error?.message ?? "Email was not sent");
        toast.success("Document emailed");
      } else await downloadQuotePdf(estimate.id, `${estimate.estimate_number}.pdf`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not send document"); } finally { setBusy(false); }
  }
  if (review.isLoading || (!portal && settings.isLoading)) return <div className="p-4 text-sm text-muted-foreground">Loading hotel review…</div>;
  if (review.error) return <div className="p-4 text-sm text-destructive">Could not load hotel review.</div>;
  const items = status?.items ?? [];
  const required = items.filter(i => !i.optional);
  const doneCount = required.filter(i => i.done).length;
  const manualCodes = checklist.filter(c => !AUTO_CHECKLIST_CODES.includes(c.code));
  const ready = Boolean(status) && required.every(i => i.done) && manualCodes.every(c => checks[c.code]) && !status?.dirty;
  const confirmed = Boolean(r?.confirmed_at) || paid;
  const stageIndex = checkedIn ? 3 : confirmed ? 2 : 1;
  const stages = ["Quote accepted", "Gathering info", "Confirmed · invoiced", "Checked in"];
  return <div className="space-y-4">
    <section className="rounded-2xl border-2 border-sk-border bg-sk-surface p-4 sm:p-5" aria-label="Stay progress">
      <ol className="grid gap-2 sm:grid-cols-4">{stages.map((s, i) => <li key={s} className={cn("rounded-lg px-3 py-2 text-sm font-semibold", i < stageIndex ? "bg-sk-green-soft text-sk-green" : i === stageIndex ? "bg-primary text-primary-foreground" : "bg-sk-surface-muted text-muted-foreground")}>{i + 1}. {s}</li>)}</ol>
      {status && <div className="mt-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">{portal ? "What we still need from you" : "What's outstanding"}</h2>
          <span className={cn("rounded-full px-3 py-1 text-sm font-semibold", doneCount === required.length ? "bg-sk-green-soft text-sk-green" : "bg-sk-orange-soft text-sk-orange")}>{doneCount} of {required.length} done</span>
        </div>
        <ul className="grid gap-1.5 sm:grid-cols-2">{items.map(i => <li key={i.code}><a href={`#${i.section}`} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
          {i.done ? <CheckCircle2 className="h-4 w-4 shrink-0 text-sk-green" /> : <CircleAlert className={cn("h-4 w-4 shrink-0", i.optional ? "text-muted-foreground" : "text-sk-orange")} />}
          <span className={i.done ? "text-muted-foreground" : "font-medium"}>{i.label}{i.optional && !i.done ? " (optional)" : ""}</span></a></li>)}</ul>
      </div>}
    </section>
    {stay}
    <HotelIntakeEditor key={bookingId} bookingId={bookingId} tenantId={tenantId} customerId={customerId} pets={pets} portal={portal} vaxOverridden={vaxOverridden} onStatus={setStatus} />
    <StageBand id="stay-approval" step={5} title={portal ? "Confirmation & invoice" : "Confirm booking & invoice"} tone="green" done={confirmed ? true : undefined} status={confirmed ? "Confirmed · invoice issued" : undefined}>
    {portal && message && <p className="whitespace-pre-wrap rounded-lg bg-background p-4 text-sm">{message}</p>}
    {portal && !r?.approved_at && <p className="text-sm text-muted-foreground">Once everything above is complete, our team will confirm your stay and email your invoice.</p>}
    {canEdit && !confirmed && <div className="space-y-3">
      {manualCodes.map(c => <label key={c.code} className="flex items-center gap-3 text-sm"><input type="checkbox" checked={Boolean(checks[c.code])} onChange={e => setChecks(s => ({ ...s, [c.code]: e.target.checked }))} className="h-5 w-5 accent-primary" />{c.label}</label>)}
      <label className="block text-sm">Information needed from customer<textarea value={message} onChange={e => setMessage(e.target.value)} rows={3} className="mt-1 w-full rounded-md border border-input bg-background p-3" /></label>
      <label className="block text-sm">Agreed collection time<input type="time" value={collection} onChange={e => setCollection(e.target.value)} className="ml-3 rounded-md border border-input bg-background p-2" /></label>
      {canOverride && <><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={override} onChange={e => setOverride(e.target.checked)} />Override payment requirement</label>{override && <div className="grid gap-3 sm:grid-cols-[100px_1fr]"><input aria-label="Payment percentage" type="number" min={0} max={100} value={percent} onChange={e => setPercent(Number(e.target.value))} className="rounded-md border border-input bg-background p-2" /><input aria-label="Override reason" placeholder="Override reason" value={reason} onChange={e => setReason(e.target.value)} className="rounded-md border border-input bg-background p-2" /></div>}</>}
      {!r?.approved_at && !ready && <p className="text-sm text-sk-orange">{status?.dirty ? "Save the intake before confirming." : "Finish the outstanding items above to confirm this stay."}</p>}
      <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={action.isPending} onClick={() => run("save")}><Save className="mr-2 h-4 w-4" />Save notes</Button><Button variant="outline" disabled={action.isPending || !message.trim()} onClick={() => run("needs_info")}>Request information</Button><Button variant="outline" disabled={action.isPending} onClick={() => run("estimate")}>Create estimate</Button><Button disabled={action.isPending || !checklist.length || !ready} onClick={() => run("confirm")}><CheckCircle2 className="mr-2 h-4 w-4" />Confirm booking & issue invoice</Button></div>
    </div>}
    {estimate && !confirmed && <div className="space-y-3 border-y border-border py-4"><div className="flex flex-wrap justify-between gap-2"><span className="font-semibold">{r?.approved_at ? "Pro forma" : "Estimate"} {estimate.estimate_number}</span><span className="font-semibold">{money(Number(estimate.total))}</span></div><div className="text-sm">{requiredPct}% payable now · {money(Number(estimate.total) * requiredPct / 100)}</div><p className="text-xs text-muted-foreground">Not a tax invoice. Use the document’s bank details and reference for EFT.</p><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => document()}><FileDown className="mr-2 h-4 w-4" />Download</Button>{canEdit && hasPermission("invoices.send") && <Button variant="outline" disabled={busy} onClick={() => document(true)}><Mail className="mr-2 h-4 w-4" />Email document</Button>}</div></div>}
    {canEdit && r?.approved_at && !confirmed && hasPermission("payments.create") && <div className="space-y-3"><h3 className="font-semibold">Verify received payment</h3><HotelReceiptForm bookingId={bookingId} suggested={Number(estimate?.total ?? 0) * requiredPct / 100} /><select aria-label="Received payment" value={payment} onChange={e => setPayment(e.target.value)} className="w-full rounded-md border border-input bg-background p-3"><option value="">Or select an existing unallocated receipt</option>{receipts.data?.map(p => <option key={p.id} value={p.id}>{p.paid_at?.slice(0, 10)} · {money(Number(p.amount))} · {p.payment_reference ?? p.payment_method}</option>)}</select><Button disabled={!payment || action.isPending} onClick={() => run("receipt")}>Verify existing receipt & issue invoice</Button></div>}
    {confirmed && !portal && <p className="text-sm text-muted-foreground">The tax invoice is issued. Record payments against it under Invoice below — {requiredPct}% is payable now{requiredPct < 100 ? ", the balance before arrival" : ""}.</p>}
    {r?.approved_at && <HotelPaymentProof tenantId={tenantId} customerId={customerId} bookingId={bookingId} portal={portal} />}
    </StageBand>
  </div>;
}

function HotelReceiptForm({ bookingId, suggested }: { bookingId: string; suggested: number }) {
  const action = useHotelReviewAction(bookingId);
  const confirm = useConfirm();
  const [amount, setAmount] = useState(suggested);
  const [reference, setReference] = useState("");
  const [method, setMethod] = useState("eft");
  async function save() {
    if (!await confirm({ title: "Record cleared payment and issue invoice?", description: `${money(amount)} has actually been received. This will issue the hotel invoice and allocate this payment.`, confirmLabel: "Record & issue" })) return;
    try {
      await action.mutateAsync({ action: "record_receipt", data: { amount, reference, method } });
      toast.success("Received payment recorded; invoice issued");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not record receipt"); }
  }
  return <div className="space-y-3"><div className="grid gap-3 sm:grid-cols-3"><input aria-label="Received amount" type="number" step="0.01" min={0.01} value={amount} onChange={e => setAmount(Number(e.target.value))} className="min-w-0 rounded-md border border-input bg-background p-2" /><select aria-label="Payment method" value={method} onChange={e => setMethod(e.target.value)} className="min-w-0 rounded-md border border-input bg-background p-2"><option value="eft">EFT</option><option value="cash">Cash</option><option value="card">Card</option><option value="other">Other</option></select><input aria-label="Payment reference" placeholder="Bank / till reference" value={reference} onChange={e => setReference(e.target.value)} className="min-w-0 rounded-md border border-input bg-background p-2" /></div><Button disabled={action.isPending || amount <= 0 || !reference.trim()} onClick={save}>Record received payment & issue invoice</Button></div>;
}