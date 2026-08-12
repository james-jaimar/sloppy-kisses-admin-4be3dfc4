/**
 * In-house grooming day diary — one lane per groomer.
 *
 * Staff drag an appointment between lanes to change groomer and up/down to change
 * the time (15-minute snap). Clashes on the target groomer are refused; drops
 * outside that groomer's working hours ask for confirmation first.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, EyeOff, Eye, Link2 } from "lucide-react";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import { useGroomers, type ResourceRow } from "@/features/settings/resourceQueries";
import { useGroomingPackages } from "@/features/settings/groomingRateCardQueries";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { BookingStatusChip } from "@/features/bookings/statusMeta";
import { PaymentChip, PaymentFlagsProvider } from "@/features/shared/payments/paymentFlags";
import { useGroomingBoardBookings, useRescheduleGrooming, type GroomingBoardCard } from "./queries";
import { useGroomingPrefsStates } from "./instructions/prefsQueries";
import { GroomingPrefsChip } from "./instructions/GroomingPrefsChip";
import { BookingGroomingPrefsDialog } from "./instructions/BookingGroomingPrefsDialog";

const PX_PER_MIN = 1.15;
const SNAP = 15;
const FALLBACK_COLOUR = "#F97362";
const HIDDEN_KEY = "sk.grooming.diary.hiddenGroomers";

function hhmmToMinutes(v: string | null | undefined, fallback: number) {
  if (!v) return fallback;
  const [h, m] = v.split(":").map(Number);
  if (Number.isNaN(h)) return fallback;
  return h * 60 + (m || 0);
}
function minutesToLabel(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function minutesOfDay(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}
function cardMinutes(card: GroomingBoardCard, packageMinutes: Map<string, number>) {
  const detail = card.details?.duration_minutes;
  if (detail) return Number(detail);
  if (card.start_at && card.end_at) {
    const mins = Math.round((new Date(card.end_at).getTime() - new Date(card.start_at).getTime()) / 60000);
    if (mins > 0) return mins;
  }
  const pkg = card.details?.package_id ? packageMinutes.get(card.details.package_id) : null;
  return pkg ?? 60;
}

interface DragPayload { id: string; grabOffsetMin: number }

export function GroomingDiary({ day }: { day: Date }) {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const confirm = useConfirm();

  const bookingsQ = useGroomingBoardBookings({ tenantId, day });
  const groomersQ = useGroomers(tenantId, { activeOnly: true });
  const packagesQ = useGroomingPackages(tenantId, { activeOnly: true });
  const reschedule = useRescheduleGrooming(tenantId ?? "");

  const dragRef = useRef<DragPayload | null>(null);
  const [hidden, setHidden] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? "[]"); } catch { return []; }
  });
  useEffect(() => { localStorage.setItem(HIDDEN_KEY, JSON.stringify(hidden)); }, [hidden]);

  const packageMinutes = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of packagesQ.data ?? []) m.set(p.id, Number(p.expected_minutes) || 60);
    return m;
  }, [packagesQ.data]);
  const packageNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of packagesQ.data ?? []) m.set(p.id, p.name);
    return m;
  }, [packagesQ.data]);

  const groomers = (groomersQ.data ?? []) as ResourceRow[];
  const visibleGroomers = groomers.filter((g) => !hidden.includes(g.id));

  const cards = bookingsQ.data ?? [];
  const unassigned = cards.filter((c) => !c.resource_id);
  const prefs = useGroomingPrefsStates(
    useMemo(() => cards.map((c) => ({ id: c.id, petIds: c.pets.map((p) => p.id) })), [cards]),
  );
  const [prefsCard, setPrefsCard] = useState<GroomingBoardCard | null>(null);
  const [onlyMissingPrefs, setOnlyMissingPrefs] = useState(false);
  const isMissing = (c: GroomingBoardCard) =>
    !prefs.isLoading && prefs.forBooking(c.id, c.pets.map((p) => p.id)) === "missing";

  const openMin = groomers.length
    ? Math.min(...groomers.map((g) => hhmmToMinutes(g.workday_start, 8 * 60)))
    : 8 * 60;
  const closeMin = groomers.length
    ? Math.max(...groomers.map((g) => hhmmToMinutes(g.workday_end, 17 * 60)))
    : 17 * 60;
  const spanMin = Math.max(60, closeMin - openMin);
  const gridHeight = spanMin * PX_PER_MIN;

  const hourMarks = useMemo(() => {
    const out: number[] = [];
    for (let m = Math.ceil(openMin / 60) * 60; m <= closeMin; m += 60) out.push(m);
    return out;
  }, [openMin, closeMin]);

  function cardsFor(resourceId: string) {
    return cards.filter(
      (c) => c.resource_id === resourceId && (!onlyMissingPrefs || isMissing(c)),
    );
  }

  async function handleDrop(groomer: ResourceRow, clientY: number, laneTop: number) {
    const payload = dragRef.current;
    dragRef.current = null;
    if (!payload) return;
    const card = cards.find((c) => c.id === payload.id);
    if (!card) return;

    const duration = cardMinutes(card, packageMinutes);
    const rawMin = (clientY - laneTop) / PX_PER_MIN + openMin - payload.grabOffsetMin;
    let startMin = Math.round(rawMin / SNAP) * SNAP;
    startMin = Math.max(openMin, Math.min(startMin, closeMin - SNAP));

    const gStart = hhmmToMinutes(groomer.workday_start, 8 * 60);
    const gEnd = hhmmToMinutes(groomer.workday_end, 17 * 60);

    // Clash check on the target groomer.
    const clash = cardsFor(groomer.id)
      .filter((c) => c.id !== card.id)
      .find((c) => {
        const s = minutesOfDay(c.start_at);
        if (s == null) return false;
        const e = s + cardMinutes(c, packageMinutes);
        return s < startMin + duration && e > startMin;
      });
    if (clash) {
      toast.error(
        `${groomer.name} is busy then — ${clash.pets[0]?.name ?? clash.booking_number} at ${minutesToLabel(minutesOfDay(clash.start_at) ?? 0)}`,
      );
      return;
    }

    if (startMin < gStart || startMin + duration > gEnd) {
      const ok = await confirm({
        title: "Outside working hours",
        description: `${groomer.name} works ${minutesToLabel(gStart)}–${minutesToLabel(gEnd)}. Book ${minutesToLabel(startMin)}–${minutesToLabel(startMin + duration)} anyway?`,
        confirmLabel: "Book anyway",
      });
      if (!ok) return;
    }

    const start = new Date(day);
    start.setHours(0, 0, 0, 0);
    start.setMinutes(startMin);
    const end = new Date(start.getTime() + duration * 60000);

    try {
      await reschedule.mutateAsync({ bookingId: card.id, resourceId: groomer.id, start, end });
      toast.success(`${card.pets[0]?.name ?? card.booking_number} → ${groomer.name} at ${minutesToLabel(startMin)}`);
    } catch (err: any) {
      toast.error(err?.message ?? "Could not move that appointment");
    }
  }

  async function handleUnassign() {
    const payload = dragRef.current;
    dragRef.current = null;
    if (!payload) return;
    const card = cards.find((c) => c.id === payload.id);
    if (!card || !card.resource_id || !card.start_at) return;
    const duration = cardMinutes(card, packageMinutes);
    const start = new Date(card.start_at);
    try {
      await reschedule.mutateAsync({
        bookingId: card.id,
        resourceId: null,
        start,
        end: new Date(start.getTime() + duration * 60000),
      });
      toast.success("Moved back to unassigned");
    } catch (err: any) {
      toast.error(err?.message ?? "Could not unassign");
    }
  }

  if (groomersQ.isLoading || bookingsQ.isLoading) {
    return <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">Loading diary…</div>;
  }
  if (groomers.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
        No groomers set up yet — add them under Settings → Groomers.
      </div>
    );
  }

  return (
    <PaymentFlagsProvider bookingIds={cards.map((c) => c.id)}>
      <div className="space-y-4">
        {prefsCard && tenantId && (
          <BookingGroomingPrefsDialog
            open
            tenantId={tenantId}
            bookingId={prefsCard.id}
            petId={prefsCard.pets[0]?.id ?? null}
            petName={prefsCard.pets[0]?.name}
            customerId={prefsCard.customer?.id ?? null}
            onClose={() => setPrefsCard(null)}
          />
        )}

        {/* Preferences outstanding worklist */}
        {!prefs.isLoading && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-white px-3 py-2 text-xs">
            {prefs.missingCount === 0 ? (
              <span className="text-muted-foreground">
                Every groom today has grooming preferences.
              </span>
            ) : (
              <>
                <span className="inline-flex items-center gap-1 font-semibold text-sk-orange">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {prefs.missingCount} groom{prefs.missingCount === 1 ? "" : "s"} without preferences
                </span>
                <button
                  type="button"
                  onClick={() => setOnlyMissingPrefs((v) => !v)}
                  className={
                    "rounded-full border px-3 py-1 font-medium " +
                    (onlyMissingPrefs ? "border-sk-coral bg-sk-coral text-white" : "border-border bg-white hover:bg-muted")
                  }
                >
                  {onlyMissingPrefs ? "Showing only these" : "Show only these"}
                </button>
              </>
            )}
          </div>
        )}

        {/* Hidden-groomer chips */}
        <div className="flex flex-wrap items-center gap-2">
          {groomers.map((g) => {
            const isHidden = hidden.includes(g.id);
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => setHidden((prev) => (isHidden ? prev.filter((id) => id !== g.id) : [...prev, g.id]))}
                className={
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors " +
                  (isHidden ? "border-border bg-muted text-muted-foreground" : "border-border bg-white")
                }
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: g.colour ?? FALLBACK_COLOUR }} />
                {g.name}
                {isHidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              </button>
            );
          })}
        </div>

        <div className="overflow-x-auto rounded-2xl border border-border bg-white p-3">
          <div className="flex min-w-[720px] gap-2">
            {/* Time gutter */}
            <div className="w-14 shrink-0 pt-9">
              <div className="relative" style={{ height: gridHeight }}>
                {hourMarks.map((m) => (
                  <div
                    key={m}
                    className="absolute -translate-y-1/2 text-[11px] text-muted-foreground"
                    style={{ top: (m - openMin) * PX_PER_MIN }}
                  >
                    {minutesToLabel(m)}
                  </div>
                ))}
              </div>
            </div>

            {visibleGroomers.map((g) => {
              const laneCards = cardsFor(g.id);
              const bookedMin = laneCards.reduce((s, c) => s + cardMinutes(c, packageMinutes), 0);
              const availableMin = Math.max(
                60,
                hhmmToMinutes(g.workday_end, 17 * 60) - hhmmToMinutes(g.workday_start, 8 * 60),
              );
              const load = Math.min(100, Math.round((bookedMin / availableMin) * 100));
              const colour = g.colour ?? FALLBACK_COLOUR;
              return (
                <div key={g.id} className="min-w-[150px] flex-1">
                  <div className="mb-1 px-1">
                    <div className="flex items-center gap-1.5 text-sm font-semibold">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colour }} />
                      <span className="truncate">{g.name}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {laneCards.length} dog{laneCards.length === 1 ? "" : "s"} · {bookedMin}/{availableMin} min
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full" style={{ width: `${load}%`, backgroundColor: colour }} />
                    </div>
                  </div>

                  <div
                    className="relative rounded-lg border border-border bg-sk-surface-muted/50"
                    style={{ height: gridHeight }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      void handleDrop(g, e.clientY, rect.top);
                    }}
                  >
                    {hourMarks.map((m) => (
                      <div
                        key={m}
                        className="pointer-events-none absolute inset-x-0 border-t border-border/70"
                        style={{ top: (m - openMin) * PX_PER_MIN }}
                      />
                    ))}

                    {laneCards.map((c) => {
                      const startMin = minutesOfDay(c.start_at);
                      if (startMin == null) return null;
                      const dur = cardMinutes(c, packageMinutes);
                      const pkgName = c.details?.package_id ? packageNames.get(c.details.package_id) : null;
                      return (
                        <Link
                          key={c.id}
                          to={`/admin/bookings/${c.id}`}
                          state={{ from: "/admin/grooming" }}
                          draggable
                          onDragStart={(e) => {
                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                            dragRef.current = { id: c.id, grabOffsetMin: (e.clientY - rect.top) / PX_PER_MIN };
                            e.dataTransfer.setData("text/plain", c.id);
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          className="absolute inset-x-1 cursor-grab overflow-hidden rounded-lg border bg-white p-1.5 text-[11px] shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing"
                          style={{
                            top: (startMin - openMin) * PX_PER_MIN,
                            height: Math.max(28, dur * PX_PER_MIN - 2),
                            borderColor: colour,
                            borderLeftWidth: 4,
                          }}
                        >
                          <div className="flex items-center gap-1 font-semibold">
                            <span className="truncate">{c.pets[0]?.name ?? "Pet"}</span>
                            {c.booking_group_id && <Link2 className="h-3 w-3 shrink-0 text-muted-foreground" />}
                          </div>
                          <div className="truncate text-muted-foreground">
                            {minutesToLabel(startMin)}–{minutesToLabel(startMin + dur)}
                            {pkgName ? ` · ${pkgName}` : ""}
                          </div>
                          {dur >= 45 && (
                            <div className="mt-1 flex flex-wrap items-center gap-1">
                              <BookingStatusChip status={c.status} />
                              <PaymentChip bookingId={c.id} />
                            </div>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Unassigned strip */}
        <div
          className="rounded-2xl border border-dashed border-sk-orange/50 bg-sk-orange-soft/40 p-3"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); void handleUnassign(); }}
        >
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-sk-orange">
            <AlertTriangle className="h-3.5 w-3.5" /> Unassigned ({unassigned.length})
          </div>
          {unassigned.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Every dog has a groomer. Drag a block here to take a groomer off a booking.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {unassigned.map((c) => (
                <Link
                  key={c.id}
                  to={`/admin/bookings/${c.id}`}
                  state={{ from: "/admin/grooming" }}
                  draggable
                  onDragStart={(e) => {
                    dragRef.current = { id: c.id, grabOffsetMin: 0 };
                    e.dataTransfer.setData("text/plain", c.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  className="cursor-grab rounded-lg border border-border bg-white px-3 py-2 text-xs shadow-sm active:cursor-grabbing"
                >
                  <div className="font-semibold">{c.pets[0]?.name ?? c.booking_number}</div>
                  <div className="text-muted-foreground">
                    {c.start_at ? minutesToLabel(minutesOfDay(c.start_at) ?? 0) : "—"} · {cardMinutes(c, packageMinutes)} min
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </PaymentFlagsProvider>
  );
}