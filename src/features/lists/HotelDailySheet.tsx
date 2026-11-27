import { useMemo } from "react";
import { fmtTime, useHotelSheet, usePetAlerts } from "./queries";
import { downloadSheetPdf, fmtShort, PdfButton, pdfDay } from "./sheetPdf";
import { AlertChips, EmptyState, Sheet, TABLE, TD, TH, Tick } from "./sheetUi";
import { addonLabel, isWalk, walksPerDay, useHotelBookingAddons } from "@/features/hotelCattery/bookingAddons";

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
  const addons = useHotelBookingAddons(stays.map((s) => s.id)).data ?? {};

  const arrivals = stays.filter((s) => s.arrivingToday);
  const departures = stays.filter((s) => s.leavingToday);

  const pdf = () => downloadSheetPdf({
    title: "Dog & Cat Hotel day sheet", subtitle: dayLabel, landscape: true, fileName: `hotel-day-sheet-${pdfDay(day)}.pdf`,
    total: { value: petIds.length, label: "pets", sub: `${arrivals.length} in · ${departures.length} out` }, notesBox: "Handover notes / incidents",
    sections: [{
      columns: [{ label: "Room", width: 28 }, { label: "Pet & breed", width: 45 }, { label: "Owner", width: 36 }, { label: "Stay", width: 24 }, { label: "Feeding · Medication · Notes" }, { label: "Rounds", width: 50 }],
      rows: stays.map((s) => {
        const ex = addons[s.id] ?? [];
        return [
          [s.room, s.arrivingToday ? `ARRIVES ${fmtTime(s.start_at)}` : "", s.leavingToday ? `LEAVES ${fmtTime(s.end_at)}` : ""].filter(Boolean).join("\n"),
          s.pets.map((p) => [p.name ?? "Pet", p.breed ? `(${p.breed})` : "", (alerts[p.id]?.alerts ?? []).join(", ")].filter(Boolean).join(" ")).join("\n"),
          `${s.customer_name}${showPhone && s.customer_mobile ? `\n${s.customer_mobile}` : ""}`,
          `${fmtShort(s.start_at)} – ${fmtShort(s.end_at)}`,
          [ex.length ? `PAID EXTRAS: ${ex.map(addonLabel).join(" · ")}` : "", s.feeding ? `Food: ${s.feeding}` : "", s.medication ? `Meds: ${s.medication}` : "", s.notes ?? "", ...s.pets.map((p) => alerts[p.id]?.medical ? `Medical: ${alerts[p.id]?.medical}` : "")].filter(Boolean).join("\n"),
          ["[ ] Fed AM  [ ] Meds", Array.from({ length: walksPerDay(ex) }, (_, i) => `[ ] Walk ${i + 1}`).join("  "), "[ ] Fed PM  [ ] Clean"].filter(Boolean).join("\n"),
        ];
      }),
    }],
  });

  return (
    <>
    {stays.length > 0 && <PdfButton onClick={pdf} />}
    <Sheet
      title="Dog & Cat Hotel day sheet"
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
                    {(addons[s.id] ?? []).length > 0 && (
                      <div className="font-black">
                        PAID EXTRAS: {(addons[s.id] ?? []).map(addonLabel).join(" · ")}
                      </div>
                    )}
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
                      <Tick label="Meds" />
                      {Array.from({ length: walksPerDay(addons[s.id] ?? []) }, (_, i) => (
                        <Tick key={i} label={`Walk ${i + 1}`} />
                      ))}
                    </div>
                    {(addons[s.id] ?? []).some(a => isWalk(a) && a.quantity_basis === "total") && <div className="mt-2 text-xs font-semibold">Total-stay walks: record date and number completed in handover notes.</div>}
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      <Tick label="Fed PM" />
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
    </>
  );
}
