import { useMemo } from "react";
import { useExpectedForDay } from "@/features/daycare/queries";
import { useDayNotes, usePetAlerts } from "./queries";
import { AlertChips, EmptyState, Sheet, TABLE, TD, TH, Tick } from "./sheetUi";

/** Daycare attendance register: one line per dog, tick in / tick out, feed + meds. */
export function DaycareRegisterSheet({
  tenantId,
  day,
  dayLabel,
}: {
  tenantId: string | null;
  day: Date;
  dayLabel: string;
}) {
  const expectedQ = useExpectedForDay(tenantId, day);
  const rows = useMemo(
    () => [...(expectedQ.items ?? [])].sort((a, b) => a.pet_name.localeCompare(b.pet_name)),
    [expectedQ.items],
  );
  const alertsQ = usePetAlerts(tenantId, rows.map((r) => r.pet_id));
  const notesQ = useDayNotes(tenantId, day);
  const alerts = alertsQ.data ?? {};
  const notes = notesQ.data ?? [];

  return (
    <Sheet
      title="Daycare register"
      subtitle={dayLabel}
      meta={
        <>
          <div>{rows.length} dogs expected</div>
          <div>Staff on duty: ______________</div>
        </>
      }
    >
      {rows.length === 0 ? (
        <EmptyState what="daycare" />
      ) : (
        <table className={TABLE}>
          <thead>
            <tr>
              <th className={TH} style={{ width: "4%" }}>#</th>
              <th className={TH} style={{ width: "24%" }}>Dog / owner</th>
              <th className={TH} style={{ width: "12%" }}>Plan</th>
              <th className={TH} style={{ width: "11%" }}>In (time)</th>
              <th className={TH} style={{ width: "11%" }}>Out (time)</th>
              <th className={TH} style={{ width: "8%" }}>Fed</th>
              <th className={TH} style={{ width: "8%" }}>Meds</th>
              <th className={TH}>Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const a = alerts[r.pet_id];
              const petNotes = notes.filter((n) => n.pet_id === r.pet_id);
              return (
                <tr key={r.key} className="break-inside-avoid">
                  <td className={TD}>{i + 1}</td>
                  <td className={TD}>
                    <div className="font-bold">
                      {r.pet_name}
                      <AlertChips alerts={a?.alerts ?? []} />
                    </div>
                    <div className="text-xs print:text-[8pt]">{r.customer_name}</div>
                    {a?.medical && (
                      <div className="mt-0.5 text-xs font-semibold print:text-[8pt]">Medical: {a.medical}</div>
                    )}
                  </td>
                  <td className={TD}>{r.plan_name ?? "—"}</td>
                  <td className={TD} />
                  <td className={TD} />
                  <td className={TD}><Tick /></td>
                  <td className={TD}><Tick /></td>
                  <td className={TD}>
                    {petNotes.map((n, idx) => (
                      <div key={idx} className={n.office_flag ? "font-bold" : ""}>
                        {n.office_flag ? "⚑ " : ""}
                        {n.body}
                      </div>
                    ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <div className="mt-4 border border-black/40 p-3">
        <div className="text-[11px] font-black uppercase tracking-wide print:text-[8pt]">
          Incidents / things to tell the office
        </div>
        <div className="mt-2 space-y-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="border-b border-dotted border-black/50" />
          ))}
        </div>
      </div>
    </Sheet>
  );
}
