import { useMemo } from "react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { LogIn, LogOut, Hotel, FileText } from "lucide-react";
import {
  checkVaccinations, logVaccinationOverride, useHotelWorkflowSettings, useUpdateBookingStatus,
  type HotelBookingRow, type HotelQuoteRow, type HotelResourceRow,
} from "./queries";

import { useConfirm } from "@/components/ui/confirm-dialog";
import { PaymentChip, PaymentFlagsProvider } from "@/features/shared/payments/paymentFlags";
import { StayPlayChip, StayPlayFlagsProvider } from "@/features/daycare/StayPlayBadge";

function startOfDay(d: Date) { const c = new Date(d); c.setHours(0,0,0,0); return c; }
function endOfDay(d: Date) { const c = new Date(d); c.setHours(23,59,59,999); return c; }
function withinDay(t: string | null, day: Date) {
  if (!t) return false;
  const ts = new Date(t).getTime();
  return ts >= startOfDay(day).getTime() && ts <= endOfDay(day).getTime();
}
function inHouse(b: HotelBookingRow, day: Date) {
  // In-house if checked_in/in_progress and start_at <= end of today and (no end_at or end_at > start of today)
  const startsBy = new Date(b.start_at).getTime() <= endOfDay(day).getTime();
  const endsAfter = !b.end_at || new Date(b.end_at).getTime() > startOfDay(day).getTime();
  return startsBy && endsAfter && (b.status === "checked_in" || b.status === "in_progress" || b.status === "grooming");
}

export function TodayPanel({
  tenantId, bookings, quotes = [], resources, today,
}: {
  tenantId: string | null;
  bookings: HotelBookingRow[];
  quotes?: HotelQuoteRow[];
  resources: HotelResourceRow[];
  today: Date;
}) {
  const confirm = useConfirm();
  const updateStatus = useUpdateBookingStatus(tenantId ?? "");
  const settingsQ = useHotelWorkflowSettings(tenantId);
  const gateMode = settingsQ.data?.vax_gate_mode ?? "soft";

  const arrivals = useMemo(
    () =>
      bookings.filter(
        (b) =>
          withinDay(b.start_at, today) &&
          ["confirmed", "approved", "requested", "pending_payment"].includes(b.status),
      ),
    [bookings, today],
  );
  const upcomingQuotes = useMemo(() => {
    const from = startOfDay(today).getTime();
    const to = from + 7 * 86_400_000;
    return quotes
      .filter((q) => {
        const s = new Date(q.start_at).getTime();
        return s >= from && s < to;
      })
      .sort((a, z) => new Date(a.start_at).getTime() - new Date(z.start_at).getTime());
  }, [quotes, today]);

  const departures = useMemo(
    () => bookings.filter((b) => withinDay(b.end_at, today) && b.status !== "checked_out" && b.status !== "cancelled" && b.status !== "completed"),
    [bookings, today],
  );
  const currentlyInHouse = useMemo(() => bookings.filter((b) => inHouse(b, today)), [bookings, today]);

  // Count pets, not bookings — a family booking of 3 dogs uses 3 spaces.
  const petsInHouse = useMemo(
    () => currentlyInHouse.reduce((sum, b) => sum + Math.max(1, b.pets.length), 0),
    [currentlyInHouse],
  );
  const totalCapacity = resources.reduce((sum, r) => sum + (r.capacity ?? 0), 0);
  const capacitySet = resources.some((r) => r.capacity != null);
  const utilisation = totalCapacity ? Math.round((petsInHouse / totalCapacity) * 100) : 0;

  async function doCheckIn(b: HotelBookingRow) {
    if (gateMode !== "off" && b.pets.length) {
      const check = await checkVaccinations(b.pets.map((p) => p.id));
      if (!check.ok) {
        const parts: string[] = [];
        if (check.missing.length) parts.push(`Missing: ${check.missing.join(", ")}`);
        if (check.expired.length) parts.push(`Expired: ${check.expired.join(", ")}`);
        if (gateMode === "hard") {
          toast.error(`Cannot check in — vaccinations not up to date. ${parts.join(" · ")}`);
          return;
        }
        if (!(await confirm({ title: "Vaccinations not up to date", description: `${parts.join(" · ")}. Continue and log override?`, confirmLabel: "Continue & override" }))) return;
        try {
          await logVaccinationOverride({ tenantId: tenantId!, bookingId: b.id, note: `Hotel check-in override. ${parts.join(" · ")}` });
        } catch (err: any) {
          toast.error(err?.message ?? "Failed to log override");
        }
      }
    }
    try {
      await updateStatus.mutateAsync({ bookingId: b.id, status: "checked_in" });
      toast.success(`${b.pets[0]?.name ?? "Pet"} checked in`);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to check in");
    }
  }

  async function doCheckOut(b: HotelBookingRow) {
    try {
      await updateStatus.mutateAsync({ bookingId: b.id, status: "checked_out" });
      toast.success(`${b.pets[0]?.name ?? "Pet"} checked out`);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to check out");
    }
  }

  return (
    <PaymentFlagsProvider bookingIds={[...arrivals, ...departures].map((b) => b.id)}>
    <StayPlayFlagsProvider tenantId={tenantId} bookingIds={[...arrivals, ...departures].map((b) => b.id)}>
    <div className="space-y-4">
      {/* Utilisation card */}
      <div className="sk-card p-5">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-sk-orange-soft text-sk-orange">
            <Hotel className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <div className="text-2xl font-semibold tabular-nums">
              {petsInHouse}
              {capacitySet && <span className="text-sm text-muted-foreground"> / {totalCapacity}</span>}
            </div>
            <div className="text-xs text-muted-foreground">
              {capacitySet
                ? `Pets in-house · ${utilisation}% occupied`
                : "Pets in-house · set pens/spaces in Settings → Resources"}
            </div>
          </div>
        </div>
      </div>

      {/* Arrivals */}
      <Panel title="Arrivals today" empty="No arrivals scheduled." icon={<LogIn className="h-4 w-4" />}>
        {arrivals.map((b) => (
          <BookingRow
            key={b.id}
            b={b}
            timeLabel={b.start_at ? new Date(b.start_at).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" }) : "—"}
            action={
              <button
                onClick={() => doCheckIn(b)}
                disabled={updateStatus.isPending}
                className="h-8 rounded-md bg-sk-turquoise px-3 text-xs font-semibold text-white hover:bg-sk-turquoise/90 disabled:opacity-50"
              >
                Check in
              </button>
            }
          />
        ))}
      </Panel>

      {/* Departures */}
      <Panel title="Departures today" empty="No departures scheduled." icon={<LogOut className="h-4 w-4" />}>
        {departures.map((b) => (
          <BookingRow
            key={b.id}
            b={b}
            timeLabel={b.end_at ? new Date(b.end_at).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" }) : "—"}
            action={
              <button
                onClick={() => doCheckOut(b)}
                disabled={updateStatus.isPending}
                className="h-8 rounded-md bg-sk-orange px-3 text-xs font-semibold text-white hover:bg-sk-orange/90 disabled:opacity-50"
              >
                Check out
              </button>
            }
          />
        ))}
      </Panel>

      {/* Quotes holding dates */}
      <Panel
        title="Quotes holding dates (7 days)"
        empty="No quotes holding dates."
        icon={<FileText className="h-4 w-4" />}
      >
        {upcomingQuotes.map((q) => (
          <li key={q.id} className="flex items-center gap-3 px-4 py-3">
            <div className="w-14 text-xs font-semibold tabular-nums text-muted-foreground">
              {new Date(q.start_at).toLocaleDateString("en-ZA", { day: "2-digit", month: "short" })}
            </div>
            <div className="min-w-0 flex-1">
              <Link to={`/admin/quotes/${q.id}`} className="block truncate text-sm font-medium hover:underline">
                {q.petNames.join(", ") || "Pet"}{" "}
                <span className="font-normal text-muted-foreground">· {q.customer?.full_name ?? "—"}</span>
              </Link>
              <div className="truncate text-[11px] text-muted-foreground">
                {q.estimate_number}
                {q.total != null ? ` · R${q.total.toFixed(2)}` : ""}
                {q.hold_expires_at
                  ? ` · hold until ${new Date(q.hold_expires_at).toLocaleDateString("en-ZA", { day: "2-digit", month: "short" })}`
                  : ""}
              </div>
            </div>
            <span className="shrink-0 rounded bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
              {q.status}
            </span>
          </li>
        ))}
      </Panel>

    </div>
    </StayPlayFlagsProvider>
    </PaymentFlagsProvider>
  );
}

function Panel({ title, empty, icon, children }: { title: string; empty: string; icon: React.ReactNode; children: React.ReactNode }) {
  const arr = Array.isArray(children) ? children : [children];
  const hasKids = arr.some(Boolean) && arr.length > 0 && (arr as any[]).filter((x) => x).length > 0;
  return (
    <div className="sk-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-semibold">
        {icon}
        {title}
      </div>
      {hasKids ? (
        <ul className="divide-y divide-border">{children}</ul>
      ) : (
        <div className="px-4 py-6 text-center text-xs text-muted-foreground">{empty}</div>
      )}
    </div>
  );
}

function BookingRow({ b, timeLabel, action }: { b: HotelBookingRow; timeLabel: string; action: React.ReactNode }) {
  const petName = b.pets[0]?.name ?? "Pet";
  const extraPets = b.pets.length > 1 ? ` +${b.pets.length - 1}` : "";
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <div className="w-14 text-sm font-semibold tabular-nums">{timeLabel}</div>
      <div className="flex-1 min-w-0">
        <Link
          to={`/admin/bookings/${b.id}`}
          state={{ from: "/admin/hotel-cattery" }}
          className="text-sm font-medium hover:underline truncate block"
        >
          {petName}{extraPets} <span className="text-muted-foreground font-normal">· {b.customer?.full_name ?? "—"}</span>
        </Link>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="truncate">{b.resource?.name ?? "Unassigned"} · {b.booking_number}</span>
          <PaymentChip bookingId={b.id} />
          <StayPlayChip bookingId={b.id} />
        </div>
      </div>
      {action}
    </li>
  );
}