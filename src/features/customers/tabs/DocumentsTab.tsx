import { useQuery } from "@tanstack/react-query";
import { FileText, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase/client";

export function DocumentsTab({ tenantId, customerId }: { tenantId: string; customerId: string }) {
  const q = useQuery({
    queryKey: ["customer_documents", tenantId, customerId],
    queryFn: async () => {
      const pets = await supabase
        .from("pets")
        .select("id, name")
        .eq("tenant_id", tenantId)
        .eq("customer_id", customerId);
      if (pets.error) throw pets.error;
      const petIds = (pets.data ?? []).map((p) => p.id);
      const petMap = new Map(pets.data?.map((p) => [p.id, p.name]) ?? []);

      const filters = [`customer_id.eq.${customerId}`];
      if (petIds.length) filters.push(`pet_id.in.(${petIds.join(",")})`);
      const docs = await supabase
        .from("documents")
        .select("id, type, file_name, file_path, status, created_at, pet_id, customer_id")
        .eq("tenant_id", tenantId)
        .or(filters.join(","))
        .order("created_at", { ascending: false })
        .limit(500);
      if (docs.error) throw docs.error;
      return (docs.data ?? []).map((d: any) => ({
        ...d,
        pet_name: d.pet_id ? petMap.get(d.pet_id) ?? null : null,
      }));
    },
  });

  if (q.isLoading)
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading documents…
      </div>
    );
  if (q.isError)
    return <div className="text-sm text-sk-coral-dark">{(q.error as Error)?.message}</div>;
  if (!q.data?.length)
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        <FileText className="h-5 w-5" /> No documents on file yet.
      </div>
    );

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <ul className="divide-y divide-border">
        {q.data.map((d) => (
          <li key={d.id} className="flex items-center gap-3 px-4 py-2.5">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{d.file_name ?? d.file_path}</div>
              <div className="text-xs text-muted-foreground">
                {d.type ?? "document"}
                {d.pet_id && d.pet_name ? (
                  <>
                    {" · "}
                    <Link
                      to={`/admin/pets/${d.pet_id}`}
                      className="text-sk-coral-dark hover:underline"
                    >
                      {d.pet_name}
                    </Link>
                  </>
                ) : null}
                {" · "}
                {format(new Date(d.created_at), "dd MMM yyyy")}
              </div>
            </div>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {d.status}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}