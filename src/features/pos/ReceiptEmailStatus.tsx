import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

export default function ReceiptEmailStatus({ tenantId, invoiceId }: { tenantId: string; invoiceId: string }) {
  const q = useQuery({ queryKey: ["pos_receipt_email", tenantId, invoiceId], refetchInterval: 5000,
    queryFn: async () => {
      const { data, error } = await supabase.from("notification_events").select("status, error, recipient_email")
        .eq("tenant_id", tenantId).eq("invoice_id", invoiceId).eq("event_type", "invoice_paid").eq("channel", "email").order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return data;
    } });
  if (q.isError) return <p className="text-sm text-muted-foreground">Receipt delivery status unavailable.</p>;
  if (!q.data) return null;
  const e = q.data;
  return <p role="status" className={e.status === "failed" || e.status === "blocked" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
    {e.status === "sent" ? `Receipt sent to ${e.recipient_email}` : e.status === "pending" ? `Receipt queued for ${e.recipient_email}` : `Receipt ${e.status}: ${e.error ?? "See Communications"}`}
  </p>;
}