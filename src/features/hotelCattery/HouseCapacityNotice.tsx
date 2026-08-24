import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, BedDouble } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { isoDate } from "./queries";

export interface HouseDayRow {
  day: string;
  capacity: number;
  used: number;
}

/**
 * House-wide nightly availability for the portal: total spaces for the species
 * (dog kennels vs cattery pens) against pets already booked in.
 */
export function useHotelHouseAvailability(params: {
  tenantId: string | null | undefined;
  start: Date | null;
  end: Date | null;
  species?: "dog" | "cat";
  enabled?: boolean;
}) {
  const { tenantId, start, end, species = "dog", enabled = true } = params;
  const s = start ? isoDate(start) : null;
  const e = end ? isoDate(end) : null;
  return useQuery({
    queryKey: ["hotel_house_availability", tenantId, s, e, species],
    enabled: Boolean(tenantId && s && e && enabled),
    queryFn: async (): Promise<HouseDayRow[]> => {
      const { data, error } = await supabase.rpc("hotel_house_availability" as any, {
        p_tenant_id: tenantId as string,
        p_start: s as string,
        p_end: e as string,
        p_species: species,
      } as any);
      if (error) throw error;
      return (data ?? []) as HouseDayRow[];
    },
  });
}

function fmt(day: string) {
  const d = new Date(`${day}T00:00:00`);
  return d.toLocaleDateString("en-ZA", { day: "2-digit", month: "short" });
}

/** Nights where adding `petCount` pets would push us past the house capacity. */
export function fullNights(rows: HouseDayRow[] | undefined, petCount: number) {
  if (!rows?.length || petCount <= 0) return [];
  return rows.filter((r) => Number(r.capacity) > 0 && Number(r.used) + petCount > Number(r.capacity));
}

export function HouseCapacityNotice({
  rows,
  petCount,
  mode,
  loading,
}: {
  rows: HouseDayRow[] | undefined;
  petCount: number;
  mode: "warn" | "block";
  loading?: boolean;
}) {
  if (loading || !rows?.length || petCount <= 0) return null;
  const over = fullNights(rows, petCount);

  if (over.length === 0) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <BedDouble className="h-3.5 w-3.5" />
        Space available for every night of this stay.
      </div>
    );
  }

  const blocked = mode === "block";
  return (
    <div
      className={
        "flex items-start gap-2 rounded-lg border p-3 text-xs " +
        (blocked
          ? "border-destructive/40 bg-destructive/5 text-destructive"
          : "border-sk-orange bg-sk-orange-soft text-sk-orange")
      }
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div>
        <div className="font-semibold">
          {blocked ? "We're fully booked on some of these nights" : "These nights are tight"}
        </div>
        <div className="opacity-90">
          {over.slice(0, 6).map((r) => fmt(r.day)).join(", ")}
          {over.length > 6 ? ` and ${over.length - 6} more` : ""} —{" "}
          {blocked
            ? "please pick different dates or call us to go on the waiting list."
            : "we'll confirm space as soon as we can."}
        </div>
      </div>
    </div>
  );
}
