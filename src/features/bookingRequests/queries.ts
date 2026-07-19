import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type BookingRequestRow = Database["public"]["Tables"]["booking_requests"]["Row"];
export type BookingRequestInsert = Database["public"]["Tables"]["booking_requests"]["Insert"];
export type BookingRequestStatus =
  | "pending_review"
  | "needs_info"
  | "approved"
  | "declined"
  | "converted";
export type BookingRequestSource =
  | "website_form"
  | "customer_portal"
  | "staff_capture"
  | "email"
  | "phone"
  | "whatsapp";
export type BookingRequestServiceType =
  | "daycare"
  | "daycare_assessment"
  | "hotel_dog"
  | "hotel_cat"
  | "grooming_inhouse"
  | "grooming_mobile"
  | "pickup_dropoff";

export interface BookingRequestListRow {
  id: string;
  status: BookingRequestStatus;
  source: BookingRequestSource;
  service_type: BookingRequestServiceType;
  preferred_start_at: string | null;
  preferred_end_at: string | null;
  customer_notes: string | null;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
  customer_id: string | null;
  pet_id: string | null;
  converted_booking_id: string | null;
  request_payload: Record<string, any> | null;
  customer: {
    id: string;
    customer_number: string | null;
    full_name: string | null;
    email: string | null;
    mobile: string | null;
  } | null;
  pet: {
    id: string;
    pet_number: string | null;
    name: string | null;
    breed: string | null;
    size: string | null;
    species: string | null;
  } | null;
}

export function useBookingRequests(params: {
  tenantId: string | null | undefined;
  status?: BookingRequestStatus | "all";
  search?: string;
  page?: number;
  pageSize?: number;
}) {
  const { tenantId, status = "all", search = "", page = 0, pageSize = 100 } = params;
  return useQuery({
    queryKey: ["bookingRequests", "list", tenantId, status, search, page, pageSize],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<{ rows: BookingRequestListRow[]; total: number }> => {
      const from = page * pageSize;
      const to = from + pageSize - 1;
      const s = search.trim();

      // If searching, pre-resolve matching customer / pet ids
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

      let query = supabase
        .from("booking_requests")
        .select(
          `id, status, source, service_type, preferred_start_at, preferred_end_at,
           customer_notes, admin_notes, created_at, updated_at, customer_id, pet_id, converted_booking_id, request_payload,
           customer:customers(id, customer_number, full_name, email, mobile),
           pet:pets(id, pet_number, name, breed, size, species)`,
          { count: "exact" },
        )
        .eq("tenant_id", tenantId as string)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (status !== "all") query = query.eq("status", status);

      if (s) {
        const q = `%${s}%`;
        const parts = [
          `service_type.ilike.${q}`,
          `source.ilike.${q}`,
        ];
        if (customerIds.length) parts.push(`customer_id.in.(${customerIds.join(",")})`);
        if (petIds.length) parts.push(`pet_id.in.(${petIds.join(",")})`);
        query = query.or(parts.join(","));
      }

      const { data, error, count } = await query;
      if (error) throw error;
      const rows = (data ?? []).map((r: any) => ({
        ...r,
        customer: r.customer ?? null,
        pet: r.pet ?? null,
      })) as BookingRequestListRow[];
      return { rows, total: count ?? rows.length };
    },
  });
}

export function useBookingRequestStatusCounts(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["bookingRequests", "counts", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      const statuses: BookingRequestStatus[] = [
        "pending_review",
        "needs_info",
        "approved",
        "declined",
        "converted",
      ];
      const results = await Promise.all(
        statuses.map((st) =>
          supabase
            .from("booking_requests")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenantId as string)
            .eq("status", st),
        ),
      );
      const out: Record<BookingRequestStatus, number> = {
        pending_review: 0,
        needs_info: 0,
        approved: 0,
        declined: 0,
        converted: 0,
      };
      statuses.forEach((st, i) => {
        out[st] = results[i].count ?? 0;
      });
      return out;
    },
  });
}

export function useCreateBookingRequest(tenantId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      customer_id: string;
      pet_id: string | null;
      service_type: BookingRequestServiceType;
      source: BookingRequestSource;
      preferred_start_at: string | null;
      preferred_end_at: string | null;
      customer_notes: string | null;
      admin_notes: string | null;
    }) => {
      if (!tenantId) throw new Error("No tenant selected");
      const payload: BookingRequestInsert = {
        tenant_id: tenantId,
        customer_id: input.customer_id,
        pet_id: input.pet_id,
        service_type: input.service_type,
        source: input.source,
        status: "pending_review",
        preferred_start_at: input.preferred_start_at,
        preferred_end_at: input.preferred_end_at,
        customer_notes: input.customer_notes,
        admin_notes: input.admin_notes,
        request_payload: {},
      };
      const { data, error } = await supabase
        .from("booking_requests")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bookingRequests"] });
    },
  });
}

/**
 * Mark a booking request as converted after a booking has been created from it.
 * Sets status=converted, converted_booking_id, reviewed_at, and reviewed_by (if profile id given).
 */
export function useMarkRequestConverted(tenantId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      requestId,
      bookingId,
      profileId,
    }: {
      requestId: string;
      bookingId: string;
      profileId?: string | null;
    }) => {
      if (!tenantId) throw new Error("No tenant selected");
      const update: any = {
        status: "converted",
        converted_booking_id: bookingId,
        reviewed_at: new Date().toISOString(),
      };
      if (profileId) {
        update.reviewed_by = profileId;
        update.updated_by = profileId;
      }
      const { data, error } = await supabase
        .from("booking_requests")
        .update(update)
        .eq("id", requestId)
        .eq("tenant_id", tenantId)
        .neq("status", "converted") // avoid re-conversion overwrite
        .select("id")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bookingRequests"] });
    },
  });
}

export function useUpdateBookingRequest(tenantId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<Pick<BookingRequestRow, "status" | "admin_notes">>;
    }) => {
      if (!tenantId) throw new Error("No tenant selected");
      const update: any = { ...patch };
      if (patch.status) update.reviewed_at = new Date().toISOString();
      const { data, error } = await supabase
        .from("booking_requests")
        .update(update)
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bookingRequests"] });
    },
  });
}