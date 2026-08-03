import { AlarmClock, Sparkles } from "lucide-react";
import { fmtCollectTime, overdueMinutes, type StayPlaySession } from "./stayPlayQueries";

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