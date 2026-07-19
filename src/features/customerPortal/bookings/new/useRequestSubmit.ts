import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase/client";

export interface SubmitArgs {
  tenantId: string;
  customerId: string;
  serviceType: string;
  petId?: string | null;
  preferredStartAt?: string | null;
  preferredEndAt?: string | null;
  customerNotes?: string | null;
  requestPayload?: Record<string, any>;
}

export function useRequestSubmit() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: async (args: SubmitArgs) => {
      const { error } = await supabase.from("booking_requests").insert({
        tenant_id: args.tenantId,
        customer_id: args.customerId,
        pet_id: args.petId || null,
        source: "customer_portal" as any,
        service_type: args.serviceType as any,
        preferred_start_at: args.preferredStartAt ?? null,
        preferred_end_at: args.preferredEndAt ?? null,
        customer_notes: args.customerNotes?.trim() || null,
        status: "pending_review" as any,
        kind: "new" as any,
        request_payload: args.requestPayload ?? {},
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Booking request sent — we'll be in touch to confirm.");
      qc.invalidateQueries({ queryKey: ["portal_bookings"] });
      qc.invalidateQueries({ queryKey: ["portal_dash_upcoming"] });
      navigate("/customer/bookings");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to send request"),
  });
}

export function toIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function dateToIso(date: string, time?: string): string | null {
  if (!date) return null;
  const d = new Date(`${date}T${time || "09:00"}:00`);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}