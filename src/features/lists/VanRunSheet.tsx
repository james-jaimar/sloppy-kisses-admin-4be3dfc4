import { useMemo } from "react";
import { fmtTime, usePetAlerts, useVanSheet } from "./queries";
import { AlertChips, EmptyState, Sheet, TABLE, TD, TH, Tick } from "./sheetUi";

/** Mobile van route sheet: stops in order with address, access notes and sign-off. */
export function VanRunSheet({
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
  const q = useVanSheet(tenantId, day);
  const stops = q.data ?? [];
  const petIds = useMemo(() => stops.flatMap((s) => s.pets.map((p) => p.id)), [stops]);
  const alerts = usePetAlerts(tenantId, petIds).data ?? {};

  const byVan = useMemo(() => {
    const m = new Map<string, typeof stops>();
    for (const s of stops) {
      const list = m.get(s.van) ?? [];
      list.push(s);
      m.set(s.van, list);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [stops]);

  if (!stops.length) {
    return (
      <Sheet title="Mobile van route" subtitle={dayLabel}>
        <EmptyState what="the mobile vans" />
      </Sheet>
    );
  }

  return (
    <>
      {byVan.map(([van, list]) => (
        <Sheet
          key={van}
          title={`Van route · ${van}`}
          subtitle={dayLabel}
          meta={
            <>
              <div>{list.length} stops</div>
              <div>Driver: ______________</div>
            </>
          }
        >
          <table className={TABLE}>
            <thead>
              <tr>
                <th className={TH} style={{ width: "5%" }}>#</th>
                <th className={TH} style={{ width: "9%" }}>Time</th>
                <th className={TH} style={{ width: "20%" }}>Dog / owner</th>
                <th className={TH}>Address &amp; access</th>
                <th className={TH} style={{ width: "16%" }}>Service</th>
                <th className={TH} style={{ width: "16%" }}>Arrived · Done</th>
              </tr>
            </thead>
            <tbody>
              {list.map((s, i) => (
                <tr key={s.id} className="break-inside-avoid">
                  <td className={TD}>{i + 1}</td>
                  <td className={TD}><span className="font-bold">{fmtTime(s.start_at)}</span></td>
                  <td className={TD}>
                    {s.pets.map((p) => (
                      <div key={p.id} className="font-bold">
                        {p.name}
                        <AlertChips alerts={alerts[p.id]?.alerts ?? []} />
                      </div>
                    ))}
                    <div className="text-xs print:text-[8pt]">
                      {s.customer_name}
                      {showPhone && s.customer_mobile ? ` · ${s.customer_mobile}` : ""}
                    </div>
                  </td>
                  <td className={TD}>
                    <div className="font-semibold">{s.address}</div>
                    {s.access_notes && <div className="text-xs print:text-[8pt]">{s.access_notes}</div>}
                  </td>
                  <td className={TD}>
                    <div>{s.package_name ?? "—"}</div>
                    {s.notes && <div className="text-xs print:text-[8pt]">{s.notes}</div>}
                  </td>
                  <td className={TD}>
                    <div className="flex flex-wrap gap-2">
                      <Tick label="Arr" />
                      <Tick label="Done" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide print:text-[8pt]">
            Km start: __________ Km end: __________ Driver signature: ______________________
          </p>
        </Sheet>
      ))}
    </>
  );
}
