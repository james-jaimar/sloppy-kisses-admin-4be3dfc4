import { useMemo } from "react";
import { fmtTime, useHotelSheet, usePetAlerts } from "./queries";
import { AlertChips, EmptyState, Sheet, TABLE, TD, TH, Tick } from "./sheetUi";

/** Hotel & cattery care sheet: every occupied room with AM/PM rounds to tick. */
export function HotelDailySheet({
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
  const q = useHotelSheet(tenantId, day);
  const stays = useMemo(
    () => [...(q.data ?? [])].sort((a, b) => a.room.localeCompare(b.room)),
    [q.data],
  );
  const petIds = useMemo(() => stays.flatMap((s) => s.pets.map((p) => p.id)), [stays]);
  const alerts = usePetAlerts(tenantId, petIds).data ?? {};

  const arrivals = stays.filter((s) => s.arrivingToday);
  const departures = stays.filter((s) => s.leavingToday);

  return (
    <Sheet
      title="Hotel & cattery day sheet"
      subtitle={dayLabel}
      meta={
        <>
          <div>{stays.length} in house</div>
          <div>{arrivals.length} arriving · {departures.length} leaving</div>
        </>
      }
    >
      {stays.length === 0 ? (
        <EmptyState what="the hotel" />
      ) : (
        <>
          <table className={TABLE}>
            <thead>
              <tr>
                <th className={TH} style={{ width: "10%" }}>Room</th>
                <th className={TH} style={{ width: "20%" }}>Pet / owner</th>
                <th className={TH} style={{ width: "10%" }}>Stay</th>
                <th className={TH}>Feeding · Medication · Notes</th>
                <th className={TH} style={{ width: "26%" }}>AM round · PM round</th>
              </tr>
            </thead>
            <tbody>
              {stays.map((s) => (
                <tr key={s.id} className="break-inside-avoid">
                  <td className={TD}>
                    <div className="font-black">{s.room}</div>
                    {s.arrivingToday && <div className="text-xs font-bold print:text-[8pt]">ARRIVES {fmtTime(s.start_at)}</div>}
                    {s.leavingToday && <div className="text-xs font-bold print:text-[8pt]">LEAVES {fmtTime(s.end_at)}</div>}
                  </td>
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
                    {new Date(s.start_at).toLocaleDateString("en-ZA", { day: "2-digit", month: "short" })}
                    {" – "}
                    {s.end_at
                      ? new Date(s.end_at).toLocaleDateString("en-ZA", { day: "2-digit", month: "short" })
                      : "open"}
                  </td>
                  <td className={TD}>
                    {s.feeding && <div><span className="font-semibold">Food:</span> {s.feeding}</div>}
                    {s.medication && <div className="font-bold">Meds: {s.medication}</div>}
                    {s.notes && <div>{s.notes}</div>}
                    {s.pets
                      .map((p) => alerts[p.id]?.medical)
                      .filter(Boolean)
                      .map((m, i) => (
                        <div key={i} className="font-semibold">Medical: {m}</div>
                      ))}
                  </td>
                  <td className={TD}>
                    <div className="flex flex-wrap gap-2">
                      <Tick label="Fed AM" />
                      <Tick label="Walk" />
                      <Tick label="Meds" />
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      <Tick label="Fed PM" />
                      <Tick label="Walk" />
                      <Tick label="Clean" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 border border-black/40 p-3">
            <div className="text-[11px] font-black uppercase tracking-wide print:text-[8pt]">
              Handover notes / incidents
            </div>
            <div className="mt-3 space-y-5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="border-b border-dotted border-black/50" />
              ))}
            </div>
          </div>
        </>
      )}
    </Sheet>
  );
}
