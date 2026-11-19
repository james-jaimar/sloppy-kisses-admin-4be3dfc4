import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

type Table = "bookings" | "invoices" | "estimates" | "credit_notes" | "payments";

/** Internal-only staff attribution line ("Captured by Kerry · 19 Nov 2026 14:02"). */
export function CapturedBy({ table, id, verb = "Captured", className = "" }: { table: Table; id: string; verb?: string; className?: string }) {
  const q = useQuery({
    queryKey: ["captured-by", table, id],
    enabled: !!id,
    staleTime: 30_000,
    queryFn: async () => {
      const cols = table === "payments" ? "created_at, recorded_by" : "created_at, updated_at, created_by, updated_by";
      const { data: row } = await (supabase.from(table) as any).select(cols).eq("id", id).maybeSingle();
      if (!row) return null;
      const createdBy = table === "payments" ? row.recorded_by : row.created_by;
      const updatedBy = table === "payments" ? null : row.updated_by;
      const ids = [createdBy, updatedBy].filter(Boolean) as string[];
      const names = new Map<string, string>();
      if (ids.length) {
        const { data: ps } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
        (ps ?? []).forEach((p) => names.set(p.id, p.full_name || p.email));
      }
      return {
        created: createdBy ? names.get(createdBy) ?? "staff member" : null,
        createdAt: row.created_at as string,
        updated: updatedBy && updatedBy !== createdBy ? names.get(updatedBy) ?? "staff member" : null,
        updatedAt: row.updated_at as string | undefined,
      };
    },
  });
  const d = q.data;
  if (!d) return null;
  return (
    <div className={`text-xs text-muted-foreground ${className}`}>
      {verb} by <span className="font-medium text-foreground">{d.created ?? "system / customer"}</span>
      {" · "}{format(new Date(d.createdAt), "dd MMM yyyy HH:mm")}
      {d.updated && d.updatedAt && (
        <> · last changed by <span className="font-medium text-foreground">{d.updated}</span> {format(new Date(d.updatedAt), "dd MMM HH:mm")}</>
      )}
    </div>
  );
}
