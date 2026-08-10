import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import {
  Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  useCreateEnrolment, useDaycarePlans, useTenantPetsWithOwnersSearch, usePetWithOwner, useUpdateEnrolment,
  WEEKDAYS, WEEKDAY_LABEL, type DaycareEnrolment, type Weekday,
} from "./queries";
import { prorataQuote } from "./prorata";
import { supabase } from "@/lib/supabase/client";
import { emailIssuedInvoice } from "@/features/invoices/autoEmail";
import { useQuery } from "@tanstack/react-query";

const DAY_INDEX: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

/** Days over capacity in the next 4 weeks on the weekdays this enrolment would attend. */
function useCapacityWarning(tenantId: string, startDate: string, days: Weekday[]) {
  const from = startDate || new Date().toISOString().slice(0, 10);
  const to = new Date(new Date(from).getTime() + 27 * 86_400_000).toISOString().slice(0, 10);
  return useQuery({
    queryKey: ["daycare-capacity-check", tenantId, from, to, days.join(",")],
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
        .filter((r) => Number(r.expected) + 1 > Number(r.capacity))
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
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(t);
  }, [query]);
  const petsQ = useTenantPetsWithOwnersSearch(tenantId, debouncedQuery);
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
      setDays([]); setNotes(""); setActive(true);
      setPausedFrom(""); setPausedTo(""); setNoticeGivenAt(""); setEndReason("");
    }
    setNoticeQuote(null);
    setQuery("");
    setPickerOpen(false);
  }, [editing, open]);

  function toggleDay(d: Weekday) {
    setDays((cur) => cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]);
  }

  const selectedPlan = (plansQ.data ?? []).find((p) => p.id === planId) ?? null;
  const quote = useMemo(
    () => (editing ? null : prorataQuote(startDate, endDate || null, days, Number(selectedPlan?.price ?? 0))),
    [editing, startDate, endDate, days, selectedPlan?.price],
  );
  const showProrata = !!quote?.isPartial && quote.amount > 0;
  const capacityQ = useCapacityWarning(tenantId, startDate, days);
  const fullDays = capacityQ.data ?? [];

  /** Works out the earliest legal end date from the notice period in Policy settings. */
  async function checkNotice() {
    if (!editing) return;
    const { data, error } = await supabase.rpc("daycare_notice_quote" as any, {
      p_enrolment_id: editing.id,
      p_notice_date: noticeGivenAt || new Date().toISOString().slice(0, 10),
    });
    if (error) { toast.error(error.message); return; }
    setNoticeQuote(data);
    const suggested = (data as any)?.earliest_end_date as string | undefined;
    if (suggested) setEndDate(suggested);
  }

  async function save() {
    if (!petId || !startDate || days.length === 0) {
      toast.error("Pet, start date, and at least one weekday are required");
      return;
    }
    const pet =
      (petsQ.data ?? []).find((p: any) => p.id === petId) ??
      selectedPetQ.data;
    if (!pet?.customer_id) { toast.error("Selected pet has no owner"); return; }
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
      } else {
        const created = await create.mutateAsync({
          pet_id: petId,
          customer_id: pet.customer_id,
          daycare_plan_id: planId || null,
          start_date: startDate,
          end_date: endDate || null,
          selected_days: days,
          notes: notes || null,
          active,
          assessment_waived: assessmentWaived,
        } as any);
        if (showProrata) {
          // The DB trigger raises a standalone issued pro-rata invoice — email it.
          const { data: item } = await supabase
            .from("invoice_items")
            .select("invoice_id")
            .eq("source_type", "daycare_enrolment_prorata")
            .eq("source_id", (created as any).id)
            .maybeSingle();
          const invoiceId = (item as any)?.invoice_id as string | undefined;
          if (invoiceId) void emailIssuedInvoice(invoiceId);
          toast.success("Enrolment created · pro-rata invoice issued and emailed", {
            description: `${quote!.daysBilled} of ${quote!.daysTotal} days — R${quote!.amount.toFixed(2)}. Full months follow on the monthly run.`,
          });
        } else {
          toast.success("Enrolment created · billed on the next monthly daycare run", {
            description: "Daycare is invoiced once a month for the coming month.",
          });
        }
        onOpenChange(false);
        return;
      }
      toast.success(editing ? "Enrolment updated" : "Enrolment created");
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
          <Field label="Customer & pet">
            {(() => {
              const pets = (petsQ.data ?? []) as any[];
              const selected =
                pets.find((p) => p.id === petId) ?? (selectedPetQ.data as any) ?? null;
              // Group by customer (server already filtered)
              const groups = new Map<string, { customer: any; pets: any[] }>();
              for (const p of pets) {
                const key = p.customer_id ?? "_none";
                if (!groups.has(key)) groups.set(key, { customer: p.customer ?? null, pets: [] });
                groups.get(key)!.pets.push(p);
              }
              const groupList = Array.from(groups.values()).sort((a, b) => {
                const an = a.customer?.full_name ?? "";
                const bn = b.customer?.full_name ?? "";
                return an.localeCompare(bn);
              });
              return (
                <Popover open={pickerOpen && !editing} onOpenChange={(v) => !editing && setPickerOpen(v)}>
                  <PopoverTrigger asChild>
                    <button type="button" disabled={!!editing}
                      className="flex h-10 w-full items-center justify-between rounded-lg border border-border bg-white px-3 text-left text-sm disabled:opacity-60">
                      <span className={selected ? "" : "text-muted-foreground"}>
                        {selected
                          ? `${selected.name} — ${selected.customer?.full_name ?? "no owner"}${selected.customer?.customer_number ? ` (${selected.customer.customer_number})` : ""}`
                          : "Search customer or pet..."}
                      </span>
                      <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                      <Search className="h-4 w-4 text-muted-foreground" />
                      <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
                        placeholder="Name, SK number, email, pet..."
                        className="h-8 w-full bg-transparent text-sm focus:outline-none" />
                    </div>
                    <div className="max-h-72 overflow-y-auto py-1">
                      {groupList.length === 0 && (
                        <div className="px-3 py-6 text-center text-xs text-muted-foreground">No matching customer or pet</div>
                      )}
                      {groupList.map((g) => (
                        <div key={g.customer?.id ?? "_none"} className="py-1">
                          <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            {g.customer?.full_name ?? "No owner"}
                            {g.customer?.customer_number ? ` — ${g.customer.customer_number}` : ""}
                          </div>
                          {g.pets.map((p) => {
                            const isSel = p.id === petId;
                            return (
                              <button key={p.id} type="button"
                                onClick={() => { setPetId(p.id); setPickerOpen(false); setQuery(""); }}
                                className={"flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-sk-surface-muted " + (isSel ? "bg-sk-coral-soft/40" : "")}>
                                <span>
                                  {p.name}
                                  {p.breed ? <span className="text-muted-foreground"> · {p.breed}</span> : p.species ? <span className="text-muted-foreground"> · {p.species}</span> : null}
                                </span>
                                {isSel && <Check className="h-4 w-4 text-sk-coral" />}
                              </button>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              );
            })()}
          </Field>
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
                  <div key={d.day}>{d.day} — {d.expected + 1} expected vs {d.capacity} spaces</div>
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
                  Notice to leave
                </div>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <Field label="Notice given on">
                    <input type="date" value={noticeGivenAt} onChange={(e) => setNoticeGivenAt(e.target.value)}
                      className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
                  </Field>
                  <Field label="Reason">
                    <input value={endReason} onChange={(e) => setEndReason(e.target.value)}
                      placeholder="e.g. moving away"
                      className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
                  </Field>
                </div>
                <button type="button" onClick={checkNotice}
                  className="mt-1 h-9 rounded-lg border border-border bg-white px-3 text-xs font-medium hover:bg-muted">
                  Work out earliest end date
                </button>
                {noticeQuote && (
                  <div className="mt-2 rounded-lg border border-sk-turquoise/40 bg-sk-turquoise-soft/40 px-3 py-2 text-xs">
                    <span className="font-semibold">
                      Earliest end date: {noticeQuote.earliest_end_date ?? "—"}
                    </span>
                    {noticeQuote.notice_months != null && ` · ${noticeQuote.notice_months} month(s) notice required`}
                    {" — set as the end date; the monthly run bills up to it."}
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
            {editing ? "Save changes" : "Create enrolment"}
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