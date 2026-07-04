import { AppHeader } from "@/components/layout/AppHeader";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, format, startOfWeek } from "date-fns";

const hours = Array.from({ length: 11 }, (_, i) => 7 + i); // 07:00 - 17:00

type Appt = { day: number; start: number; end: number; title: string; sub: string; tone: "coral" | "turquoise" | "green" | "orange" };
const appts: Appt[] = [
  { day: 0, start: 8, end: 9.5, title: "Max — Full Groom", sub: "Nomvula", tone: "coral" },
  { day: 0, start: 10, end: 11, title: "Bella — Bath", sub: "Kagiso", tone: "coral" },
  { day: 1, start: 9, end: 11, title: "Mobile: Milo", sub: "Van 2 · Sandton", tone: "turquoise" },
  { day: 1, start: 13, end: 14, title: "Luna — Cat Groom", sub: "Sipho", tone: "coral" },
  { day: 2, start: 7.5, end: 8.5, title: "Pick-up: Kiara", sub: "Van 1 · Bryanston", tone: "orange" },
  { day: 2, start: 11, end: 12.5, title: "Rocky — Full Groom", sub: "Nomvula", tone: "coral" },
  { day: 3, start: 9, end: 10.5, title: "Charlie — Nail Trim", sub: "Kagiso", tone: "coral" },
  { day: 3, start: 14, end: 16, title: "Hotel intake: Kiara", sub: "Hotel", tone: "green" },
  { day: 4, start: 8, end: 10, title: "Mobile: Ziggy", sub: "Van 2 · Fourways", tone: "turquoise" },
  { day: 4, start: 12, end: 13, title: "Bella — Tidy", sub: "Nomvula", tone: "coral" },
  { day: 5, start: 10, end: 12, title: "Max — Deshed", sub: "Kagiso", tone: "coral" },
  { day: 6, start: 9, end: 10, title: "Drop-off: Milo", sub: "Van 1", tone: "orange" },
];

const toneBar: Record<Appt["tone"], string> = {
  coral:     "bg-sk-coral-soft border-sk-coral text-sk-coral-dark",
  turquoise: "bg-sk-turquoise-soft border-sk-turquoise text-sk-turquoise-dark",
  green:     "bg-sk-green-soft border-sk-green text-sk-green",
  orange:    "bg-sk-orange-soft border-sk-orange text-sk-orange",
};

export default function CalendarWeekView() {
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <>
      <AppHeader
        title="Calendar"
        subtitle="All operational bookings across services"
        tabs={[
          { label: "All", active: true },
          { label: "Grooming" },
          { label: "Mobile Vans" },
          { label: "Pick Up / Drop Off" },
          { label: "Daycare" },
          { label: "Hotel & Cattery" },
        ]}
        actions={
          <>
            <div className="inline-flex overflow-hidden rounded-xl border border-border bg-white">
              {["Day", "Week", "Month"].map((v) => (
                <button
                  key={v}
                  className={
                    "px-3 py-1.5 text-sm font-medium " +
                    (v === "Week" ? "bg-sk-coral text-white" : "text-muted-foreground hover:bg-muted")
                  }
                >
                  {v}
                </button>
              ))}
            </div>
            <button className="inline-flex h-10 items-center gap-2 rounded-xl bg-sk-coral px-4 text-sm font-semibold text-white hover:bg-sk-coral-dark">
              <Plus className="h-4 w-4" />
              Add booking
            </button>
          </>
        }
      />
      <div className="flex-1 p-6">
        <div className="sk-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <div className="flex items-center gap-2">
              <button className="grid h-8 w-8 place-items-center rounded-lg border border-border hover:bg-muted">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button className="grid h-8 w-8 place-items-center rounded-lg border border-border hover:bg-muted">
                <ChevronRight className="h-4 w-4" />
              </button>
              <span className="ml-2 text-sm font-medium">
                {format(days[0], "d MMM")} – {format(days[6], "d MMM yyyy")}
              </span>
            </div>
            <button className="text-sm font-medium text-muted-foreground hover:text-foreground">Today</button>
          </div>

          <div className="grid grid-cols-[64px_repeat(7,minmax(0,1fr))] border-b border-border">
            <div />
            {days.map((d, i) => {
              const isToday = format(d, "yyyyMMdd") === format(new Date(), "yyyyMMdd");
              return (
                <div key={i} className="px-3 py-3 border-l border-border">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{format(d, "EEE")}</div>
                  <div className={"mt-0.5 text-lg font-semibold " + (isToday ? "text-sk-coral-dark" : "")}>
                    {format(d, "d")}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="relative grid grid-cols-[64px_repeat(7,minmax(0,1fr))]">
            <div>
              {hours.map((h) => (
                <div key={h} className="h-14 pr-2 pt-1 text-right text-[11px] text-muted-foreground">
                  {String(h).padStart(2, "0")}:00
                </div>
              ))}
            </div>
            {days.map((_, dayIndex) => (
              <div key={dayIndex} className="relative border-l border-border">
                {hours.map((h) => (
                  <div key={h} className="h-14 border-b border-border/60" />
                ))}
                {appts
                  .filter((a) => a.day === dayIndex)
                  .map((a, i) => {
                    const top = (a.start - hours[0]) * 56;
                    const height = (a.end - a.start) * 56 - 4;
                    return (
                      <div
                        key={i}
                        className={"absolute left-1 right-1 rounded-lg border-l-[3px] px-2 py-1.5 text-[11px] " + toneBar[a.tone]}
                        style={{ top, height }}
                      >
                        <div className="font-semibold truncate">{a.title}</div>
                        <div className="opacity-75 truncate">{a.sub}</div>
                      </div>
                    );
                  })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}