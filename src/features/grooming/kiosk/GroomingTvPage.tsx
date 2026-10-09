import { useEffect, useMemo, useState } from "react";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import { useGroomers } from "@/features/settings/resourceQueries";
import { useGroomingBoardBookings } from "../queries";
import { useDaycarePetIdsForDay } from "../daycareLink";
import { useKioskGroomerNames } from "./kioskQueries";

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" }) : "—";
const isActive = (s: string) => s === "grooming" || s === "in_progress";

/** Per-station accent palette (semantic brand tokens), cycled by station order. */
const ACCENTS = [
  { bar: "bg-sk-coral", text: "text-sk-coral", border: "border-sk-coral", soft: "bg-sk-coral/20" },
  { bar: "bg-sk-turquoise", text: "text-sk-turquoise", border: "border-sk-turquoise", soft: "bg-sk-turquoise/20" },
  { bar: "bg-sk-orange", text: "text-sk-orange", border: "border-sk-orange", soft: "bg-sk-orange/20" },
  { bar: "bg-sk-teal", text: "text-sk-teal", border: "border-sk-teal", soft: "bg-sk-teal/25" },
];

/** Read-only wall TV for the parlour. Refreshes every 30 seconds. */
export default function GroomingTvPage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(t); }, []);
  const day = useMemo(() => { const d = new Date(now); d.setHours(0, 0, 0, 0); return d; }, [now.toDateString()]);
  const bookingsQ = useGroomingBoardBookings({ tenantId, day });
  const stationsQ = useGroomers(tenantId, { activeOnly: true });
  const cards = bookingsQ.data ?? [];
  const names = useKioskGroomerNames(cards.map((c) => c.id));
  const daycare = useDaycarePetIdsForDay(tenantId, day);

  const stations = stationsQ.data ?? [];
  const done = cards.filter((c) => c.status === "ready").length;
  const pct = cards.length ? Math.round((done / cards.length) * 100) : 0;

  return (
    <div className="flex min-h-screen flex-col bg-foreground p-8 text-background">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-5xl font-extrabold">
            <span className="text-sk-coral">Grooming</span> today
          </h1>
          <p className="mt-1 text-2xl text-sk-turquoise">
            {now.toLocaleDateString("en-ZA", { weekday: "long", day: "2-digit", month: "long" })}
          </p>
        </div>
        <div className="text-right">
          <div className="flex items-center justify-end gap-3 text-6xl font-extrabold tabular-nums">
            <span className="h-4 w-4 animate-pulse rounded-full bg-sk-green" />
            {now.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}
          </div>
          <div className="mt-2 inline-flex items-center gap-3 rounded-full bg-sk-green/20 px-4 py-1 text-2xl font-semibold text-sk-green">
            {done} of {cards.length} ready
          </div>
          <div className="mt-2 h-2 w-72 overflow-hidden rounded-full bg-background/15 ml-auto">
            <div className="h-full bg-sk-green transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </header>

      <div className="grid flex-1 gap-6" style={{ gridTemplateColumns: `repeat(${Math.max(1, stations.length)}, minmax(0, 1fr))` }}>
        {stations.map((s, i) => {
          const a = ACCENTS[i % ACCENTS.length];
          const list = cards.filter((c) => c.resource_id === s.id);
          const onTable = list.find((c) => isActive(c.status));
          const queue = list.filter((c) => !isActive(c.status) && c.status !== "ready");
          const ready = list.filter((c) => c.status === "ready");
          return (
            <section key={s.id} className={`flex flex-col gap-4 overflow-hidden rounded-3xl border-t-8 ${a.border} bg-background/10 p-5`}>
              <h2 className={`flex items-center gap-3 text-3xl font-bold ${a.text}`}>
                <span className={`h-4 w-4 rounded-full ${a.bar}`} />{s.name}
              </h2>
              <div className={"rounded-2xl p-4 " + (onTable ? `${a.bar} text-foreground` : "border-2 border-sk-green/60 bg-sk-green/15")}>
                <div className="text-lg font-semibold uppercase tracking-wide opacity-80">On the table</div>
                {onTable ? (
                  <>
                    <div className="text-4xl font-extrabold">{onTable.pets.map((p) => p.name).join(" & ")}</div>
                    <div className="text-xl font-medium">✂ {names.data?.[onTable.id]?.groomer ?? "—"} · booked {fmt(onTable.start_at)}</div>
                  </>
                ) : (
                  <div className="text-3xl font-bold text-sk-green">Available</div>
                )}
              </div>
              <div>
                <div className="mb-2 text-lg font-semibold uppercase tracking-wide opacity-70">Next up</div>
                {queue.length === 0 && <div className="text-xl opacity-50">Nothing waiting</div>}
                {queue.slice(0, 4).map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-3 border-b border-background/15 py-2 text-2xl">
                    <span className={`rounded-lg px-2 py-0.5 font-bold tabular-nums ${a.soft} ${a.text}`}>{fmt(c.start_at)}</span>
                    <span className="flex-1 truncate">{c.pets.map((p) => p.name).join(" & ")}</span>
                    {c.pets.some((p) => daycare.has(p.id)) && (
                      <span className="rounded-full bg-sk-turquoise px-2 py-0.5 text-sm font-bold text-foreground">daycare</span>
                    )}
                    {c.status === "checked_in" && (
                      <span className="rounded-full bg-sk-green px-2 py-0.5 text-sm font-bold text-foreground">arrived</span>
                    )}
                  </div>
                ))}
              </div>
              {ready.length > 0 && (
                <div className="mt-auto rounded-2xl bg-sk-green/15 p-3">
                  <div className="mb-1 text-lg font-semibold uppercase tracking-wide text-sk-green">Ready</div>
                  {ready.map((c) => (
                    <div key={c.id} className="text-xl font-semibold text-sk-green">
                      ✓ {c.pets.map((p) => p.name).join(" & ")}
                      {c.pets.some((p) => daycare.has(p.id)) && (
                        <span className="ml-2 rounded-full bg-sk-turquoise px-2 py-0.5 text-sm font-bold text-foreground">→ daycare</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
