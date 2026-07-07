import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { expandRecurrence, type RecurrenceRuleInput } from "./recurrence";
import type { CreateBookingInput } from "./queries";

/**
 * Create a recurring series: insert the rule, expand occurrences, and bulk
 * insert the bookings + booking_pets. Details rows are persisted per-occurrence
 * by the caller via the upsert hook it already uses today.
 */
export interface CreateRecurringInput extends CreateBookingInput {
  rule: RecurrenceRuleInput;
}

export interface CreateRecurringResult {
  rule_id: string;
  bookings: { id: string; booking_number: string; start_at: string; end_at: string }[];
  skipped: number;
}

export function useCreateRecurringBooking(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateRecurringInput): Promise<CreateRecurringResult> => {
      const occurrences = expandRecurrence({
        startAt: input.start_at,
        endAt: input.end_at,
        rule: input.rule,
      });
      if (occurrences.length === 0) throw new Error("Recurrence produced no occurrences");

      // 1. Insert the rule
      const { data: ruleRow, error: ruleErr } = await supabase
        .from("recurring_rules")
        .insert({
          tenant_id: tenantId,
          frequency: input.rule.frequency,
          interval: Math.max(1, input.rule.interval || 1),
          days_of_week: input.rule.daysOfWeek ?? null,
          end_date: input.rule.endDate ?? null,
          start_date: input.start_at.slice(0, 10),
          active: true,
        } as any)
        .select("id")
        .single();
      if (ruleErr) throw ruleErr;
      const rule_id = (ruleRow as any).id as string;

      // 2. Reserve booking numbers (sequentially — RPC uses advisory locks).
      const bookingNumbers: string[] = [];
      for (let i = 0; i < occurrences.length; i++) {
        const { data: numData, error: numErr } = await (supabase as any).rpc("next_booking_number", {
          target_tenant_id: tenantId,
        });
        if (numErr) throw numErr;
        bookingNumbers.push(numData as string);
      }

      // 3. Bulk insert bookings
      const bookingRows = occurrences.map((occ, idx) => ({
        tenant_id: tenantId,
        booking_number: bookingNumbers[idx],
        customer_id: input.customer_id,
        service_type: input.service_type as any,
        status: (input.status ?? "confirmed") as any,
        source: (input.source ?? "staff_capture") as any,
        start_at: occ.start_at,
        end_at: occ.end_at,
        start_date: occ.start_at.slice(0, 10),
        end_date: occ.end_at.slice(0, 10),
        resource_id: input.resource_id ?? null,
        notes_internal: input.notes_internal ?? null,
        notes_customer: input.notes_customer ?? null,
        booking_request_id: input.booking_request_id ?? null,
        requires_transport: input.requires_transport ?? false,
        requires_grooming: input.requires_grooming ?? false,
        recurring_rule_id: rule_id,
      }));

      const { data: created, error: bErr } = await supabase
        .from("bookings")
        .insert(bookingRows as any)
        .select("id, booking_number, start_at, end_at");
      if (bErr) throw bErr;

      // 4. booking_pets for every occurrence
      if (input.pet_ids.length && created?.length) {
        const petRows = created.flatMap((b: any) =>
          input.pet_ids.map((pid) => ({ tenant_id: tenantId, booking_id: b.id, pet_id: pid })),
        );
        const { error: bpErr } = await supabase.from("booking_pets").insert(petRows);
        if (bpErr) throw bpErr;
      }

      return {
        rule_id,
        bookings: (created ?? []).map((b: any) => ({
          id: b.id,
          booking_number: b.booking_number,
          start_at: b.start_at,
          end_at: b.end_at,
        })),
        skipped: 0,
      };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bookings"] });
    },
  });
}

/**
 * Cancel this occurrence + every future occurrence in the same series.
 * The rule itself is deactivated so no future generation will happen.
 */
export function useCancelSeriesForward(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ bookingId }: { bookingId: string }) => {
      const { data: booking, error: bErr } = await supabase
        .from("bookings")
        .select("id, recurring_rule_id, start_at")
        .eq("id", bookingId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (bErr) throw bErr;
      if (!booking?.recurring_rule_id) throw new Error("Booking is not part of a series");

      const { error: rErr } = await supabase
        .from("recurring_rules")
        .update({ active: false } as any)
        .eq("id", booking.recurring_rule_id)
        .eq("tenant_id", tenantId);
      if (rErr) throw rErr;

      const { error: cErr } = await supabase
        .from("bookings")
        .update({ status: "cancelled" as any })
        .eq("tenant_id", tenantId)
        .eq("recurring_rule_id", booking.recurring_rule_id)
        .gte("start_at", booking.start_at as string)
        .not("status", "in", "(completed,checked_out,cancelled,no_show)");
      if (cErr) throw cErr;

      return { rule_id: booking.recurring_rule_id };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bookings"] });
    },
  });
}