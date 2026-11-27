import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Printer } from "lucide-react";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import { useBookingPeekClick } from "@/features/bookings/BookingPeek";
import { PaymentChip, PaymentFlagsProvider } from "@/features/shared/payments/paymentFlags";
import { BookingStatusChip } from "@/features/bookings/statusMeta";
import { useGroomingBoardBookings } from "./queries";
import { useDaycarePetIdsForDay } from "./daycareLink";
import { groomDayNumbers } from "./dayNumbers";
import { buildIntakeRows } from "./intakeRows";
import { useGroomingPackages } from "@/features/settings/groomingRateCardQueries";

const BANDS = ["bg-sk-orange-soft", "bg-sk-green-soft", "bg-sk-coral-soft", "bg-sk-turquoise-soft"];

function fmtTime(iso: string | null) {
  return iso ? new Date(iso).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: false }) : "—";
}

export function GroomingIntakeList({ day }: { day: Date }) {
  const peek = useBookingPeekClick();
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const q = useGroomingBoardBookings({ tenantId, day });
  const daycare = useDaycarePetIdsForDay(tenantId, day);
  const packagesQ = useGroomingPackages(tenantId, { activeOnly: false });
  const cards = q.data ?? [];
  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const pkgNames = useMemo(() => new Map((packagesQ.data ?? []).map((p: any) => [p.id, p.name])), [packagesQ.data]);
  const rows = useMemo(() => {
    const nums = groomDayNumbers(cards.map((c) => ({ id: c.id, start_at: c.start_at, station: c.resource?.name ?? "Unassigned", pets: c.pets })));
    return buildIntakeRows(cards.flatMap((c) => c.pets.map((p) => ({ bookingId: c.id, customerId: c.customer?.id ?? null, petId: p.id, number: nums.get(`${c.id}:${p.id}`) }))));
  }, [cards]);

  if (q.isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (q.error) return <div className="text-sm text-destructive">Couldn't load today's grooms.</div>;

  return (
    <PaymentFlagsProvider bookingIds={cards.map((c) => c.id)}>
      <div className="mb-3 flex items-center justify-between print:hidden">
        <p className="text-sm text-muted-foreground">Same colour = same owner.</p>
        <button onClick={() => window.print()} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-sm font-semibold hover:bg-sk-surface-muted">
          <Printer className="h-4 w-4" /> Print sheet
        </button>
      </div>
      <div className="hidden print:block mb-2 text-lg font-bold">
        Grooming intake — {day.toLocaleDateString("en-ZA", { weekday: "long", day: "2-digit", month: "short", year: "numeric" })} · {rows.length} pets
      </div>
      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No grooms booked for this day.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">#</th><th className="px-3 py-2">Time in</th><th className="px-3 py-2">Owner</th>
                <th className="px-3 py-2">Pet & breed</th><th className="px-3 py-2">Package</th><th className="px-3 py-2">Station</th>
                <th className="px-3 py-2 print:hidden">Status & payment</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const c = byId.get(r.bookingId)!;
                const pet = c.pets.find((p) => p.id === r.petId);
                const source = c.parent_booking_id ? "Hotel" : daycare.has(r.petId) ? "D/C" : fmtTime(c.start_at);
                const pkg = c.details?.package_id ? pkgNames.get(c.details.package_id) : null;
                return (
                  <tr key={`${r.bookingId}:${r.petId}`} className={`${BANDS[r.band]} ${r.firstOfOwner ? "border-t-2 border-foreground/20" : ""}`}>
                    <td className="px-3 py-2">
                      <span className="grid h-8 min-w-8 place-items-center rounded-md bg-foreground px-1 text-base font-black tabular-nums text-background">{r.number ?? "—"}</span>
                    </td>
                    <td className="px-3 py-2 font-bold">{source}{source !== fmtTime(c.start_at) && <span className="ml-1 text-xs font-normal text-muted-foreground">{fmtTime(c.start_at)}</span>}</td>
                    <td className="px-3 py-2">
                      {r.firstOfOwner ? (
                        <><div className="font-bold">{c.customer?.full_name ?? "—"}</div><div className="text-xs text-muted-foreground">{c.customer?.mobile ?? ""}{r.ownerSize > 1 ? ` · ${r.ownerSize} pets` : ""}</div></>
                      ) : <span className="text-xs text-muted-foreground">〃</span>}
                    </td>
                    <td className="px-3 py-2">
                      <Link to={`/admin/bookings/${c.id}`} onClick={peek(c.id)} state={{ from: "/admin/grooming" }} className="font-semibold hover:underline">{pet?.name ?? "Pet"}</Link>
                      <span className="text-muted-foreground"> ({pet?.breed || pet?.species || "—"})</span>
                    </td>
                    <td className="px-3 py-2">{pkg ?? "Individual treatments"}</td>
                    <td className="px-3 py-2">{c.resource?.name ?? "Unassigned"}</td>
                    <td className="px-3 py-2 print:hidden"><div className="flex flex-wrap gap-1"><BookingStatusChip status={c.status} /><PaymentChip bookingId={c.id} showPaid /></div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </PaymentFlagsProvider>
  );
}
