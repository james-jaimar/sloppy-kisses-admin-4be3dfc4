import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, MapPin } from "lucide-react";
import { supabase } from "@/lib/supabase/client";

export interface RadiusCheck {
  has_base: boolean;
  radius_km: number;
  distance_km: number | null;
  gate_mode: "off" | "warn" | "block";
  outside: boolean;
}

/** Distance from the depot to a collection address, using the tenant's travel radius. */
export function useRadiusCheck(
  tenantId: string | null,
  lat: number | null | undefined,
  lng: number | null | undefined,
) {
  return useQuery({
    queryKey: ["transport-radius", tenantId, lat, lng],
    enabled: Boolean(tenantId && lat != null && lng != null),
    queryFn: async (): Promise<RadiusCheck> => {
      const { data, error } = await (supabase as any).rpc("transport_radius_check", {
        p_tenant_id: tenantId,
        p_lat: lat,
        p_lng: lng,
      });
      if (error) throw error;
      return data as RadiusCheck;
    },
  });
}

export function ServiceRadiusNotice({ check }: { check: RadiusCheck | undefined }) {
  if (!check || !check.has_base || check.gate_mode === "off" || check.distance_km == null) return null;

  const km = check.distance_km.toFixed(1);
  if (!check.outside) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <MapPin className="h-3.5 w-3.5" />
        {km} km from base — inside the {check.radius_km} km travel radius.
      </div>
    );
  }

  return (
    <div
      className={
        "flex items-start gap-2 rounded-lg border p-3 text-xs " +
        (check.gate_mode === "block"
          ? "border-destructive/40 bg-destructive/5 text-destructive"
          : "border-amber-300 bg-amber-50 text-amber-800")
      }
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div>
        This address is {km} km from base, outside the {check.radius_km} km travel radius.
        {check.gate_mode === "block"
          ? " Out-of-area collections need an admin override."
          : " Confirm the trip is worth the extra travel."}
      </div>
    </div>
  );
}