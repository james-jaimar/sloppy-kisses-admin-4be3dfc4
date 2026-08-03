import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, RefreshCw, Truck } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import {
  useTransportLegsForDay, useTransportVehicles, useTransportWorkflowSettings,
} from "./queries";
import { TransportColumns } from "./TransportColumns";
import { TransportSummary } from "./TransportSummary";
import { UnassignedTransportStrip } from "./UnassignedTransportStrip";

function startOfDay(d: Date) { const c = new Date(d); c.setHours(0,0,0,0); return c; }
function addDays(d: Date, n: number) { const c = new Date(d); c.setDate(c.getDate() + n); return c; }
function fmtDay(d: Date) {
  return d.toLocaleDateString("en-ZA", { weekday: "long", day: "2-digit", month: "short", year: "numeric" });
}

export default function TransportBoardPage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const [day, setDay] = useState<Date>(() => startOfDay(new Date()));
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);

  const vehiclesQ = useTransportVehicles(tenantId);
  const legsQ = useTransportLegsForDay({ tenantId, day });
  const settingsQ = useTransportWorkflowSettings(tenantId);

  const vehicles = vehiclesQ.data ?? [];
  const activeVehicleId = selectedVehicleId ?? vehicles[0]?.id ?? null;
  const activeVehicle = vehicles.find((v) => v.id === activeVehicleId) ?? null;

  const legs = useMemo(
    () => (legsQ.data ?? []).filter((l) => l.resource_id === activeVehicleId),
    [legsQ.data, activeVehicleId],
  );
  const unassigned = useMemo(
    () => (legsQ.data ?? []).filter((l) => !l.resource_id),
    [legsQ.data],
  );

  const minGap = settingsQ.data?.min_leg_gap_minutes ?? 15;
  const maxGap = settingsQ.data?.max_leg_gap_minutes ?? 120;

  return (
    <>
      <AppHeader
        title="Pick Up / Drop Off"
        subtitle="Daily transport schedule across the pick-up / drop-off vehicles."
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
        {vehicles.length === 0 ? (
          <div className="sk-card grid place-items-center gap-2 p-12 text-center text-sm text-muted-foreground">
            <Truck className="h-8 w-8 text-muted-foreground/60" />
            No pick-up / drop-off vehicles configured yet. Add one under Settings → Resources.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {vehicles.map((v) => {
                const count = (legsQ.data ?? []).filter((l) => l.resource_id === v.id).length;
                const active = v.id === activeVehicleId;
                return (
                  <button
                    key={v.id}
                    onClick={() => setSelectedVehicleId(v.id)}
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
              <TransportColumns legs={legs} tenantId={tenantId} />
              <TransportSummary
                tenantId={tenantId}
                vehicle={activeVehicle}
                legs={legs}
                minGap={minGap}
                maxGap={maxGap}
              />
            </div>

            <UnassignedTransportStrip tenantId={tenantId} vehicles={vehicles} unassigned={unassigned} />
          </>
        )}
      </div>
    </>
  );
}