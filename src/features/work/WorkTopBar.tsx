import { ChevronLeft, ChevronRight } from "lucide-react";
import { format, isToday } from "date-fns";

export function WorkTopBar({
  title,
  subtitle,
  day,
  onDayChange,
  right,
}: {
  title: string;
  subtitle?: string;
  day?: Date;
  onDayChange?: (d: Date) => void;
  right?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-white px-4 py-3">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold">{title}</h1>
          {subtitle && <p className="truncate text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {right}
      </div>
      {day && onDayChange && (
        <div className="mx-auto mt-3 flex max-w-3xl items-center gap-2">
          <button
            aria-label="Previous day"
            onClick={() => { const d = new Date(day); d.setDate(d.getDate() - 1); onDayChange(d); }}
            className="grid h-12 w-12 place-items-center rounded-xl border border-border bg-white active:bg-muted"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            onClick={() => onDayChange(new Date())}
            className={`h-12 flex-1 rounded-xl border text-base font-semibold ${
              isToday(day) ? "border-sk-coral bg-sk-coral-soft text-sk-coral-dark" : "border-border bg-white"
            }`}
          >
            {isToday(day) ? "Today" : format(day, "EEE d MMM")}
          </button>
          <button
            aria-label="Next day"
            onClick={() => { const d = new Date(day); d.setDate(d.getDate() + 1); onDayChange(d); }}
            className="grid h-12 w-12 place-items-center rounded-xl border border-border bg-white active:bg-muted"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </div>
      )}
    </header>
  );
}