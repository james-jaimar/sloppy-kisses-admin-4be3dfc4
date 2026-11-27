import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, RefreshCw, Tablet, Tv, Footprints } from "lucide-react";
import { toast } from "sonner";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import { BookingFormModal } from "@/features/bookings/BookingFormModal";
import { useUpdateGroomingStatus } from "./queries";
import { Link } from "react-router-dom";
import { AppHeader } from "@/components/layout/AppHeader";
import { GroomingBoard } from "./GroomingBoard";
import { GroomingDiary } from "./GroomingDiary";
import { GroomingIntakeList } from "./GroomingIntakeList";
import { useGroomingBoardBookings } from "./queries";
import { PawPrint } from "lucide-react";

type View = "diary" | "board" | "list";
const VIEW_KEY = "sk.grooming.view";

function addDays(d: Date, n: number) {
  const c = new Date(d); c.setDate(c.getDate() + n); return c;
}
function startOfDay(d: Date) {
  const c = new Date(d); c.setHours(0, 0, 0, 0); return c;
}
function fmtDay(d: Date) {
  return d.toLocaleDateString("en-ZA", { weekday: "long", day: "2-digit", month: "short", year: "numeric" });
}

export default function GroomingBoardPage() {
  const [day, setDay] = useState<Date>(() => startOfDay(new Date()));
  const [view, setView] = useState<View>(() => (localStorage.getItem(VIEW_KEY) as View) || "diary");
  useEffect(() => { localStorage.setItem(VIEW_KEY, view); }, [view]);
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const [walkInStart, setWalkInStart] = useState<string | null>(null);
  const setStatus = useUpdateGroomingStatus(tenantId ?? "");
  const dayQ = useGroomingBoardBookings({ tenantId, day });
  const petTotal = (dayQ.data ?? []).reduce((s, c) => s + c.pets.length, 0);

  function openWalkIn() {
    const now = new Date();
    now.setSeconds(0, 0);
    now.setMinutes(Math.ceil(now.getMinutes() / 15) * 15);
    setDay(startOfDay(now));
    setWalkInStart(now.toISOString());
  }

  async function walkInSaved(id: string) {
    setWalkInStart(null);
    try {
      await setStatus.mutateAsync({ bookingId: id, status: "checked_in" });
      toast.success("Walk-in booked and checked in");
    } catch (e: any) {
      toast.error(`Booked, but check-in failed: ${e?.message ?? "unknown error"}`);
    }
  }

  return (
    <>
      <div className="print:hidden">
      <AppHeader
        title="Grooming board"
        subtitle={
          view === "diary"
            ? "One lane per station — drag to change station or time. First groomer free takes the next dog."
            : view === "board"
              ? "Drag cards across columns as pets move through the salon."
              : "Today's intake sheet — one colour per owner, numbered in crate order. Print it for the morning."
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={openWalkIn}
              disabled={!tenantId}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-sk-coral px-3 text-sm font-semibold text-primary-foreground hover:bg-sk-coral-dark disabled:opacity-50"
            >
              <Footprints className="h-4 w-4" /> Walk-in
            </button>
            <Link to="/kiosk/grooming" title="Parlour tablet" className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-white hover:bg-sk-surface-muted"><Tablet className="h-4 w-4" /></Link>
            <Link to="/kiosk/grooming/tv" title="Parlour TV" className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-white hover:bg-sk-surface-muted"><Tv className="h-4 w-4" /></Link>
            <div className="inline-flex overflow-hidden rounded-lg border border-border bg-white">
              {(["diary", "board", "list"] as View[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={
                    "h-9 px-3 text-sm font-medium capitalize " +
                    (view === v ? "bg-sk-coral text-white" : "hover:bg-sk-surface-muted")
                  }
                >
                  {v}
                </button>
              ))}
            </div>
            <button
              onClick={() => setDay(startOfDay(new Date()))}
              className="h-9 rounded-lg border border-border bg-white px-3 text-sm font-medium hover:bg-sk-surface-muted"
            >
              Today
            </button>
            <div className="inline-flex overflow-hidden rounded-lg border border-border bg-white">
              <button onClick={() => setDay((d) => addDays(d, -1))} className="grid h-9 w-9 place-items-center hover:bg-sk-surface-muted">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="grid h-9 min-w-[220px] place-items-center border-x border-border px-3 text-sm font-semibold">
                {fmtDay(day)}
              </div>
              <button onClick={() => setDay((d) => addDays(d, 1))} className="grid h-9 w-9 place-items-center hover:bg-sk-surface-muted">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <button
              onClick={() => setDay((d) => new Date(d))}
              title="Refresh"
              className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-white hover:bg-sk-surface-muted"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        }
      />
      </div>
      <div className="flex-1 p-6 print:p-0">
        <div className="mb-4 inline-flex print:hidden items-center gap-3 rounded-2xl bg-primary px-5 py-3 text-primary-foreground shadow-sm">
          <PawPrint className="h-7 w-7" />
          <span className="text-4xl font-black tabular-nums leading-none">{dayQ.isLoading ? "…" : petTotal}</span>
          <span className="text-lg font-bold leading-tight">dog{petTotal === 1 ? "" : "s"} in the parlour<br /><span className="text-sm font-medium opacity-90">{(dayQ.data ?? []).length} appointments</span></span>
        </div>
        {view === "diary" ? <GroomingDiary day={day} /> : view === "board" ? <GroomingBoard day={day} /> : <GroomingIntakeList day={day} />}
        {walkInStart && tenantId && (
          <BookingFormModal
            tenantId={tenantId}
            prefill={{ service_type: "grooming_inhouse", start_at: walkInStart }}
            onClose={() => setWalkInStart(null)}
            onSaved={walkInSaved}
          />
        )}
      </div>
    </>
  );
}