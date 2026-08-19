import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowDownAZ, ArrowUpAZ, Bell, Check, LayoutGrid, List, ListFilter,
  Loader2, LogIn, LogOut, PawPrint, StickyNote, Undo2,
} from "lucide-react";
import { WorkTopBar } from "./WorkTopBar";
import { useWorkDepts } from "./useWorkDepts";
import { DayNoteSheet } from "./DayNoteSheet";
import { DaycareWorkList, StatusPill, fmtTime, type DaycareRowVM, type DaycareStatus } from "./DaycareWorkList";
import { useDaycareDayNotes, type DaycareDayNote } from "@/features/daycare/dayNotesQueries";
import {
  isoDate, useAttendanceForDay, useExpectedForDay, useUpsertAttendance,
  useDaycareWorkflowSettings,
  type AttendanceRow,
} from "@/features/daycare/queries";
import { StayPlayLane } from "@/features/daycare/StayPlayLane";
import { StayPlayBadge } from "@/features/daycare/StayPlayBadge";
import { useStayPlayForDay, type StayPlaySession } from "@/features/daycare/stayPlayQueries";

type ViewMode = "cards" | "list";
type SortMode = "name_asc" | "name_desc" | "status";
type FilterMode = "all" | "due" | "in" | "out" | "stayplay";

const VIEW_KEY = "sk.work.daycare.view";
const SORT_KEY = "sk.work.daycare.sort";

const STATUS_ORDER: Record<DaycareStatus, number> = { due: 0, no_show: 1, in: 2, out: 3 };

export default function DaycareWorkPage() {
  const { tenantId, canAddDaycareNotes } = useWorkDepts();
  const [day, setDay] = useState(() => new Date());
  const dateIso = isoDate(day);
  const [noteFor, setNoteFor] = useState<{ petId: string; petName: string; customerId: string | null } | null>(null);
  const [savingPetId, setSavingPetId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterMode>("all");

  const [view, setView] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "cards";
    const v = window.localStorage.getItem(VIEW_KEY);
    return v === "list" || v === "cards" ? v : "cards";
  });
  const [sort, setSort] = useState<SortMode>(() => {
    if (typeof window === "undefined") return "name_asc";
    const v = window.localStorage.getItem(SORT_KEY);
    return v === "name_asc" || v === "name_desc" || v === "status" ? v : "name_asc";
  });
  useEffect(() => { try { window.localStorage.setItem(VIEW_KEY, view); } catch { /* noop */ } }, [view]);
  useEffect(() => { try { window.localStorage.setItem(SORT_KEY, sort); } catch { /* noop */ } }, [sort]);

  const expected = useExpectedForDay(tenantId, day);
  const attendanceQ = useAttendanceForDay(tenantId, day);
  const upsert = useUpsertAttendance(tenantId ?? "");
  const settingsQ = useDaycareWorkflowSettings(tenantId);
  const notesQ = useDaycareDayNotes(tenantId, dateIso);
  const stayPlayQ = useStayPlayForDay(tenantId, day);
  const grace = settingsQ.data?.stay_play_grace_minutes ?? 15;

  const notesByPet = useMemo(() => {
    const m = new Map<string, DaycareDayNote[]>();
    for (const n of notesQ.data ?? []) {
      const list = m.get(n.pet_id) ?? [];
      list.push(n);
      m.set(n.pet_id, list);
    }
    return m;
  }, [notesQ.data]);

  const stayPlayByPet = useMemo(() => {
    const m = new Map<string, StayPlaySession[]>();
    for (const s of stayPlayQ.data ?? []) {
      if (s.status === "no_show") continue;
      const list = m.get(s.pet_id) ?? [];
      list.push(s);
      m.set(s.pet_id, list);
    }
    return m;
  }, [stayPlayQ.data]);

  const byPet = useMemo(() => {
    const m = new Map<string, AttendanceRow>();
    for (const r of attendanceQ.data ?? []) m.set(r.pet_id, r);
    return m;
  }, [attendanceQ.data]);

  const allRows: DaycareRowVM[] = useMemo(() => {
    const seen = new Set(expected.items.map((i) => i.pet_id));
    const base = [
      ...expected.items.map((i) => ({
        key: i.key,
        pet_id: i.pet_id,
        customer_id: i.customer_id,
        pet_name: i.pet_name,
        customer_name: i.customer_name,
        plan_name: i.plan_name ?? null,
      })),
      ...(attendanceQ.data ?? [])
        .filter((a) => !seen.has(a.pet_id))
        .map((a) => ({
          key: `walkin:${a.id}`,
          pet_id: a.pet_id,
          customer_id: a.customer_id,
          pet_name: a.pet?.name ?? "Unknown pet",
          customer_name: a.customer?.full_name ?? "",
          plan_name: null as string | null,
        })),
    ];
    return base.map((r) => {
      const att = byPet.get(r.pet_id);
      const status: DaycareStatus =
        att?.status === "checked_out" ? "out"
        : att?.status === "checked_in" || att?.status === "walk_in" ? "in"
        : att?.status === "not_arrived" ? "no_show"
        : "due";
      const notes = notesByPet.get(r.pet_id) ?? [];
      return {
        ...r,
        status,
        checked_in_at: att?.checked_in_at ?? null,
        checked_out_at: att?.checked_out_at ?? null,
        noteCount: notes.length,
        officeFlagCount: notes.filter((n: any) => n.office_flag && !n.handled_at).length,
        stayPlay: stayPlayByPet.get(r.pet_id) ?? [],
      };
    });
  }, [expected.items, attendanceQ.data, byPet, notesByPet, stayPlayByPet]);

  const counts = useMemo(() => ({
    all: allRows.length,
    due: allRows.filter((r) => r.status === "due").length,
    in: allRows.filter((r) => r.status === "in").length,
    out: allRows.filter((r) => r.status === "out").length,
    stayplay: allRows.filter((r) => r.stayPlay.length > 0).length,
  }), [allRows]);

  const rows = useMemo(() => {
    const filtered = allRows.filter((r) => {
      if (filter === "all") return true;
      if (filter === "stayplay") return r.stayPlay.length > 0;
      return r.status === filter;
    });
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (sort === "status") {
        const d = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
        if (d !== 0) return d;
        return a.pet_name.localeCompare(b.pet_name);
      }
      const d = a.pet_name.localeCompare(b.pet_name);
      return sort === "name_desc" ? -d : d;
    });
    return sorted;
  }, [allRows, filter, sort]);

  async function save(row: DaycareRowVM, patch: Partial<AttendanceRow> & { status: AttendanceRow["status"] }, msg: string) {
    if (savingPetId) return;
    const existing = byPet.get(row.pet_id);
    setSavingPetId(row.pet_id);
    try {
      await upsert.mutateAsync({
        id: existing?.id,
        pet_id: row.pet_id,
        customer_id: row.customer_id,
        attendance_date: dateIso,
        notes: existing?.notes ?? null,
        checked_in_at: existing?.checked_in_at ?? null,
        checked_out_at: existing?.checked_out_at ?? null,
        ...patch,
      } as any);
      toast.success(msg);
    } catch (err: any) {
      toast.error(err?.message ?? "Couldn't save");
    } finally {
      setSavingPetId(null);
    }
  }

  function mark(row: DaycareRowVM, status: "checked_in" | "checked_out") {
    const existing = byPet.get(row.pet_id);
    const now = new Date().toISOString();
    if (status === "checked_in") {
      if (row.status === "in") return;
      return save(row, { status, checked_in_at: existing?.checked_in_at ?? now, checked_out_at: null }, "Checked in");
    }
    if (row.status === "out") return;
    return save(row, { status, checked_in_at: existing?.checked_in_at ?? now, checked_out_at: now }, "Checked out");
  }

  function undo(row: DaycareRowVM) {
    return save(row, { status: "checked_in", checked_out_at: null }, "Check-out undone");
  }

  const inCount = counts.in;
  const loading = expected.isLoading || attendanceQ.isLoading;

  return (
    <>
      <WorkTopBar
        title="Daycare"
        subtitle={`${inCount} in · ${allRows.length} due today`}
        day={day}
        onDayChange={setDay}
      />
      <div className="mx-auto max-w-5xl space-y-3 p-4">
        {tenantId && (
          <StayPlayLane
            tenantId={tenantId}
            day={day}
            graceMinutes={grace}
            compact
          />
        )}

        {/* Filter chips */}
        <div className="-mx-1 flex flex-wrap gap-1.5 px-1">
          {([
            ["all", "All"], ["due", "Due"], ["in", "In"], ["out", "Out"], ["stayplay", "Stay & Play"],
          ] as [FilterMode, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-full border px-3 text-sm font-semibold ${
                filter === key ? "border-sk-coral bg-sk-coral-soft text-sk-coral-dark" : "border-border bg-white text-muted-foreground"
              }`}
            >
              {label}
              <span className="rounded-full bg-black/5 px-1.5 text-xs">{counts[key]}</span>
            </button>
          ))}
        </div>

        {/* View + sort */}
        <div className="flex items-center justify-between gap-2">
          <div className="inline-flex overflow-hidden rounded-xl border border-border bg-white">
            <button
              onClick={() => setView("cards")}
              className={`inline-flex min-h-[40px] items-center gap-1.5 px-3 text-sm font-semibold ${view === "cards" ? "bg-sk-coral-soft text-sk-coral-dark" : ""}`}
            >
              <LayoutGrid className="h-4 w-4" /> Cards
            </button>
            <button
              onClick={() => setView("list")}
              className={`inline-flex min-h-[40px] items-center gap-1.5 border-l border-border px-3 text-sm font-semibold ${view === "list" ? "bg-sk-coral-soft text-sk-coral-dark" : ""}`}
            >
              <List className="h-4 w-4" /> List
            </button>
          </div>
          <button
            onClick={() => setSort((s) => (s === "name_asc" ? "name_desc" : s === "name_desc" ? "status" : "name_asc"))}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-border bg-white px-3 text-sm font-semibold"
          >
            {sort === "name_asc" ? <ArrowDownAZ className="h-4 w-4" /> : sort === "name_desc" ? <ArrowUpAZ className="h-4 w-4" /> : <ListFilter className="h-4 w-4" />}
            {sort === "name_asc" ? "A → Z" : sort === "name_desc" ? "Z → A" : "By status"}
          </button>
        </div>

        {loading && (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading…
          </div>
        )}
        {!loading && rows.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center">
            <PawPrint className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-3 text-base font-semibold">
              {allRows.length === 0 ? "No dogs expected" : "Nothing matches this filter"}
            </p>
          </div>
        )}

        {!loading && rows.length > 0 && view === "list" && (
          <DaycareWorkList
            rows={rows}
            graceMinutes={grace}
            savingPetId={savingPetId}
            canAddNotes={canAddDaycareNotes}
            onMark={mark}
            onUndo={undo}
            onNote={(r) => setNoteFor({ petId: r.pet_id, petName: r.pet_name, customerId: r.customer_id })}
          />
        )}

        {!loading && rows.length > 0 && view === "cards" && (
        <div className="grid gap-3 md:grid-cols-2">
        {rows.map((r) => {
          const saving = savingPetId === r.pet_id;
          const notes = notesByPet.get(r.pet_id) ?? [];
          return (
            <div key={r.key} className="rounded-2xl border border-border bg-white p-4">
              <div className="flex items-center gap-3">
                <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-sk-coral-soft text-lg font-bold text-sk-coral-dark">
                  {r.pet_name.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-lg font-bold">{r.pet_name}</span>
                    {r.status === "out" && <Check className="h-5 w-5 shrink-0 text-sk-green" />}
                  </div>
                  <div className="truncate text-sm text-muted-foreground">
                    {r.customer_name}{r.plan_name ? ` · ${r.plan_name}` : ""}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <StatusPill row={r} />
                    <StayPlayBadge sessions={r.stayPlay} graceMinutes={grace} showOrigin size="sm" />
                  </div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  onClick={() => mark(r, "checked_in")}
                  disabled={saving || r.status === "in" || r.status === "out"}
                  className={`flex min-h-[56px] items-center justify-center gap-2 rounded-2xl text-base font-bold disabled:opacity-100 ${
                    r.status === "in"
                      ? "bg-sk-green-soft text-sk-green"
                      : r.status === "out"
                        ? "bg-muted text-muted-foreground opacity-60"
                        : "bg-sk-green text-white"
                  }`}
                >
                  {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : r.status === "in" ? <Check className="h-5 w-5" /> : <LogIn className="h-5 w-5" />}
                  {r.status === "in" ? `In ${fmtTime(r.checked_in_at)}`.trim() : "In"}
                </button>
                {r.status === "out" ? (
                  <button
                    onClick={() => undo(r)}
                    disabled={saving}
                    className="flex min-h-[56px] items-center justify-center gap-2 rounded-2xl border border-border text-base font-bold disabled:opacity-60"
                  >
                    {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Undo2 className="h-5 w-5" />} Undo
                  </button>
                ) : (
                  <button
                    onClick={() => mark(r, "checked_out")}
                    disabled={saving}
                    className="flex min-h-[56px] items-center justify-center gap-2 rounded-2xl bg-sk-turquoise text-base font-bold text-white disabled:opacity-60"
                  >
                    <LogOut className="h-5 w-5" /> Out
                  </button>
                )}
              </div>
              {canAddDaycareNotes && (
                <button
                  onClick={() => setNoteFor({ petId: r.pet_id, petName: r.pet_name, customerId: r.customer_id })}
                  className="mt-2 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl border border-border text-base font-semibold active:bg-muted"
                >
                  <StickyNote className="h-5 w-5" /> Add note
                </button>
              )}
              {notes.length > 0 && (
                <ul className="mt-2 space-y-1.5">
                  {notes.map((n: any) => (
                    <li
                      key={n.id}
                      className={`rounded-xl border p-2.5 text-sm ${
                        n.office_flag && !n.handled_at
                          ? "border-sk-orange bg-sk-orange-soft"
                          : "border-border bg-muted/40"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        {n.office_flag && <Bell className="h-3 w-3" />}
                        <span>{n.author?.full_name ?? n.author?.email ?? "Staff"}</span>
                        <span>·</span>
                        <span>{new Date(n.created_at).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}</span>
                        {n.handled_at && <span>· handled</span>}
                      </div>
                      <div className="whitespace-pre-wrap">{n.body}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
        </div>
        )}
      </div>
      {noteFor && tenantId && (
        <DayNoteSheet
          tenantId={tenantId}
          petId={noteFor.petId}
          petName={noteFor.petName}
          customerId={noteFor.customerId}
          dateIso={dateIso}
          onClose={() => setNoteFor(null)}
        />
      )}
    </>
  );
}
