import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import {
  Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  useCreateEnrolment, useDaycarePlans, usePetWithOwner, useUpdateEnrolment,
  WEEKDAYS, WEEKDAY_LABEL, type DaycareEnrolment, type Weekday,
} from "./queries";
import { prorataQuote } from "./prorata";
import { supabase } from "@/lib/supabase/client";
import { emailIssuedInvoice } from "@/features/invoices/autoEmail";
import { useQuery } from "@tanstack/react-query";
import { CustomerCombobox } from "@/components/customers/CustomerCombobox";
import { useCustomerPets } from "@/features/customers/queries";

const DAY_INDEX: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

/** Days over capacity in the next 4 weeks on the weekdays this enrolment would attend. */
function useCapacityWarning(tenantId: string, startDate: string, days: Weekday[], adding: number) {
  const from = startDate || new Date().toISOString().slice(0, 10);
  const to = new Date(new Date(from).getTime() + 27 * 86_400_000).toISOString().slice(0, 10);
  return useQuery({
    queryKey: ["daycare-capacity-check", tenantId, from, to, days.join(","), adding],
    enabled: Boolean(tenantId && days.length),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("daycare_day_availability" as any, {
        p_tenant_id: tenantId,
        p_start: from,
        p_end: to,
      });
      if (error) throw error;
      const wanted = new Set(days.map((d) => DAY_INDEX[String(d).slice(0, 3).toLowerCase()]));
      return ((data ?? []) as any[])
        .filter((r) => r.capacity != null && wanted.has(new Date(r.day + "T00:00:00").getDay()))
        .filter((r) => Number(r.expected) + adding > Number(r.capacity))
        .map((r) => ({ day: r.day as string, expected: Number(r.expected), capacity: Number(r.capacity) }));
    },
  });
}

interface Props {
  tenantId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: DaycareEnrolment | null;
}

export function EnrolmentDrawer({ tenantId, open, onOpenChange, editing }: Props) {
  const plansQ = useDaycarePlans(tenantId, { activeOnly: true });
  const create = useCreateEnrolment(tenantId);
  const update = useUpdateEnrolment(tenantId);

  const [petId, setPetId] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [petIds, setPetIds] = useState<string[]>([]);
  const customerPetsQ = useCustomerPets(editing ? null : customerId, tenantId);
  const selectedPetQ = usePetWithOwner(tenantId, petId || null);
  const [planId, setPlanId] = useState<string>("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [days, setDays] = useState<Weekday[]>([]);
  const [notes, setNotes] = useState("");
  const [active, setActive] = useState(true);
  const [assessmentWaived, setAssessmentWaived] = useState(false);
  const [pausedFrom, setPausedFrom] = useState("");
  const [pausedTo, setPausedTo] = useState("");
  const [noticeGivenAt, setNoticeGivenAt] = useState("");
  const [endReason, setEndReason] = useState("");
  const [noticeQuote, setNoticeQuote] = useState<any>(null);
  const [leaveDate, setLeaveDate] = useState("");
  const [endPreview, setEndPreview] = useState<any>(null);
  const [ending, setEnding] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    if (editing) {
      setPetId(editing.pet_id);
      setPlanId(editing.daycare_plan_id ?? "");
      setStartDate(editing.start_date);
      setEndDate(editing.end_date ?? "");
      setDays((editing.selected_days ?? []) as Weekday[]);
      setNotes(editing.notes ?? "");
      setActive(editing.active);
      setAssessmentWaived(Boolean((editing as any).assessment_waived));
      setPausedFrom((editing as any).paused_from ?? "");
      setPausedTo((editing as any).paused_to ?? "");
      setNoticeGivenAt((editing as any).notice_given_at ?? "");
      setEndReason((editing as any).end_reason ?? "");
    } else {
      setPetId(""); setPlanId(""); setStartDate(""); setEndDate("");
      setDays([]); setNotes(""); setActive(true); setAssessmentWaived(false);
      setPausedFrom(""); setPausedTo(""); setNoticeGivenAt(""); setEndReason("");
    }
    setCustomerId(null);
    setPetIds([]);
    setNoticeQuote(null);
  }, [editing, open]);

  // One dog on the account? Tick it straight away.
  useEffect(() => {
    const list = customerPetsQ.data ?? [];
    if (!editing && customerId && list.length === 1 && petIds.length === 0) setPetIds([list[0].id]);
  }, [customerPetsQ.data, customerId, editing]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleDay(d: Weekday) {
    setDays((cur) => cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]);
  }

  const selectedPlan = (plansQ.data ?? []).find((p) => p.id === planId) ?? null;
  const quote = useMemo(
    () => (editing ? null : prorataQuote(startDate, endDate || null, days, Number(selectedPlan?.price ?? 0))),
    [editing, startDate, endDate, days, selectedPlan?.price],
  );
  const showProrata = !!quote?.isPartial && quote.amount > 0;
  const adding = editing ? 1 : Math.max(1, petIds.length);
  const capacityQ = useCapacityWarning(tenantId, startDate, days, adding);
  const fullDays = capacityQ.data ?? [];

  /** Shows the notice rule from Policy settings (informational; billing follows the actual leaving date). */
  async function checkNotice() {
    if (!editing) return;
    const { data, error } = await supabase.rpc("daycare_notice_quote" as any, {
      p_enrolment_id: editing.id,
      p_notice_date: noticeGivenAt || new Date().toISOString().slice(0, 10),
    });
    if (error) { toast.error(error.message); return; }
    setNoticeQuote(data);
    const suggested = (data as any)?.earliest_end_date as string | undefined;
    if (suggested && !leaveDate) setLeaveDate(suggested);
  }

  async function runEnd(preview: boolean) {
    if (!editing || !leaveDate) return;
    setEnding(true);
    const { data, error } = await supabase.rpc("daycare_end_enrolment" as any, {
      p_enrolment_id: editing.id,
      p_end_date: leaveDate,
      p_notice_date: noticeGivenAt || null,
      p_reason: endReason || null,
      p_preview: preview,
    });
    setEnding(false);
    if (error) { toast.error(error.message); return; }
    if (preview) { setEndPreview(data); return; }
    const d = data as any;
    toast.success(Number(d?.refund_total) > 0
      ? `Daycare ends ${leaveDate}. R${Number(d.refund_total).toFixed(2)} credited back.`
      : `Daycare ends ${leaveDate}.`);
    qc.invalidateQueries();
    onOpenChange(false);
  }

  async function save() {
    const targetPets = editing ? [petId] : petIds;
    if (targetPets.length === 0 || !startDate || days.length === 0) {
      toast.error(editing ? "Start date and at least one weekday are required" : "Pick a customer, at least one dog, a start date and at least one weekday");
      return;
    }
    const ownerId = editing ? editing.customer_id : customerId;
    if (!ownerId) { toast.error("Pick a customer first"); return; }
    try {
      if (editing) {
        await update.mutateAsync({
          id: editing.id,
          patch: {
            daycare_plan_id: planId || null,
            start_date: startDate,
            end_date: endDate || null,
            selected_days: days,
            notes: notes || null,
            active,
            assessment_waived: assessmentWaived,
            paused_from: pausedFrom || null,
            paused_to: pausedTo || null,
            notice_given_at: noticeGivenAt || null,
            end_reason: endReason || null,
          } as any,
        });
        toast.success("Enrolment updated");
        onOpenChange(false);
        return;
      }
      const done: string[] = [];
      const failed: string[] = [];
      let invoicesSent = 0;
      for (const id of targetPets) {
        const name = (customerPetsQ.data ?? []).find((p) => p.id === id)?.name ?? "Dog";
        try {
          const created = await create.mutateAsync({
            pet_id: id,
            customer_id: ownerId,
            daycare_plan_id: planId || null,
            start_date: startDate,
            end_date: endDate || null,
            selected_days: days,
            notes: notes || null,
            active,
            assessment_waived: assessmentWaived,
          } as any);
          done.push(name);
          if (showProrata) {
            // The DB trigger raises a standalone issued pro-rata invoice — email it.
            const { data: item } = await supabase
              .from("invoice_items")
              .select("invoice_id")
              .eq("source_type", "daycare_enrolment_prorata")
              .eq("source_id", (created as any).id)
              .maybeSingle();
            const invoiceId = (item as any)?.invoice_id as string | undefined;
            if (invoiceId) { void emailIssuedInvoice(invoiceId); invoicesSent++; }
          }
        } catch (e: any) {
          failed.push(`${name}: ${e?.message ?? "failed"}`);
        }
      }
      if (done.length) {
        const who = done.join(" & ");
        toast.success(
          done.length > 1 ? `${done.length} enrolments created — ${who}` : `Enrolment created — ${who}`,
          {
            description: showProrata
              ? `Pro-rata ${quote!.daysBilled} of ${quote!.daysTotal} days — R${quote!.amount.toFixed(2)} per dog${invoicesSent ? ", invoice issued and emailed" : ""}. Full months follow on the monthly run.`
              : "Billed on the next monthly daycare run.",
          },
        );
      }
      if (failed.length) {
        toast.error("Some enrolments weren't created", { description: failed.join("\n") });
        return;
      }
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save enrolment");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{editing ? "Edit enrolment" : "New enrolment"}</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          {editing ? (
            <Field label="Customer & pet">
              <div className="flex h-10 w-full items-center rounded-lg border border-border bg-sk-surface-muted px-3 text-sm">
                {selectedPetQ.data
                  ? `${(selectedPetQ.data as any).name} — ${(selectedPetQ.data as any).customer?.full_name ?? "no owner"}${(selectedPetQ.data as any).customer?.customer_number ? ` (${(selectedPetQ.data as any).customer.customer_number})` : ""}`
                  : "Loading…"}
              </div>
            </Field>
          ) : (
            <>
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Customer</div>
                <CustomerCombobox
                  tenantId={tenantId}
                  value={customerId}
                  onChange={(id) => { setCustomerId(id); setPetIds([]); }}
                  placeholder="Owner name, SK number, email or mobile…"
                />
              </div>
              {customerId && (
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Dogs joining daycare
                  </div>
                  {customerPetsQ.isLoading ? (
                    <div className="text-xs text-muted-foreground">Loading dogs…</div>
                  ) : (customerPetsQ.data ?? []).length === 0 ? (
                    <div className="text-xs text-muted-foreground">This customer has no pets on file yet — add one on their customer record first.</div>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-2">
                        {(customerPetsQ.data ?? []).map((p) => {
                          const on = petIds.includes(p.id);
                          return (
                            <button key={p.id} type="button"
                              onClick={() => setPetIds((cur) => on ? cur.filter((x) => x !== p.id) : [...cur, p.id])}
                              className={
                                "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm " +
                                (on ? "border-sk-coral bg-sk-coral-soft text-sk-coral-dark" : "border-border bg-white hover:bg-sk-surface-muted")
                              }>
                              {on && <Check className="h-3.5 w-3.5" />}
                              {p.name}
                              {p.breed ? <span className="text-xs opacity-70">· {p.breed}</span> : null}
                            </button>
                          );
                        })}
                      </div>
                      {(customerPetsQ.data ?? []).length > 1 && (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {petIds.length > 1
                            ? `${petIds.length} enrolments will be created on the same plan and days.`
                            : "Tap every dog that's joining — each gets their own enrolment on the same plan and days."}
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </>
          )}
          <Field label="Plan">
            <select value={planId} onChange={(e) => setPlanId(e.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm">
              <option value="">No plan (drop-in)</option>
              {(plansQ.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start date">
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
            </Field>
            <Field label="End date (optional)">
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
            </Field>
          </div>
          {showProrata && (
            <div className="rounded-lg border border-sk-turquoise/40 bg-sk-turquoise-soft/40 px-3 py-2 text-xs">
              <span className="font-semibold">Pro-rata: {quote!.daysBilled} of {quote!.daysTotal} days — R{quote!.amount.toFixed(2)}</span>
              {" "}invoiced now for the rest of this month. Full months are billed on the monthly run.
            </div>
          )}
          <Field label="Weekdays">
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((d) => {
                const on = days.includes(d);
                return (
                  <button key={d} type="button" onClick={() => toggleDay(d)}
                    className={
                      on
                        ? "h-9 rounded-lg bg-sk-coral px-3 text-xs font-semibold text-white"
                        : "h-9 rounded-lg border border-border bg-white px-3 text-xs font-medium hover:bg-sk-surface-muted"
                    }>
                    {WEEKDAY_LABEL[d]}
                  </button>
                );
              })}
            </div>
          </Field>
          {fullDays.length > 0 && (
            <div className="rounded-lg border border-sk-orange bg-sk-orange-soft px-3 py-2 text-xs text-sk-orange">
              <span className="font-semibold">Over capacity on {fullDays.length} day(s) in the next 4 weeks</span>
              <div className="mt-1 space-y-0.5 opacity-90">
                {fullDays.slice(0, 5).map((d) => (
                  <div key={d.day}>{d.day} — {d.expected + adding} expected vs {d.capacity} spaces</div>
                ))}
                {fullDays.length > 5 && <div>…and {fullDays.length - 5} more</div>}
              </div>
            </div>
          )}
          <Field label="Notes">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" />
          </Field>
          {editing && (
            <>
              <div className="rounded-xl border border-border bg-sk-surface-muted/40 p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Pause (holiday / temporary break)
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  A month fully inside the pause is skipped by the monthly daycare run.
                </p>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <Field label="Paused from">
                    <input type="date" value={pausedFrom} onChange={(e) => setPausedFrom(e.target.value)}
                      className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
                  </Field>
                  <Field label="Paused to">
                    <input type="date" value={pausedTo} onChange={(e) => setPausedTo(e.target.value)}
                      className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
                  </Field>
                </div>
                {(pausedFrom || pausedTo) && (
                  <button type="button" onClick={() => { setPausedFrom(""); setPausedTo(""); }}
                    className="mt-1 text-[11px] font-medium text-sk-coral hover:underline">
                    Clear pause
                  </button>
                )}
              </div>

              <div className="rounded-xl border border-border bg-sk-surface-muted/40 p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Notice to leave / end daycare
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  The final month is billed only up to the leaving date. Days already billed after it are credited back automatically.
                </p>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <Field label="Notice given on">
                    <input type="date" value={noticeGivenAt} onChange={(e) => { setNoticeGivenAt(e.target.value); setEndPreview(null); }}
                      className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
                  </Field>
                  <Field label="Leaving date (last day)">
                    <input type="date" value={leaveDate} onChange={(e) => { setLeaveDate(e.target.value); setEndPreview(null); }}
                      className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
                  </Field>
                </div>
                <div className="mt-2">
                  <Field label="Reason (optional)">
                    <input value={endReason} onChange={(e) => setEndReason(e.target.value)}
                      placeholder="e.g. moving away"
                      className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
                  </Field>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" onClick={checkNotice}
                    className="h-9 rounded-lg border border-border bg-white px-3 text-xs font-medium hover:bg-muted">
                    Show notice period
                  </button>
                  <button type="button" onClick={() => runEnd(true)} disabled={!leaveDate || ending}
                    className="h-9 rounded-lg border border-border bg-white px-3 text-xs font-medium hover:bg-muted disabled:opacity-50">
                    Check refund
                  </button>
                </div>
                {noticeQuote && (
                  <div className="mt-2 rounded-lg border border-sk-turquoise/40 bg-sk-turquoise-soft/40 px-3 py-2 text-xs">
                    Notice rule: {noticeQuote.notice_months ?? 1} month(s) — earliest end by the rule is{" "}
                    <span className="font-semibold">{noticeQuote.earliest_end_date ?? "—"}</span>.
                    {" "}They're only charged up to the leaving date you enter.
                  </div>
                )}
                {endPreview && (
                  <div className="mt-2 space-y-1 rounded-lg border border-border bg-white px-3 py-2 text-xs">
                    {endPreview.lines.length === 0 ? (
                      <div>Nothing billed after this date — no refund needed. Their final month will be part-billed on the monthly run.</div>
                    ) : (
                      <>
                        {endPreview.lines.map((l: any, i: number) => (
                          <div key={i}>
                            {l.invoice_number ?? "Invoice"}: {l.unused_days} of {l.total_days} days unused —{" "}
                            <span className="font-semibold">R{Number(l.amount).toFixed(2)}</span>{" "}
                            {l.action === "reduce_draft" ? "(draft invoice will be reduced)" : "(credit note)"}
                          </div>
                        ))}
                        <div className="font-semibold">Total back: R{Number(endPreview.refund_total).toFixed(2)}</div>
                      </>
                    )}
                    <button type="button" onClick={() => runEnd(false)} disabled={ending}
                      className="mt-1 h-9 rounded-lg bg-sk-coral px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50">
                      End daycare on {leaveDate}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Active
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={assessmentWaived} onChange={(e) => setAssessmentWaived(e.target.checked)} />
            <span>
              Waive the assessment day
              <span className="block text-[11px] text-muted-foreground">
                Only needed when assessments are required in daycare settings and this pet is already known to us.
              </span>
            </span>
          </label>
        </div>
        <SheetFooter className="mt-6">
          <button onClick={() => onOpenChange(false)} className="h-9 rounded-lg border border-border bg-white px-3 text-sm">Cancel</button>
          <button onClick={save} disabled={create.isPending || update.isPending}
            className="h-9 rounded-lg bg-sk-coral px-3 text-sm font-semibold text-white disabled:opacity-50">
            {editing ? "Save changes" : petIds.length > 1 ? `Create ${petIds.length} enrolments` : "Create enrolment"}
          </button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      {children}
    </label>
  );
}