import { createContext, useContext, type ReactNode } from "react";
import { AlarmClock, Sparkles } from "lucide-react";
import { fmtCollectTime, overdueMinutes, useStayPlayFlags, type StayPlaySession } from "./stayPlayQueries";

interface Props {
  /** Sessions attached to the thing being labelled. Renders nothing when empty. */
  sessions: StayPlaySession[] | undefined | null;
  graceMinutes?: number;
  /** Show the expected collection time next to the label. */
  showTime?: boolean;
  size?: "xs" | "sm";
  className?: string;
}

/**
 * The one and only Stay & Play indicator. Used on every board, list, detail
 * panel and portal screen so the flag always looks the same.
 */
export function StayPlayBadge({ sessions, graceMinutes = 15, showTime = true, size = "xs", className }: Props) {
  const rows = sessions ?? [];
  if (rows.length === 0) return null;

  const late = rows
    .map((s) => overdueMinutes(s, graceMinutes))
    .filter((m): m is number => m !== null)
    .sort((a, b) => b - a)[0];

  const allCollected = rows.every((s) => s.status === "collected");
  const next = rows.find((s) => s.status !== "collected") ?? rows[0];

  const tone = late != null
    ? "bg-destructive/10 text-destructive ring-1 ring-destructive/30"
    : allCollected
      ? "bg-sk-green/10 text-sk-green"
      : "bg-sk-turquoise-soft text-sk-turquoise-dark";

  const pad = size === "sm" ? "px-2 py-0.5 text-xs" : "px-1.5 py-0.5 text-[11px]";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold ${pad} ${tone} ${className ?? ""}`}
      title={
        late != null
          ? `Stay & Play collection overdue by ${late} minutes`
          : `Stay & Play · collect ${fmtCollectTime(next?.expected_collect_at ?? null)}`
      }
    >
      {late != null ? <AlarmClock className="h-3 w-3 shrink-0" /> : <Sparkles className="h-3 w-3 shrink-0" />}
      Stay &amp; Play
      {late != null
        ? <span>· overdue {late}m</span>
        : showTime && next?.expected_collect_at && !allCollected
          ? <span className="font-medium">· {fmtCollectTime(next.expected_collect_at)}</span>
          : allCollected
            ? <span className="font-medium">· collected</span>
            : null}
      {rows.length > 1 && <span className="font-medium">· {rows.length} pets</span>}
    </span>
  );
}

const StayPlayFlagsContext = createContext<{
  byBooking: Record<string, StayPlaySession[]>;
  graceMinutes: number;
}>({ byBooking: {}, graceMinutes: 15 });

/** Wrap a board so its cards can render Stay & Play chips from one query. */
export function StayPlayFlagsProvider({
  tenantId, bookingIds, children,
}: { tenantId: string | null | undefined; bookingIds: string[]; children: ReactNode }) {
  const flags = useStayPlayFlags(tenantId, bookingIds);
  return (
    <StayPlayFlagsContext.Provider value={{ byBooking: flags.byBooking, graceMinutes: flags.graceMinutes }}>
      {children}
    </StayPlayFlagsContext.Provider>
  );
}

/** Board-card chip. Reads from the nearest StayPlayFlagsProvider. */
export function StayPlayChip({
  bookingId, showTime = true, size = "xs", className,
}: { bookingId: string | null | undefined; showTime?: boolean; size?: "xs" | "sm"; className?: string }) {
  const ctx = useContext(StayPlayFlagsContext);
  return (
    <StayPlayBadge
      sessions={bookingId ? ctx.byBooking[bookingId] : undefined}
      graceMinutes={ctx.graceMinutes}
      showTime={showTime}
      size={size}
      className={className}
    />
  );
}

/** Self-fetching variant for single-booking screens (detail pages, portal). */
export function BookingStayPlayBadge({
  tenantId, bookingId, size = "sm", showTime = true, className,
}: {
  tenantId: string | null | undefined;
  bookingId: string | null | undefined;
  size?: "xs" | "sm";
  showTime?: boolean;
  className?: string;
}) {
  const flags = useStayPlayFlags(tenantId, bookingId ? [bookingId] : []);
  return (
    <StayPlayBadge
      sessions={flags.forBooking(bookingId)}
      graceMinutes={flags.graceMinutes}
      size={size}
      showTime={showTime}
      className={className}
    />
  );
}

const ORIGIN_LABEL: Record<string, string> = { grooming: "After groom", hotel: "After hotel" };
const STATUS_LABEL: Record<string, string> = {
  awaiting: "Awaiting", in_care: "In care", collected: "Collected", no_show: "Not collected",
};

/** Detail card explaining the Stay & Play arrangement for one booking. */
export function StayPlaySection({
  tenantId, bookingId,
}: { tenantId: string | null | undefined; bookingId: string | null | undefined }) {
  const flags = useStayPlayFlags(tenantId, bookingId ? [bookingId] : []);
  const rows = flags.forBooking(bookingId) ?? [];
  if (rows.length === 0) return null;

  return (
    <section className="rounded-xl border border-sk-turquoise/40 bg-sk-turquoise-soft/40 p-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-sk-turquoise-dark">
        <Sparkles className="h-3.5 w-3.5" /> Stay &amp; Play
      </div>
      <ul className="mt-2 space-y-1.5 text-sm">
        {rows.map((s) => {
          const late = overdueMinutes(s, flags.graceMinutes);
          return (
            <li key={s.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-medium">{s.pet?.name ?? "Pet"}</span>
              <span className="text-xs text-muted-foreground">{ORIGIN_LABEL[s.origin] ?? s.origin}</span>
              <span className="text-xs text-muted-foreground">
                · collect {fmtCollectTime(s.expected_collect_at)}
              </span>
              <span
                className={
                  "rounded-full px-2 py-0.5 text-[11px] font-semibold " +
                  (late != null
                    ? "bg-destructive/10 text-destructive"
                    : s.status === "collected"
                      ? "bg-sk-green/10 text-sk-green"
                      : "bg-white text-sk-turquoise-dark")
                }
              >
                {late != null ? `Overdue ${late}m` : STATUS_LABEL[s.status] ?? s.status}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[11px] text-sk-turquoise-dark">
        These pets stay on in daycare after this booking — manage collection on the Daycare board.
      </p>
    </section>
  );
}