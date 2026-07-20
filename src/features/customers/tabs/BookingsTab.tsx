import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/lib/supabase/client";
import { StatusBadge } from "@/components/ui/status-badge";

type Row = {
  id: string;
  booking_number: string;
  status: string;
  service_type: string;
  start_at: string | null;
  end_at: string | null;
  start_date: string | null;
  end_date: string | null;
  resource: { name: string } | null;
  booking_pets: { pet: { id: string; name: string | null } | null }[];
};

function fmt(d: string | null) {
  return d ? format(new Date(d), "dd MMM yyyy") : "—";
}

export function BookingsTab({ tenantId, customerId }: { tenantId: string; customerId: string }) {
  const q = useQuery({
    queryKey: ["customer_bookings", tenantId, customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select(
          "id, booking_number, status, service_type, start_at, end_at, start_date, end_date, resource:resources(name), booking_pets(pet:pets(id, name))",
        )
        .eq("tenant_id", tenantId)
        .eq("customer_id", customerId)
        .order("start_at", { ascending: false, nullsFirst: false })
        .order("start_date", { ascending: false, nullsFirst: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as any as Row[];
    },
  });

  const grouped = useMemo(() => {
    const g: Record<string, Row[]> = {};
    for (const r of q.data ?? []) (g[r.service_type] ??= []).push(r);
    return g;
  }, [q.data]);

  if (q.isLoading)
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading bookings…
      </div>
    );
  if (q.isError)
    return <div className="text-sm text-sk-coral-dark">{(q.error as Error)?.message}</div>;
  if (!q.data?.length)
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        <CalendarDays className="h-5 w-5" /> No bookings yet.
      </div>
    );

  return (
    <div className="flex flex-col gap-5">
      {Object.entries(grouped).map(([svc, rows]) => (
        <div key={svc}>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {svc.replace(/_/g, " ")} · {rows.length}
          </div>
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-sk-surface-muted text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Ref</th>
                  <th className="px-3 py-2 text-left font-medium">Pets</th>
                  <th className="px-3 py-2 text-left font-medium">When</th>
                  <th className="px-3 py-2 text-left font-medium">Resource</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => {
                  const pets = r.booking_pets
                    .map((bp) => bp.pet?.name)
                    .filter(Boolean)
                    .join(", ");
                  const when = r.start_at
                    ? `${format(new Date(r.start_at), "dd MMM yyyy HH:mm")}`
                    : `${fmt(r.start_date)}${r.end_date && r.end_date !== r.start_date ? ` – ${fmt(r.end_date)}` : ""}`;
                  return (
                    <tr key={r.id} className="hover:bg-sk-surface-muted/50">
                      <td className="px-3 py-2">
                        <Link
                          to={`/admin/bookings/${r.id}`}
                          className="font-medium text-sk-coral-dark hover:underline"
                        >
                          {r.booking_number}
                        </Link>
                      </td>
                      <td className="px-3 py-2">{pets || "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{when}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.resource?.name ?? "—"}</td>
                      <td className="px-3 py-2">
                        <StatusBadge status={r.status as any} label={r.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}