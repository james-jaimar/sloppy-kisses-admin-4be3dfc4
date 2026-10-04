import { useMemo, useState } from "react";
import { fmtTime, useGroomingSheet, usePetAlerts } from "./queries";
import { AlertChips, EmptyState, Sheet, TABLE, TD, TH, Tick } from "./sheetUi";

type Layout = "master" | "station";

/**
 * Grooming parlour sheets. Default is the Master Parlour Sheet: every station's
 * dogs on one chronological list, with handwritten boxes for whoever picks the dog
 * up (stations are capacity, not named groomers). Per-station pages stay available.
 */
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
  const [layout, setLayout] = useState<Layout>("master");
  const q = useGroomingSheet(tenantId, day);
  const jobs = q.data ?? [];
  const petIds = useMemo(() => jobs.flatMap((j) => j.pets.map((p) => p.id)), [jobs]);
  const alerts = usePetAlerts(tenantId, petIds).data ?? {};

  const chronological = useMemo(
    () =>
      [...jobs].sort(
        (a, b) =>
          (a.start_at ?? "").localeCompare(b.start_at ?? "") || a.groomer.localeCompare(b.groomer),
      ),
    [jobs],
  );

  const byStation = useMemo(() => {
    const m = new Map<string, typeof jobs>();
    for (const j of chronological) {
      const list = m.get(j.groomer) ?? [];
      list.push(j);
      m.set(j.groomer, list);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [chronological]);

  if (!jobs.length) {
    return (
      <Sheet title="Grooming parlour sheet" subtitle={dayLabel}>
        <EmptyState what="in-house grooming" />
      </Sheet>
    );
  }

  const toggle = (
    <div className="mb-3 flex gap-2 print:hidden">
      {(["master", "station"] as Layout[]).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLayout(l)}
          className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
            layout === l
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card text-foreground hover:bg-muted"
          }`}
        >
          {l === "master" ? "Master parlour sheet" : "One page per station"}
        </button>
      ))}
    </div>
  );

  const dogCell = (j: (typeof jobs)[number]) => (
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
  );

  const briefCell = (j: (typeof jobs)[number]) => (
    <td className={TD}>
      <div className="font-semibold">{j.package_name ?? "—"}</div>
      {j.notes && <div className="text-xs print:text-[8pt]">{j.notes}</div>}
      {j.pets
        .map((p) => alerts[p.id]?.medical)
        .filter(Boolean)
        .map((m, i) => (
          <div key={i} className="text-xs font-semibold print:text-[8pt]">Medical: {m}</div>
        ))}
    </td>
  );

  const writeBox = <div className="h-7 border-b border-dashed border-foreground/40" />;

  if (layout === "master") {
    return (
      <>
        {toggle}
        <Sheet
          title="Master parlour sheet"
          subtitle={dayLabel}
          meta={
            <div>
              {jobs.length} appointments · {byStation.length} station{byStation.length === 1 ? "" : "s"}
            </div>
          }
        >
          <table className={TABLE}>
            <thead>
              <tr>
                <th className={TH} style={{ width: "8%" }}>Time</th>
                <th className={TH} style={{ width: "9%" }}>Station</th>
                <th className={TH} style={{ width: "20%" }}>Dog / owner</th>
                <th className={TH} style={{ width: "22%" }}>Service / brief</th>
                <th className={TH} style={{ width: "11%" }}>Groomer</th>
                <th className={TH} style={{ width: "7%" }}>Start</th>
                <th className={TH} style={{ width: "7%" }}>Finish</th>
                <th className={TH}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {chronological.map((j) => (
                <tr key={j.id} className="break-inside-avoid">
                  <td className={TD}>
                    <div className="font-bold">{fmtTime(j.start_at)}</div>
                    <div className="text-xs print:text-[8pt]">{j.duration_minutes ? `${j.duration_minutes} min` : ""}</div>
                  </td>
                  <td className={TD}>{j.groomer}</td>
                  {dogCell(j)}
                  {briefCell(j)}
                  <td className={TD}>{writeBox}</td>
                  <td className={TD}>{writeBox}</td>
                  <td className={TD}>{writeBox}</td>
                  <td className={TD}>{writeBox}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide print:text-[8pt]">
            Write your name or initials when you take a dog. Front desk checked: ______________________
          </p>
        </Sheet>
      </>
    );
  }

  return (
    <>
      {toggle}
      {byStation.map(([station, list]) => (
        <Sheet
          key={station}
          title={`Grooming · ${station}`}
          subtitle={dayLabel}
          meta={<div>{list.length} appointments</div>}
        >
          <table className={TABLE}>
            <thead>
              <tr>
                <th className={TH} style={{ width: "10%" }}>Time</th>
                <th className={TH} style={{ width: "22%" }}>Dog / owner</th>
                <th className={TH}>Service / brief</th>
                <th className={TH} style={{ width: "14%" }}>Groomer</th>
                <th className={TH} style={{ width: "18%" }}>Start · Done · Out</th>
              </tr>
            </thead>
            <tbody>
              {list.map((j) => (
                <tr key={j.id} className="break-inside-avoid">
                  <td className={TD}>
                    <div className="font-bold">{fmtTime(j.start_at)}</div>
                    <div className="text-xs print:text-[8pt]">{j.duration_minutes ? `${j.duration_minutes} min` : ""}</div>
                  </td>
                  {dogCell(j)}
                  {briefCell(j)}
                  <td className={TD}>{writeBox}</td>
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
        </Sheet>
      ))}
    </>
  );
}
