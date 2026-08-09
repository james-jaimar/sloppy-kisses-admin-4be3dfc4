import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type BookingRow = Database["public"]["Tables"]["bookings"]["Row"];
export type BookingInsert = Database["public"]["Tables"]["bookings"]["Insert"];
export type BookingUpdate = Database["public"]["Tables"]["bookings"]["Update"];

export type BookingStatus =
  | "draft"
  | "requested"
  | "needs_info"
  | "approved"
  | "confirmed"
  | "checked_in"
  | "in_progress"
  | "grooming"
  | "ready"
  | "checked_out"
  | "completed"
  | "cancelled"
  | "no_show";

export type ServiceType =
  | "daycare"
  | "daycare_assessment"
  | "hotel_dog"
  | "hotel_cat"
  | "grooming_inhouse"
  | "grooming_mobile"
  | "pickup_dropoff";

export type ResourceType =
  | "inhouse_grooming"
  | "mobile_van"
  | "transport_vehicle"
  | "daycare_area"
  | "hotel_area"
  | "cattery_area";

export interface BookingListRow {
  id: string;
  booking_number: string;
  status: BookingStatus;
  service_type: ServiceType;
  start_at: string | null;
  end_at: string | null;
  start_date: string | null;
  end_date: string | null;
  resource_id: string | null;
  customer_id: string;
  notes_internal: string | null;
  notes_customer: string | null;
  requires_transport: boolean;
  requires_grooming: boolean;
  service_address_id: string | null;
  service_address_text: string | null;
  service_place_id: string | null;
  service_suburb: string | null;
  service_city: string | null;
  service_postcode: string | null;
  created_at: string;
  updated_at: string;
  recurring_rule_id: string | null;
  customer: {
    id: string;
    customer_number: string | null;
    full_name: string | null;
    email: string | null;
    mobile: string | null;
  } | null;
  resource: { id: string; name: string; type: ResourceType } | null;
  booking_pets: {
    pet: { id: string; pet_number: string | null; name: string | null; species: string | null; breed: string | null } | null;
  }[];
}

const BOOKING_SELECT = `
  id, booking_number, status, service_type, start_at, end_at, start_date, end_date,
  resource_id, customer_id, notes_internal, notes_customer, requires_transport,
  requires_grooming, service_address_id, service_address_text, service_place_id,
  service_suburb, service_city, service_postcode,
  created_at, updated_at, recurring_rule_id,
  customer:customers(id, customer_number, full_name, email, mobile),
  resource:resources(id, name, type),
  booking_pets(pet:pets(id, pet_number, name, species, breed))
` as const;

export function useResources(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["resources", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resources")
        .select("id, name, type, active, sort_order")
        .eq("tenant_id", tenantId as string)
        .eq("active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; type: ResourceType; active: boolean; sort_order: number }[];
    },
  });
}

export function useBookingsByRange(params: {
  tenantId: string | null | undefined;
  from: string; // ISO datetime
  to: string;   // ISO datetime
  serviceTypes?: ServiceType[];
  resourceIds?: string[];
  statuses?: BookingStatus[];
}) {
  const { tenantId, from, to, serviceTypes, resourceIds, statuses } = params;
  return useQuery({
    queryKey: ["bookings", "range", tenantId, from, to, serviceTypes, resourceIds, statuses],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<BookingListRow[]> => {
      let q = supabase
        .from("bookings")
        .select(BOOKING_SELECT)
        .eq("tenant_id", tenantId as string)
        .gte("start_at", from)
        .lt("start_at", to)
        .order("start_at", { ascending: true })
        .limit(1000);
      if (serviceTypes?.length) q = q.in("service_type", serviceTypes as any);
      if (resourceIds?.length) q = q.in("resource_id", resourceIds);
      if (statuses?.length) q = q.in("status", statuses as any);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as BookingListRow[];
    },
  });
}

export function useBookingDetail(bookingId: string | null | undefined, tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["bookings", "detail", tenantId, bookingId],
    enabled: Boolean(bookingId) && Boolean(tenantId),
    queryFn: async (): Promise<BookingListRow | null> => {
      const { data, error } = await supabase
        .from("bookings")
        .select(BOOKING_SELECT)
        .eq("id", bookingId as string)
        .eq("tenant_id", tenantId as string)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as BookingListRow | null;
    },
  });
}

export function useBookingsList(params: {
  tenantId: string | null | undefined;
  search?: string;
  serviceType?: ServiceType | "all";
  status?: BookingStatus | "all";
  pageSize?: number;
}) {
  const { tenantId, search = "", serviceType = "all", status = "all", pageSize = 200 } = params;
  return useQuery({
    queryKey: ["bookings", "list", tenantId, search, serviceType, status, pageSize],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<BookingListRow[]> => {
      const s = search.trim();

      let customerIds: string[] = [];
      let petIds: string[] = [];
      if (s) {
        const q = `%${s}%`;
        const [{ data: cids }, { data: pids }] = await Promise.all([
          supabase
            .from("customers")
            .select("id")
            .eq("tenant_id", tenantId as string)
            .or(`full_name.ilike.${q},customer_number.ilike.${q}`)
            .limit(500),
          supabase
            .from("pets")
            .select("id")
            .eq("tenant_id", tenantId as string)
            .or(`name.ilike.${q},pet_number.ilike.${q}`)
            .limit(500),
        ]);
        customerIds = (cids ?? []).map((c: any) => c.id);
        petIds = (pids ?? []).map((p: any) => p.id);
      }

      let bookingIdsFromPets: string[] | null = null;
      if (s && petIds.length) {
        const { data: bp } = await supabase
          .from("booking_pets")
          .select("booking_id")
          .eq("tenant_id", tenantId as string)
          .in("pet_id", petIds)
          .limit(1000);
        bookingIdsFromPets = (bp ?? []).map((r: any) => r.booking_id);
      }

      let q = supabase
        .from("bookings")
        .select(BOOKING_SELECT)
        .eq("tenant_id", tenantId as string)
        .order("start_at", { ascending: false, nullsFirst: false })
        .limit(pageSize);

      if (serviceType !== "all") q = q.eq("service_type", serviceType as any);
      if (status !== "all") q = q.eq("status", status as any);

      if (s) {
        const parts: string[] = [
          `booking_number.ilike.%${s}%`,
          `notes_internal.ilike.%${s}%`,
        ];
        if (customerIds.length) parts.push(`customer_id.in.(${customerIds.join(",")})`);
        const orIds = new Set<string>(bookingIdsFromPets ?? []);
        if (orIds.size) parts.push(`id.in.(${Array.from(orIds).join(",")})`);
        q = q.or(parts.join(","));
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as BookingListRow[];
    },
  });
}

export interface CreateBookingInput {
  customer_id: string;
  pet_ids: string[];
  service_type: ServiceType;
  status?: BookingStatus;
  start_at: string; // ISO
  end_at: string;   // ISO
  resource_id?: string | null;
  notes_internal?: string | null;
  notes_customer?: string | null;
  source?: "website_form" | "customer_portal" | "staff_capture" | "email" | "phone" | "whatsapp" | null;
  requires_transport?: boolean;
  requires_grooming?: boolean;
  /** Optional explicit service address. Defaults to customer's primary address. */
  service_address_id?: string | null;
}

export function useCreateBooking(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateBookingInput) => {
      // Get next booking number
      const { data: numData, error: numErr } = await (supabase as any).rpc("next_booking_number", {
        target_tenant_id: tenantId,
      });
      if (numErr) throw numErr;
      const booking_number = numData as string;

      const startDate = input.start_at.slice(0, 10);
      const endDate = input.end_at.slice(0, 10);

      // Snapshot the customer's selected or primary address onto the booking.
      let addressSnapshot: {
        service_address_id?: string | null;
        service_address_text?: string | null;
        service_place_id?: string | null;
        service_suburb?: string | null;
        service_city?: string | null;
        service_postcode?: string | null;
      } = {};
      const addressId = input.service_address_id;
      if (addressId) {
        const { data: addr } = await supabase
          .from("customer_addresses")
          .select("id, formatted_address, address_line_2, google_place_id, suburb, city, postcode")
          .eq("id", addressId)
          .eq("tenant_id", tenantId)
          .maybeSingle();
        if (addr) {
          addressSnapshot = {
            service_address_id: addr.id,
            service_address_text: [addr.address_line_2, addr.formatted_address].filter(Boolean).join(", "),
            service_place_id: addr.google_place_id,
            service_suburb: addr.suburb,
            service_city: addr.city,
            service_postcode: addr.postcode,
          };
        }
      } else {
        const { data: addr } = await supabase
          .from("customer_addresses")
          .select("id, formatted_address, address_line_2, google_place_id, suburb, city, postcode")
          .eq("customer_id", input.customer_id)
          .eq("tenant_id", tenantId)
          .eq("is_primary", true)
          .maybeSingle();
        if (addr) {
          addressSnapshot = {
            service_address_id: addr.id,
            service_address_text: [addr.address_line_2, addr.formatted_address].filter(Boolean).join(", "),
            service_place_id: addr.google_place_id,
            service_suburb: addr.suburb,
            service_city: addr.city,
            service_postcode: addr.postcode,
          };
        }
      }

      const { data: created, error } = await supabase
        .from("bookings")
        .insert({
          tenant_id: tenantId,
          booking_number,
          customer_id: input.customer_id,
          service_type: input.service_type as any,
          status: (input.status ?? "confirmed") as any,
          source: (input.source ?? "staff_capture") as any,
          start_at: input.start_at,
          end_at: input.end_at,
          start_date: startDate,
          end_date: endDate,
          resource_id: input.resource_id ?? null,
          notes_internal: input.notes_internal ?? null,
          notes_customer: input.notes_customer ?? null,
          requires_transport: input.requires_transport ?? false,
          requires_grooming: input.requires_grooming ?? false,
          ...addressSnapshot,
        })
        .select("id")
        .single();
      if (error) throw error;

      if (input.pet_ids.length) {
        const rows = input.pet_ids.map((pid) => ({
          tenant_id: tenantId,
          booking_id: created.id,
          pet_id: pid,
        }));
        const { error: bpErr } = await supabase.from("booking_pets").insert(rows);
        if (bpErr) throw bpErr;
      }

      return { id: created.id, booking_number };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bookings"] });
    },
  });
}

export interface UpdateBookingInput {
  id: string;
  patch: Partial<{
    service_type: ServiceType;
    status: BookingStatus;
    start_at: string;
    end_at: string;
    resource_id: string | null;
    notes_internal: string | null;
    notes_customer: string | null;
    requires_transport: boolean;
    requires_grooming: boolean;
    service_address_id: string | null;
  }>;
  pet_ids?: string[]; // if provided, replaces booking_pets
}

export function useUpdateBooking(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch, pet_ids }: UpdateBookingInput) => {
      const update: any = { ...patch };
      if (patch.start_at) update.start_date = patch.start_at.slice(0, 10);
      if (patch.end_at) update.end_date = patch.end_at.slice(0, 10);

      // When the service address changes, re-snapshot the address text/place_id.
      if (patch.service_address_id !== undefined) {
        if (patch.service_address_id) {
          const { data: addr } = await supabase
            .from("customer_addresses")
            .select("id, formatted_address, address_line_2, google_place_id, suburb, city, postcode")
            .eq("id", patch.service_address_id)
            .eq("tenant_id", tenantId)
            .maybeSingle();
          if (addr) {
            update.service_address_text = [addr.address_line_2, addr.formatted_address].filter(Boolean).join(", ");
            update.service_place_id = addr.google_place_id;
            update.service_suburb = addr.suburb;
            update.service_city = addr.city;
            update.service_postcode = addr.postcode;
          }
        } else {
          update.service_address_text = null;
          update.service_place_id = null;
          update.service_suburb = null;
          update.service_city = null;
          update.service_postcode = null;
        }
      }

      if (Object.keys(update).length) {
        const { error } = await supabase
          .from("bookings")
          .update(update)
          .eq("id", id)
          .eq("tenant_id", tenantId);
        if (error) throw error;
      }

      if (pet_ids) {
        const { error: delErr } = await supabase
          .from("booking_pets")
          .delete()
          .eq("booking_id", id)
          .eq("tenant_id", tenantId);
        if (delErr) throw delErr;
        if (pet_ids.length) {
          const rows = pet_ids.map((pid) => ({ tenant_id: tenantId, booking_id: id, pet_id: pid }));
          const { error: insErr } = await supabase.from("booking_pets").insert(rows);
          if (insErr) throw insErr;
        }
      }
      return { id };
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["bookings", "detail", tenantId, vars.id] });
    },
  });
}

export function useUpdateBookingStatus(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: BookingStatus }) => {
      const { error } = await supabase
        .from("bookings")
        .update({ status: status as any })
        .eq("id", id)
        .eq("tenant_id", tenantId);
      if (error) throw error;
      return { id, status };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bookings"] });
    },
  });
}

export interface BookingNotificationRow {
  id: string;
  event_type: string;
  status: "pending" | "sent" | "failed" | "skipped";
  error: string | null;
  created_at: string;
  sent_at: string | null;
}

export function useBookingNotifications(bookingId: string | null | undefined, tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["notifications", "booking", tenantId, bookingId],
    enabled: Boolean(bookingId) && Boolean(tenantId),
    queryFn: async (): Promise<BookingNotificationRow[]> => {
      const { data, error } = await (supabase as any)
        .from("notification_events")
        .select("id, event_type, status, error, created_at, sent_at")
        .eq("tenant_id", tenantId as string)
        .eq("booking_id", bookingId as string)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as BookingNotificationRow[];
    },
  });
}

export function useDeleteBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).rpc("delete_booking", { p_booking_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}