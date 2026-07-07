import { useState } from "react";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { GroomingBoard } from "./GroomingBoard";

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

  return (
    <>
      <AppHeader
        title="Grooming board"
        subtitle="Drag cards across columns as pets move through the salon."
        actions={
          <div className="flex items-center gap-2">
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
      <div className="flex-1 p-6">
        <GroomingBoard day={day} />
      </div>
    </>
  );
}