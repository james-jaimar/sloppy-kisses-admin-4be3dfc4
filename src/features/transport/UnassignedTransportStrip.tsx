import { toast } from "sonner";
import { Link } from "react-router-dom";
import { AlertTriangle, PawPrint } from "lucide-react";
import { useAssignLegToVehicle, type TransportLeg, type TransportVehicle } from "./queries";

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });
}

export function UnassignedTransportStrip({
  tenantId, vehicles, unassigned,
}: {
  tenantId: string | null;
  vehicles: TransportVehicle[];
  unassigned: TransportLeg[];
}) {
  const assign = useAssignLegToVehicle(tenantId ?? "");

  if (!unassigned.length) return null;

  async function doAssign(bookingId: string, resourceId: string) {
    try {
      await assign.mutateAsync({ bookingId, resourceId });
      toast.success("Assigned to vehicle");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to assign");
    }
  }

  return (
    <div className="sk-card p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-sk-orange">
        <AlertTriangle className="h-4 w-4" />
        Unassigned transport legs ({unassigned.length})
      </div>
      <ul className="flex gap-3 overflow-x-auto pb-1">
        {unassigned.map((l) => {
          const dir = l.details?.direction;
          const suburb = l.details?.suburb ?? l.customer?.suburb ?? "no suburb";
          return (
            <li key={l.id} className="min-w-[240px] max-w-[260px] shrink-0 rounded-lg border border-border bg-white p-3">
              <Link
                to={`/admin/bookings/${l.id}`}
                state={{ from: "/admin/pickup-dropoff" }}
                className="block hover:underline"
              >
                <div className="flex items-center gap-1.5 text-sm font-semibold">
                  <PawPrint className="h-3.5 w-3.5 text-sk-coral" />
                  <span className="truncate">{l.pets[0]?.name ?? "Unnamed pet"}</span>
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {fmtTime(l.start_at)} · {dir ?? "?"} · {suburb}
                </div>
              </Link>
              <select
                defaultValue=""
                disabled={assign.isPending}
                onChange={(e) => {
                  const rid = e.target.value;
                  if (rid) doAssign(l.id, rid);
                }}
                className="mt-2 h-8 w-full rounded-md border border-border bg-white px-2 text-xs"
              >
                <option value="" disabled>Assign to vehicle…</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </li>
          );
        })}
      </ul>
    </div>
  );
}