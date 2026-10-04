import { useEffect, useMemo, useState } from "react";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import { useGroomers } from "@/features/settings/resourceQueries";
import { useGroomingBoardBookings } from "../queries";
import { useDaycarePetIdsForDay } from "../daycareLink";
import { useKioskGroomerNames } from "./kioskQueries";

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" }) : "—";
const isActive = (s: string) => s === "grooming" || s === "in_progress";

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

  return (
    <div className="flex min-h-screen flex-col bg-foreground p-8 text-background">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-5xl font-extrabold">Grooming today</h1>
          <p className="mt-1 text-2xl opacity-70">
            {now.toLocaleDateString("en-ZA", { weekday: "long", day: "2-digit", month: "long" })}
          </p>
        </div>
        <div className="text-right">
          <div className="text-6xl font-extrabold tabular-nums">{now.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}</div>
          <div className="text-2xl opacity-70">{done} of {cards.length} ready</div>
        </div>
      </header>

      <div className="grid flex-1 gap-6" style={{ gridTemplateColumns: `repeat(${Math.max(1, stations.length)}, minmax(0, 1fr))` }}>
        {stations.map((s) => {
          const list = cards.filter((c) => c.resource_id === s.id);
          const onTable = list.find((c) => isActive(c.status));
          const queue = list.filter((c) => !isActive(c.status) && c.status !== "ready");
          const ready = list.filter((c) => c.status === "ready");
          return (
            <section key={s.id} className="flex flex-col gap-4 rounded-3xl bg-background/10 p-5">
              <h2 className="text-3xl font-bold">{s.name}</h2>
              <div className={"rounded-2xl p-4 " + (onTable ? "bg-sk-orange" : "bg-background/10")}>
                <div className="text-lg font-semibold uppercase tracking-wide opacity-80">On the table</div>
                {onTable ? (
                  <>
                    <div className="text-4xl font-extrabold">{onTable.pets.map((p) => p.name).join(" & ")}</div>
                    <div className="text-xl">✂ {names.data?.[onTable.id]?.groomer ?? "—"} · booked {fmt(onTable.start_at)}</div>
                  </>
                ) : (
                  <div className="text-3xl font-bold opacity-60">Free</div>
                )}
              </div>
              <div>
                <div className="mb-2 text-lg font-semibold uppercase tracking-wide opacity-70">Next up</div>
                {queue.length === 0 && <div className="text-xl opacity-50">Nothing waiting</div>}
                {queue.slice(0, 4).map((c) => (
                  <div key={c.id} className="flex items-baseline justify-between border-b border-background/15 py-2 text-2xl">
                    <span className="font-bold tabular-nums">{fmt(c.start_at)}</span>
                    <span className="ml-3 flex-1 truncate">{c.pets.map((p) => p.name).join(" & ")}</span>
                    {c.status === "checked_in" && <span className="text-base font-semibold text-sk-green">arrived</span>}
                  </div>
                ))}
              </div>
              {ready.length > 0 && (
                <div className="mt-auto">
                  <div className="mb-1 text-lg font-semibold uppercase tracking-wide opacity-70">Ready</div>
                  {ready.map((c) => (
                    <div key={c.id} className="text-xl text-sk-green">
                      ✓ {c.pets.map((p) => p.name).join(" & ")}
                      {c.pets.some((p) => daycare.has(p.id)) && " → daycare"}
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
