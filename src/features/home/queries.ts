import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

export interface HomeAttention {
  unpaidToday: number;
  unassigned: number;
  stayPlayToday: number;
  stayPlayOverdue: number;
}

function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 2); // today + tomorrow
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}

/**
 * Attention counters for the home tiles: bookings in the next 48h that are
 * still unpaid, and bookings with no resource assigned.
 */
export function useHomeAttention(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["home-attention", tenantId],
    enabled: Boolean(tenantId),
    staleTime: 60_000,
    queryFn: async (): Promise<HomeAttention> => {
      const t = tenantId as string;
      const { startISO, endISO } = todayRange();

      const { data: bookings, error } = await supabase
        .from("bookings")
        .select("id, resource_id, service_type")
        .eq("tenant_id", t)
        .gte("start_at", startISO)
        .lt("start_at", endISO)
        .not("status", "in", "(cancelled,no_show)");
      if (error) throw error;

      const ids = (bookings ?? []).map((b) => b.id);
      const unassigned = (bookings ?? []).filter((b) => !b.resource_id).length;
      const stay = await stayPlayToday(t);
      if (ids.length === 0) return { unpaidToday: 0, unassigned, ...stay };

      const { data: items, error: itemsErr } = await supabase
        .from("invoice_items")
        .select("booking_id, invoice:invoices(status, balance_due)")
        .eq("tenant_id", t)
        .in("booking_id", ids);
      if (itemsErr) return { unpaidToday: 0, unassigned, ...stay };

      const paid = new Set<string>();
      const outstanding = new Set<string>();
      for (const row of (items ?? []) as any[]) {
        const inv = row.invoice;
        if (!row.booking_id || !inv) continue;
        const balance = Number(inv.balance_due ?? 0);
        if (inv.status === "paid" || balance <= 0) paid.add(row.booking_id);
        else if (inv.status !== "void" && inv.status !== "cancelled") outstanding.add(row.booking_id);
      }
      for (const id of paid) if (!outstanding.has(id)) outstanding.delete(id);

      return { unpaidToday: outstanding.size, unassigned, ...stay };
    },
  });
}

/** Stay & Play pets in today plus how many are past their collection time. */
async function stayPlayToday(tenantId: string) {
  const day = new Date();
  const dayKey = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
  const { data, error } = await supabase
    .from("stay_play_sessions")
    .select("id, status, expected_collect_at")
    .eq("tenant_id", tenantId)
    .eq("session_date", dayKey);
  if (error) return { stayPlayToday: 0, stayPlayOverdue: 0 };
  const rows = data ?? [];
  const now = Date.now();
  const overdue = rows.filter(
    (r: any) =>
      r.status !== "collected" &&
      r.expected_collect_at &&
      new Date(r.expected_collect_at).getTime() + 15 * 60000 < now,
  ).length;
  return { stayPlayToday: rows.length, stayPlayOverdue: overdue };
}