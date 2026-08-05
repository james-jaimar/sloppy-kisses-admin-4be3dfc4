import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase/client";

export type PortalService =
  | "grooming_inhouse"
  | "grooming_mobile"
  | "hotel_dog"
  | "hotel_cat"
  | "pickup_dropoff"
  | "daycare"
  | "daycare_assessment";

export interface CreateBookingArgs {
  serviceType: PortalService;
  petIds: string[];
  startAt: string;
  endAt?: string | null;
  notes?: string | null;
  grooming?: Record<string, unknown>;
  hotel?: Record<string, unknown>;
  transport?: Record<string, unknown>;
  daycare?: Record<string, unknown>;
  /** Runs after the booking is created, before navigation (e.g. save the accommodation form). */
  afterCreate?: (res: CreateBookingResult) => Promise<void>;
}

export interface CreateBookingResult {
  booking_id?: string;
  booking_number?: string;
  enrolment_ids?: string[];
  invoice_id: string | null;
  balance_due: number;
  short_notice: boolean;
  payment_required_now: boolean;
}

const ERRORS: Record<string, string> = {
  lead_time: "That slot is too close to now — please pick a later time.",
  start_in_past: "That time has already passed.",
  invalid_pets: "We couldn't match that pet to your profile.",
  vaccinations_required: "Vaccinations are outstanding for this pet.",
  no_availability: "We're fully booked on one or more of those nights — please try different dates.",
  forbidden: "Your portal access isn't active — please contact us.",
};

export function useCreatePortalBooking() {
  const qc = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: async (args: CreateBookingArgs): Promise<CreateBookingResult> => {
      const { data, error } = await supabase.functions.invoke("portal-create-booking", {
        body: {
          service_type: args.serviceType,
          pet_ids: args.petIds,
          start_at: args.startAt,
          end_at: args.endAt ?? null,
          notes: args.notes ?? null,
          grooming: args.grooming,
          hotel: args.hotel,
          transport: args.transport,
          daycare: args.daycare,
        },
      });
      // A non-2xx reply lands in `error`, with the JSON body on error.context —
      // read it so we show the real reason instead of "unknown".
      let payload: any = data ?? {};
      if (error && !data) {
        try {
          const ctx = (error as any)?.context;
          const text = typeof ctx?.text === "function" ? await ctx.text() : null;
          if (text) payload = JSON.parse(text);
        } catch {
          /* body wasn't JSON — fall through to the generic message */
        }
      }
      if (error || payload?.error) {
        const code = payload?.error ?? error?.message ?? "unknown";
        console.error("portal-create-booking failed:", { code, payload, error });
        const msg =
          ERRORS[code] ??
          (payload?.missing?.length ? `Outstanding: ${payload.missing.join(", ")}` : null) ??
          (typeof code === "string" && code !== "unknown" ? code : "Could not create the booking — please try again or contact us.");
        throw new Error(msg);
      }
      const result = payload as CreateBookingResult;
      if (args.afterCreate) await args.afterCreate(result);
      return result;
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["portal_bookings"] });
      qc.invalidateQueries({ queryKey: ["portal_dash_upcoming"] });
      qc.invalidateQueries({ queryKey: ["portal_invoices"] });
      qc.invalidateQueries({ queryKey: ["portal_enrolments"] });
      if (res.booking_id) {
        toast.success(`Booking ${res.booking_number} confirmed`);
        navigate(`/customer/bookings/${res.booking_id}?created=1`);
      } else {
        toast.success("Daycare enrolment confirmed");
        navigate("/customer/bookings");
      }
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to create booking"),
  });
}

/** Minimum lead time (hours) configured for a service group. */
export function useMinLeadHours(
  tenantId: string | null | undefined,
  group: "grooming" | "hotel" | "transport",
) {
  const table =
    group === "grooming"
      ? "grooming_workflow_settings"
      : group === "hotel"
        ? "hotel_workflow_settings"
        : "transport_workflow_settings";
  return useQuery({
    queryKey: ["portal_min_lead", tenantId, group],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from(table as any)
        .select("min_lead_hours")
        .eq("tenant_id", tenantId!)
        .maybeSingle();
      return Number((data as any)?.min_lead_hours ?? 24);
    },
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