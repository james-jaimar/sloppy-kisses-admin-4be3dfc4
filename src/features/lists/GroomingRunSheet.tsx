import { useMemo } from "react";
import { fmtTime, useGroomingSheet, usePetAlerts } from "./queries";
import { AlertChips, EmptyState, Sheet, TABLE, TD, TH, Tick } from "./sheetUi";

/** One sheet per groomer: their day in order, with the styling brief and sign-off boxes. */
export function GroomingRunSheet({
  tenantId,
  day,
  dayLabel,
  showPhone,
}: {
  tenantId: string | null;
  day: Date;
  dayLabel: string;
  showPhone: boolean;
}) {
  const q = useGroomingSheet(tenantId, day);
  const jobs = q.data ?? [];
  const petIds = useMemo(() => jobs.flatMap((j) => j.pets.map((p) => p.id)), [jobs]);
  const alerts = usePetAlerts(tenantId, petIds).data ?? {};

  const byGroomer = useMemo(() => {
    const m = new Map<string, typeof jobs>();
    for (const j of jobs) {
      const list = m.get(j.groomer) ?? [];
      list.push(j);
      m.set(j.groomer, list);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [jobs]);

  if (!jobs.length) {
    return (
      <Sheet title="Grooming run sheet" subtitle={dayLabel}>
        <EmptyState what="in-house grooming" />
      </Sheet>
    );
  }

  return (
    <>
      {byGroomer.map(([groomer, list]) => (
        <Sheet
          key={groomer}
          title={`Grooming · ${groomer}`}
          subtitle={dayLabel}
          meta={<div>{list.length} appointments</div>}
        >
          <table className={TABLE}>
            <thead>
              <tr>
                <th className={TH} style={{ width: "10%" }}>Time</th>
                <th className={TH} style={{ width: "22%" }}>Dog / owner</th>
                <th className={TH} style={{ width: "18%" }}>Service</th>
                <th className={TH}>Brief / notes</th>
                <th className={TH} style={{ width: "20%" }}>Start · Done · Collected</th>
              </tr>
            </thead>
            <tbody>
              {list.map((j) => (
                <tr key={j.id} className="break-inside-avoid">
                  <td className={TD}>
                    <div className="font-bold">{fmtTime(j.start_at)}</div>
                    <div className="text-xs print:text-[8pt]">{j.duration_minutes ? `${j.duration_minutes} min` : ""}</div>
                  </td>
                  <td className={TD}>
                    {j.pets.map((p) => (
                      <div key={p.id} className="font-bold">
                        {p.name}
                        <AlertChips alerts={alerts[p.id]?.alerts ?? []} />
                        {p.breed && <span className="ml-1 text-xs font-normal print:text-[8pt]">({p.breed})</span>}
                      </div>
                    ))}
                    <div className="text-xs print:text-[8pt]">
                      {j.customer_name}
                      {showPhone && j.customer_mobile ? ` · ${j.customer_mobile}` : ""}
                    </div>
                  </td>
                  <td className={TD}>{j.package_name ?? "—"}</td>
                  <td className={TD}>
                    {j.notes && <div>{j.notes}</div>}
                    {j.pets
                      .map((p) => alerts[p.id]?.medical)
                      .filter(Boolean)
                      .map((m, i) => (
                        <div key={i} className="font-semibold">Medical: {m}</div>
                      ))}
                  </td>
                  <td className={TD}>
                    <div className="flex flex-wrap gap-2">
                      <Tick label="Start" />
                      <Tick label="Done" />
                      <Tick label="Out" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide print:text-[8pt]">
            Groomer signature: ______________________________
          </p>
        </Sheet>
      ))}
    </>
  );
}
