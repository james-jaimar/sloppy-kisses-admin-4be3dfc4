import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import type { BookingStatus, ServiceType } from "./queries";

/** Services where a van has to physically drive to the customer. */
export const VAN_SERVICE_TYPES: ServiceType[] = ["grooming_mobile", "pickup_dropoff"];

export function bookingNeedsAddress(serviceType: string | null | undefined): boolean {
  return VAN_SERVICE_TYPES.includes(serviceType as ServiceType);
}

export type AddressState = "routable" | "unverified" | "missing" | "not_required";

export interface AddressGateInput {
  service_type?: string | null;
  service_address_id?: string | null;
  service_place_id?: string | null;
  /** Optional joined customer address — used when we can check the live record. */
  address?: { google_place_id?: string | null; latitude?: number | null; longitude?: number | null } | null;
}

/**
 * A van job is only routable when the booking points at an address that Google
 * has pinned (place id present). Anything else is treated as "no address".
 */
export function bookingAddressState(b: AddressGateInput): AddressState {
  if (!bookingNeedsAddress(b.service_type)) return "not_required";
  if (!b.service_address_id) return "missing";
  const placeId = b.address ? b.address.google_place_id : b.service_place_id;
  return placeId ? "routable" : "unverified";
}

export const ADDRESS_GATE_COPY: Record<Exclude<AddressState, "not_required" | "routable">, string> = {
  missing: "No address on this booking. The van has nowhere to drive to.",
  unverified: "This address has never been confirmed on Google Maps, so the van cannot be routed to it.",
};

/** Statuses that no longer need a driver. */
const DEAD_STATUSES: BookingStatus[] = ["cancelled", "no_show", "completed", "checked_out"];

export interface MissingAddressBooking {
  id: string;
  booking_number: string;
  status: BookingStatus;
  service_type: ServiceType;
  start_at: string | null;
  customer_id: string;
  service_address_id: string | null;
  service_place_id: string | null;
  state: Exclude<AddressState, "not_required" | "routable">;
  customer: { id: string; full_name: string | null; mobile: string | null } | null;
  resource: { id: string; name: string } | null;
  pets: { id: string; name: string | null }[];
}

/**
 * Every future mobile-grooming / pickup-drop-off booking that has no address a
 * van can navigate to.
 */
export function useBookingsMissingAddress(
  tenantId: string | null | undefined,
  opts: { withinDays?: number } = {},
) {
  const { withinDays } = opts;
  const fromIso = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
  const toIso = withinDays
    ? new Date(new Date().setHours(0, 0, 0, 0) + withinDays * 86400000).toISOString()
    : null;
  return useQuery({
    queryKey: ["bookings", "missing-address", tenantId, fromIso.slice(0, 10), withinDays ?? "all"],
    enabled: Boolean(tenantId),
    staleTime: 60_000,
    queryFn: async (): Promise<MissingAddressBooking[]> => {
      let q = supabase
        .from("bookings")
        .select(
          `id, booking_number, status, service_type, start_at, customer_id,
           service_address_id, service_place_id,
           customer:customers(id, full_name, mobile),
           resource:resources(id, name),
           booking_pets(pet:pets(id, name)),
           address:customer_addresses(id, google_place_id, latitude, longitude)`,
        )
        .eq("tenant_id", tenantId as string)
        .in("service_type", VAN_SERVICE_TYPES as any)
        .gte("start_at", fromIso)
        .order("start_at", { ascending: true });
      if (toIso) q = q.lt("start_at", toIso);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? [])
        .filter((b: any) => !DEAD_STATUSES.includes(b.status))
        .map((b: any) => ({
          ...b,
          state: bookingAddressState(b) as any,
          customer: b.customer ?? null,
          resource: b.resource ?? null,
          pets: (b.booking_pets ?? []).map((bp: any) => bp.pet).filter(Boolean),
        }))
        .filter((b: any) => b.state === "missing" || b.state === "unverified");
    },
  });
}

/** Just the count, for badges and dashboard tiles. */
export function useMissingAddressCount(tenantId: string | null | undefined, withinDays?: number) {
  const q = useBookingsMissingAddress(tenantId, { withinDays });
  return { count: q.data?.length ?? 0, isLoading: q.isLoading };
}