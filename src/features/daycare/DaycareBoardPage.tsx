import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, LayoutGrid, List, Users, UserPlus } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import {
  isoDate,
  useAttendanceForDay,
  useExpectedForDay,
} from "./queries";
import { DaycarePetCard } from "./DaycarePetCard";
import { DaycareListView } from "./DaycareListView";
import { StayPlayLane } from "./StayPlayLane";
import { useDaycareWorkflowSettings } from "./queries";
import { useStayPlayForDay, overdueMinutes } from "./stayPlayQueries";
import { WalkInDialog } from "./WalkInDialog";
import { Can } from "@/components/auth/Can";

function startOfDay(d: Date) { const c = new Date(d); c.setHours(0,0,0,0); return c; }
function addDays(d: Date, n: number) { const c = new Date(d); c.setDate(c.getDate() + n); return c; }
function fmtDay(d: Date) {
  return d.toLocaleDateString("en-ZA", { weekday: "long", day: "2-digit", month: "short", year: "numeric" });
}

export default function DaycareBoardPage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const navigate = useNavigate();
  const [day, setDay] = useState<Date>(() => startOfDay(new Date()));
  const dateIso = isoDate(day);
  const [walkInOpen, setWalkInOpen] = useState(false);

  const expected = useExpectedForDay(tenantId, day);
  const attendanceQ = useAttendanceForDay(tenantId, day);
  const attendance = attendanceQ.data ?? [];
  const settingsQ = useDaycareWorkflowSettings(tenantId);
  const grace = settingsQ.data?.stay_play_grace_minutes ?? 15;
  const capacity = settingsQ.data?.daily_capacity ?? null;
  const stayPlayQ = useStayPlayForDay(tenantId, day);
  const stayPlay = stayPlayQ.data ?? [];
  const stayPlayActive = stayPlay.filter((s) => s.status !== "no_show");
  const overdueCount = stayPlay.filter((s) => overdueMinutes(s, grace) !== null).length;

  // View mode: default to list on tablet-and-under, board on wide screens.
  const [view, setView] = useState<"board" | "list">(() => {
    if (typeof window === "undefined") return "board";
    const stored = window.localStorage.getItem("sk.daycare.view");
    if (stored === "board" || stored === "list") return stored;
    return window.innerWidth < 1280 ? "list" : "board";
  });
  useEffect(() => {
    try { window.localStorage.setItem("sk.daycare.view", view); } catch { /* noop */ }
  }, [view]);

  const attendanceByPet = useMemo(() => {
    const m = new Map<string, typeof attendance[0]>();
    for (const a of attendance) m.set(a.pet_id, a);
    return m;
  }, [attendance]);

  const checkedIn = attendance.filter((a) => a.status === "checked_in");
  const checkedInPetIds = new Set(checkedIn.map((a) => a.pet_id));

  // Expected list excludes those already checked in (they move to right lane)
  const expectedItems = expected.items.filter((it) => !checkedInPetIds.has(it.pet_id));

  const totalExpected = expected.items.length;
  const walkIns = attendance.filter((a) => a.status === "walk_in" || (!expected.items.some((it) => it.pet_id === a.pet_id) && a.status === "checked_in")).length;
  const noShows = attendance.filter((a) => a.status === "not_arrived").length;

  return (
    <>
      <AppHeader
        title="Daycare"
        subtitle="Today's attendance across enrolments and walk-ins."
        tabs={[
          { label: "Board", active: true },
          { label: "Enrolments", onClick: () => navigate("/admin/daycare/enrolments") },
          { label: "Attendance", onClick: () => navigate("/admin/daycare/attendance") },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Can code="daycare.checkin">
              <button
                onClick={() => setWalkInOpen(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-sk-coral px-3 text-sm font-semibold text-white hover:bg-sk-coral-dark"
              >
                <UserPlus className="h-4 w-4" /> <span className="hidden sm:inline">Walk-in</span>
              </button>
            </Can>
            <div className="inline-flex overflow-hidden rounded-lg border border-border bg-white">
              <button
                onClick={() => setView("board")}
                title="Board view"
                className={
                  "inline-flex h-9 items-center gap-1.5 px-3 text-xs font-medium " +
                  (view === "board" ? "bg-sk-coral-soft text-sk-coral-dark" : "hover:bg-sk-surface-muted")
                }
              >
                <LayoutGrid className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Board</span>
              </button>
              <button
                onClick={() => setView("list")}
                title="List view"
                className={
                  "inline-flex h-9 items-center gap-1.5 border-l border-border px-3 text-xs font-medium " +
                  (view === "list" ? "bg-sk-coral-soft text-sk-coral-dark" : "hover:bg-sk-surface-muted")
                }
              >
                <List className="h-3.5 w-3.5" /> <span className="hidden sm:inline">List</span>
              </button>
            </div>
            <button
              onClick={() => setDay(startOfDay(new Date()))}
              title="Today"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-sm font-medium hover:bg-sk-surface-muted"
            >
              <CalendarDays className="h-4 w-4" /> <span className="hidden sm:inline">Today</span>
            </button>
            <div className="inline-flex overflow-hidden rounded-lg border border-border bg-white">
              <button onClick={() => setDay((d) => addDays(d, -1))} className="grid h-9 w-9 place-items-center hover:bg-sk-surface-muted">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="grid h-9 min-w-[160px] md:min-w-[220px] place-items-center border-x border-border px-3 text-xs md:text-sm font-semibold whitespace-nowrap">
                {fmtDay(day)}
              </div>
              <button onClick={() => setDay((d) => addDays(d, 1))} className="grid h-9 w-9 place-items-center hover:bg-sk-surface-muted">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        }
      />
      <div className="flex-1 space-y-6 p-4 sm:p-6">
        {/* Counters */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="Expected" value={totalExpected} tone="text-foreground" />
          <Stat label="Checked in" value={checkedIn.length} tone="text-sk-green" />
          <Stat label="No-shows" value={noShows} tone="text-sk-orange" />
          <Stat label="Walk-ins" value={walkIns} tone="text-sk-coral-dark" />
          <Stat label="Stay &amp; Play" value={stayPlayActive.length} tone={overdueCount > 0 ? "text-destructive" : "text-sk-coral-dark"} />
        </div>

        <div className="text-xs text-muted-foreground">
          {capacity
            ? `${new Set([...expected.items.map((i) => i.pet_id), ...attendance.filter((a) => a.status !== "not_arrived").map((a) => a.pet_id), ...stayPlayActive.map((s) => s.pet_id)]).size} / ${capacity} spaces used (${stayPlayActive.length} Stay & Play)`
            : "No daily capacity set — add one in Settings → Daycare workflow."}
          {overdueCount > 0 && <span className="ml-2 font-semibold text-destructive">{overdueCount} overdue collection{overdueCount === 1 ? "" : "s"}</span>}
        </div>

        {tenantId && <StayPlayLane tenantId={tenantId} day={day} graceMinutes={grace} />}

        {expected.items.length === 0 && attendance.length === 0 && (
          <div className="sk-card grid place-items-center gap-2 p-12 text-center text-sm text-muted-foreground">
            <Users className="h-8 w-8 text-muted-foreground/60" />
            <div>No expected pets for {fmtDay(day)}.</div>
            <Link
              to="/admin/daycare/enrolments"
              className="mt-2 rounded-lg bg-sk-coral px-3 py-1.5 text-xs font-semibold text-white hover:bg-sk-coral-dark"
            >
              Manage enrolments
            </Link>
          </div>
        )}

        {(expected.items.length > 0 || attendance.length > 0) && view === "list" && (
          <DaycareListView
            tenantId={tenantId as string}
            attendanceDate={dateIso}
            expectedItems={expected.items}
            attendance={attendance}
          />
        )}

        {(expected.items.length > 0 || attendance.length > 0) && view === "board" && (
          <div className="grid gap-6 xl:grid-cols-2">
            {/* Expected */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Expected · {expectedItems.length}
                </h2>
              </div>
              {expectedItems.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                  Everyone on the list has arrived or been marked no-show.
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
                  {expectedItems.map((it) => (
                    <DaycarePetCard
                      key={it.key}
                      tenantId={tenantId as string}
                      attendanceDate={dateIso}
                      pet_id={it.pet_id}
                      customer_id={it.customer_id}
                      pet_name={it.pet_name}
                      customer_name={it.customer_name}
                      plan_name={it.plan_name}
                      badge={it.source === "swap-in" ? "Swap-in" : undefined}
                      attendance={attendanceByPet.get(it.pet_id) ?? null}
                      mode="expected"
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Checked in */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-sk-green">
                  Checked in · {checkedIn.length}
                </h2>
              </div>
              {checkedIn.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                  No pets checked in yet.
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
                  {checkedIn.map((a) => (
                    <DaycarePetCard
                      key={a.id}
                      tenantId={tenantId as string}
                      attendanceDate={dateIso}
                      pet_id={a.pet_id}
                      customer_id={a.customer_id}
                      pet_name={a.pet?.name ?? "Unknown"}
                      customer_name={a.customer?.full_name ?? ""}
                      attendance={a}
                      mode="checked_in"
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="sk-card p-5">
      <div className={"text-3xl font-semibold " + tone}>{value}</div>
      <div className="mt-1 sk-stat-label">{label}</div>
    </div>
  );
}