import { useState } from "react";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { Scissors } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { useHotelGroomPendingCount } from "@/features/hotelGrooming/queries";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import { OccupancyGrid } from "./OccupancyGrid";
import { TodayPanel } from "./TodayPanel";
import { useHotelBookingsInWindow, useHotelResources } from "./queries";

function startOfDay(d: Date) { const c = new Date(d); c.setHours(0,0,0,0); return c; }
function addDays(d: Date, n: number) { const c = new Date(d); c.setDate(c.getDate() + n); return c; }
function fmtDay(d: Date) {
  return d.toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });
}

const WINDOW_DAYS = 14;

export default function HotelBoardPage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const [anchor, setAnchor] = useState<Date>(() => startOfDay(new Date()));

  const windowStart = anchor;
  const windowEnd = addDays(anchor, WINDOW_DAYS);

  const resourcesQ = useHotelResources(tenantId);
  const bookingsQ = useHotelBookingsInWindow({ tenantId, windowStart, windowEnd });

  const today = startOfDay(new Date());

  return (
    <>
      <AppHeader
        title="Hotel & Cattery"
        subtitle="Occupancy across kennels, runs and cattery pens."
        actions={
          <div className="flex items-center gap-2">
            <Link
              to="/admin/hotel-cattery/grooms"
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-white px-3 text-sm font-medium hover:bg-sk-surface-muted"
            >
              <Scissors className="h-4 w-4" /> Grooms to schedule
              {(groomQ.data ?? 0) > 0 && (
                <span className="rounded-full bg-sk-orange px-1.5 text-[11px] font-semibold text-white">
                  {groomQ.data}
                </span>
              )}
            </Link>
            <button
              onClick={() => setAnchor(startOfDay(new Date()))}
              className="h-9 rounded-lg border border-border bg-white px-3 text-sm font-medium hover:bg-sk-surface-muted"
            >
              Today
            </button>
            <div className="inline-flex overflow-hidden rounded-lg border border-border bg-white">
              <button onClick={() => setAnchor((d) => addDays(d, -7))} className="grid h-9 w-9 place-items-center hover:bg-sk-surface-muted" title="Back 7 days">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="grid h-9 min-w-[260px] place-items-center border-x border-border px-3 text-sm font-semibold">
                {fmtDay(windowStart)} → {fmtDay(addDays(windowEnd, -1))}
              </div>
              <button onClick={() => setAnchor((d) => addDays(d, 7))} className="grid h-9 w-9 place-items-center hover:bg-sk-surface-muted" title="Forward 7 days">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <button
              onClick={() => setAnchor((d) => new Date(d))}
              title="Refresh"
              className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-white hover:bg-sk-surface-muted"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        }
      />
      <div className="flex-1 space-y-6 p-6">
        <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <OccupancyGrid
            resources={resourcesQ.data ?? []}
            bookings={bookingsQ.data ?? []}
            windowStart={windowStart}
            windowDays={WINDOW_DAYS}
            loading={resourcesQ.isLoading || bookingsQ.isLoading}
          />
          <TodayPanel
            tenantId={tenantId}
            bookings={bookingsQ.data ?? []}
            resources={resourcesQ.data ?? []}
            today={today}
          />
        </div>
      </div>
    </>
  );
}