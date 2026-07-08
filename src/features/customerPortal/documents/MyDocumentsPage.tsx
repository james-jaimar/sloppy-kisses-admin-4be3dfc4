import { useQuery } from "@tanstack/react-query";
import { Loader2, FileText } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { supabase } from "@/lib/supabase/client";
import { useCurrentCustomer } from "../hooks";
import { fmtDate } from "../portalCommon";

export default function MyDocumentsPage() {
  const cust = useCurrentCustomer();
  const q = useQuery({
    queryKey: ["portal_documents", cust.data?.id],
    enabled: !!cust.data?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("id, type, file_name, file_path, status, created_at, pet:pets(name)")
        .or(`customer_id.eq.${cust.data!.id},pet_id.not.is.null`)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <>
      <AppHeader title="Documents" subtitle="Vaccination certificates, invoices and forms" />
      <div className="flex-1 p-6">
        {q.isLoading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>}
        {q.data && q.data.length === 0 && (
          <div className="sk-card grid place-items-center gap-3 p-10 text-center">
            <FileText className="h-10 w-10 text-muted-foreground" />
            <div className="text-sm text-muted-foreground">No documents on file yet.</div>
          </div>
        )}
        {q.data && q.data.length > 0 && (
          <div className="sk-card overflow-hidden">
            <ul className="divide-y divide-border">
              {q.data.map((d: any) => (
                <li key={d.id} className="flex items-center gap-4 px-5 py-3">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-sm font-medium">{d.file_name ?? d.file_path}</div>
                    <div className="text-xs text-muted-foreground">{d.type ?? "document"} · {d.pet?.name ? `${d.pet.name} · ` : ""}{fmtDate(d.created_at)}</div>
                  </div>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{d.status}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}