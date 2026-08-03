import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, RefreshCw, Truck } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import {
  useMobileBookingsForDay, useMobileVans, useVanWorkflowSettings,
} from "./queries";
import { VanTimeline } from "./VanTimeline";
import { PaymentFlagsProvider } from "@/features/shared/payments/paymentFlags";
import { StayPlayFlagsProvider } from "@/features/daycare/StayPlayBadge";
import { RouteSummary } from "./RouteSummary";
import { UnassignedStrip } from "./UnassignedStrip";

function startOfDay(d: Date) { const c = new Date(d); c.setHours(0,0,0,0); return c; }
function addDays(d: Date, n: number) { const c = new Date(d); c.setDate(c.getDate() + n); return c; }
function fmtDay(d: Date) {
  return d.toLocaleDateString("en-ZA", { weekday: "long", day: "2-digit", month: "short", year: "numeric" });
}

export default function MobileVansPage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const [day, setDay] = useState<Date>(() => startOfDay(new Date()));
  const [selectedVanId, setSelectedVanId] = useState<string | null>(null);

  const vansQ = useMobileVans(tenantId);
  const bookingsQ = useMobileBookingsForDay({ tenantId, day });
  const settingsQ = useVanWorkflowSettings(tenantId);

  const vans = vansQ.data ?? [];
  const activeVanId = selectedVanId ?? vans[0]?.id ?? null;
  const activeVan = vans.find((v) => v.id === activeVanId) ?? null;

  const stops = useMemo(
    () => (bookingsQ.data ?? []).filter((b) => b.resource_id === activeVanId),
    [bookingsQ.data, activeVanId],
  );
  const unassigned = useMemo(
    () => (bookingsQ.data ?? []).filter((b) => !b.resource_id),
    [bookingsQ.data],
  );

  const minGap = settingsQ.data?.min_travel_gap_minutes ?? 15;
  const maxGap = settingsQ.data?.max_travel_gap_minutes ?? 90;

  return (
    <>
      <AppHeader
        title="Mobile vans"
        subtitle="Day-by-day route for each grooming van."
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDay(startOfDay(new Date()))}
              className="h-9 rounded-lg border border-border bg-white px-3 text-sm font-medium hover:bg-sk-surface-muted"
            >
              Today
            </button>
            <div className="inline-flex overflow-hidden rounded-lg border border-border bg-white">
              <button onClick={() => setDay((d) => addDays(d, -1))} className="grid h-9 w-9 place-items-center hover:bg-sk-surface-muted">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="grid h-9 min-w-[220px] place-items-center border-x border-border px-3 text-sm font-semibold">
                {fmtDay(day)}
              </div>
              <button onClick={() => setDay((d) => addDays(d, 1))} className="grid h-9 w-9 place-items-center hover:bg-sk-surface-muted">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <button
              onClick={() => setDay((d) => new Date(d))}
              title="Refresh"
              className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-white hover:bg-sk-surface-muted"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        }
      />
      <div className="flex-1 space-y-6 p-6">
        {vans.length === 0 ? (
          <div className="sk-card grid place-items-center gap-2 p-12 text-center text-sm text-muted-foreground">
            <Truck className="h-8 w-8 text-muted-foreground/60" />
            No mobile vans configured yet. Add one under Settings → Resources.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {vans.map((v) => {
                const count = (bookingsQ.data ?? []).filter((b) => b.resource_id === v.id).length;
                const active = v.id === activeVanId;
                return (
                  <button
                    key={v.id}
                    onClick={() => setSelectedVanId(v.id)}
                    className={
                      active
                        ? "inline-flex items-center gap-2 rounded-lg bg-sk-coral px-3 h-9 text-sm font-semibold text-white"
                        : "inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 h-9 text-sm font-medium hover:bg-sk-surface-muted"
                    }
                  >
                    <Truck className="h-4 w-4" />
                    {v.name}
                    <span className={active ? "rounded-full bg-white/20 px-1.5 text-xs" : "rounded-full bg-muted px-1.5 text-xs text-muted-foreground"}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
              <PaymentFlagsProvider bookingIds={stops.map((s) => s.id)}>
                <StayPlayFlagsProvider tenantId={tenantId} bookingIds={stops.map((s) => s.id)}>
                  <VanTimeline stops={stops} minGap={minGap} maxGap={maxGap} />
                </StayPlayFlagsProvider>
              </PaymentFlagsProvider>
              <RouteSummary
                tenantId={tenantId}
                van={activeVan}
                stops={stops}
                minGap={minGap}
                maxGap={maxGap}
              />
            </div>

            <UnassignedStrip tenantId={tenantId} vans={vans} unassigned={unassigned} />
          </>
        )}
      </div>
    </>
  );
}