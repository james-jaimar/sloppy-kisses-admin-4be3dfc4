import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  useCreateEnrolment, useDaycarePlans, useTenantPetsWithOwners, useUpdateEnrolment,
  WEEKDAYS, WEEKDAY_LABEL, type DaycareEnrolment, type Weekday,
} from "./queries";

interface Props {
  tenantId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: DaycareEnrolment | null;
}

export function EnrolmentDrawer({ tenantId, open, onOpenChange, editing }: Props) {
  const petsQ = useTenantPetsWithOwners(tenantId);
  const plansQ = useDaycarePlans(tenantId, { activeOnly: true });
  const create = useCreateEnrolment(tenantId);
  const update = useUpdateEnrolment(tenantId);

  const [petId, setPetId] = useState("");
  const [planId, setPlanId] = useState<string>("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [days, setDays] = useState<Weekday[]>([]);
  const [notes, setNotes] = useState("");
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (editing) {
      setPetId(editing.pet_id);
      setPlanId(editing.daycare_plan_id ?? "");
      setStartDate(editing.start_date);
      setEndDate(editing.end_date ?? "");
      setDays((editing.selected_days ?? []) as Weekday[]);
      setNotes(editing.notes ?? "");
      setActive(editing.active);
    } else {
      setPetId(""); setPlanId(""); setStartDate(""); setEndDate("");
      setDays([]); setNotes(""); setActive(true);
    }
  }, [editing, open]);

  function toggleDay(d: Weekday) {
    setDays((cur) => cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]);
  }

  async function save() {
    if (!petId || !startDate || days.length === 0) {
      toast.error("Pet, start date, and at least one weekday are required");
      return;
    }
    const pet = (petsQ.data ?? []).find((p) => p.id === petId);
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
          } as any,
        });
      } else {
        await create.mutateAsync({
          pet_id: petId,
          customer_id: pet.customer_id,
          daycare_plan_id: planId || null,
          start_date: startDate,
          end_date: endDate || null,
          selected_days: days,
          notes: notes || null,
          active,
        });
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
          <Field label="Pet">
            <select disabled={!!editing} value={petId} onChange={(e) => setPetId(e.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm">
              <option value="">Select pet...</option>
              {(petsQ.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.name} - {p.customer?.full_name ?? "no owner"}</option>
              ))}
            </select>
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
          <Field label="Notes">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Active
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