import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, Copy, CheckCircle2, FileDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/lib/tenant/TenantContext";
import { useHotelReviewAction } from "./reviewQueries";
import { publicHotelQuoteLink } from "./quoteFlow";
import { downloadQuotePdf, useSendQuote } from "@/features/quotes/queries";

export function HotelQuoteActions({ bookingId, estimateId, tenantId }: { bookingId: string; estimateId?: string; tenantId: string }) {
  const { currentTenant, hasPermission } = useCurrentUser();
  const action = useHotelReviewAction(bookingId);
  const send = useSendQuote();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const quote = useQuery({ queryKey: ["hotel_quote_actions", tenantId, estimateId], enabled: Boolean(estimateId), queryFn: async () => {
    const { data, error } = await supabase.from("estimates").select("id, estimate_number, total, status, public_token, sent_at, expiry_date").eq("tenant_id", tenantId).eq("id", estimateId ?? "").single();
    if (error) throw error;
    return data;
  }});
  const q = quote.data;
  const pending = busy || action.isPending || send.isPending;
  async function perform(kind: "create" | "email" | "copy" | "accept" | "download") {
    setBusy(true);
    try {
      if (kind === "create") {
        await action.mutateAsync({ action: "estimate" });
        toast.success("Quote ready — choose email or copy the customer link");
        return;
      }
      if (!q) return;
      if (kind === "email") { await send.mutateAsync(q.id); toast.success("Quote emailed with a no-sign-in acceptance link"); }
      if (kind === "copy") {
        const appUrl = (currentTenant as unknown as { app_url?: string | null } | null)?.app_url;
        await navigator.clipboard.writeText(publicHotelQuoteLink(appUrl, q.public_token));
        toast.success("Customer quote link copied — ready for WhatsApp");
      }
      if (kind === "download") await downloadQuotePdf(q.id, `${q.estimate_number}.pdf`);
      if (kind === "accept") {
        if (!await confirm({ title: "Customer accepted this quote?", description: "Record their agreement by phone or WhatsApp. This opens information gathering; it does not confirm the stay or issue an invoice.", confirmLabel: "Mark accepted" })) return;
        const { error } = await supabase.rpc("accept_estimate", { p_estimate_id: q.id });
        if (error) throw error;
        toast.success("Quote accepted — ready to gather the stay details");
      }
      await Promise.all(["hotel_quote_actions", "hotel_review", "hotel_pipeline", "hotel_quote_stage", "bookings", "estimates"].map(key => qc.invalidateQueries({ queryKey: [key] })));
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not update the quote"); }
    finally { setBusy(false); }
  }
  return <section className="space-y-4 border-l-4 border-primary bg-sk-surface p-4 sm:p-5" aria-label="Quote and enquiry">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-bold">Quote & enquiry</h2><p className="mt-1 text-sm text-muted-foreground">{q?.sent_at ? "Quote sent · awaiting customer acceptance" : "Request received · ready to send the price"}</p></div>{q && <div className="text-right"><p className="text-sm text-muted-foreground">{q.estimate_number}</p><p className="text-2xl font-bold">{new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(Number(q.total))}</p></div>}</div>
    {!estimateId && <Button disabled={pending || !hasPermission("bookings.edit")} onClick={() => perform("create")}>Prepare quote</Button>}
    {quote.isLoading && <p role="status" className="text-sm text-muted-foreground">Loading quote…</p>}
    {quote.error && <div className="text-sm text-destructive">Could not load quote. <Button variant="outline" size="sm" onClick={() => quote.refetch()}>Retry</Button></div>}
    {q && <div className="flex flex-wrap gap-2"><Button size="lg" disabled={pending || !hasPermission("invoices.send")} onClick={() => perform("email")}><Mail className="mr-2 h-4 w-4" />{q.sent_at ? "Resend quote to customer" : "Email quote to customer"}</Button><Button variant="outline" disabled={pending} onClick={() => perform("copy")}><Copy className="mr-2 h-4 w-4" />Copy link for WhatsApp</Button><Button variant="outline" disabled={pending || !hasPermission("bookings.edit")} onClick={() => perform("accept")}><CheckCircle2 className="mr-2 h-4 w-4" />Mark accepted on phone</Button><Button variant="outline" disabled={pending} onClick={() => perform("download")}><FileDown className="mr-2 h-4 w-4" />Download quote</Button></div>}
    <p className="text-sm text-muted-foreground">Customer acceptance comes first. Vet details, emergency contacts, care instructions and vaccination checks follow; the invoice is issued after staff confirmation.</p>
  </section>;
}