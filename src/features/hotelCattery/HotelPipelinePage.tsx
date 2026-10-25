import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Search } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import { supabase } from "@/integrations/supabase/client";
import { BookingStatusChip } from "@/features/bookings/statusMeta";
import { HOTEL_REVIEW_STATUSES } from "./reviewQueue";

export default function HotelPipelinePage() {
  const { tenant } = useCurrentTenant();
  const navigate = useNavigate();
  const [converting, setConverting] = useState<string | null>(null);
  const enquiries = useQuery({ queryKey: ["hotel_enquiries", tenant?.id], enabled: Boolean(tenant), queryFn: async () => {
    if (!tenant) return [];
    const { data, error } = await supabase.from("booking_requests").select("id, preferred_start_at, customer_notes, customer:customers(full_name)").eq("tenant_id", tenant.id).eq("kind", "new").in("service_type", ["hotel_dog", "hotel_cat"]).in("status", ["pending_review", "needs_info", "approved"]).is("converted_booking_id", null).order("created_at");
    if (error) throw error; return data ?? [];
  }});
  async function openEnquiry(id: string) { setConverting(id); try { const { data, error } = await supabase.rpc("hotel_convert_enquiry", { p_request_id: id }); if (error) throw error; navigate(`/admin/bookings/${data}`, { state: { from: "/admin/hotel-cattery/pipeline" } }); } catch (e) { toast.error(e instanceof Error ? e.message : "Could not open enquiry"); } finally { setConverting(null); } }
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const quotes = useQuery({ queryKey: ["hotel_pipeline_quotes", tenant?.id], enabled: Boolean(tenant), refetchInterval: 30000, queryFn: async () => {
    if (!tenant) return [];
    const rows = [];
    for (let from = 0; ; from += 500) {
      const { data, error } = await supabase.from("estimates").select("id, estimate_number, status, start_at, customer:customers(full_name)")
        .eq("tenant_id", tenant.id).in("service_type", ["hotel_dog", "hotel_cat"]).in("status", ["draft", "sent"]).is("booking_id", null).order("created_at").range(from, from + 499);
      if (error) throw error;
      rows.push(...(data ?? []));
      if ((data?.length ?? 0) < 500) return rows;
    }
  }});
  const q = useQuery({ queryKey: ["hotel_pipeline", tenant?.id], enabled: Boolean(tenant), queryFn: async () => {
    if (!tenant) return [];
    const rows = [];
    for (let from = 0; ; from += 500) {
      const { data, error } = await supabase.from("bookings").select("id, booking_number, start_at, end_at, status, customer:customers(full_name), booking_pets(pet:pets(name)), review:hotel_booking_reviews(checklist, approved_at)").eq("tenant_id", tenant.id).in("service_type", ["hotel_dog", "hotel_cat"]).in("status", [...HOTEL_REVIEW_STATUSES, "confirmed"]).order("start_at").range(from, from + 499);
      if (error) throw error;
      rows.push(...(data ?? []));
      if ((data?.length ?? 0) < 500) return rows;
    }
  }, refetchInterval: 30000 });
  const rows = (q.data ?? []).filter(b => (status === "all" || b.status === status) && `${b.booking_number} ${b.customer?.full_name} ${b.booking_pets.map(p => p.pet?.name).join(" ")}`.toLowerCase().includes(search.toLowerCase()));
  return <><AppHeader title="Hotel pipeline & approvals" actions={<Button variant="outline" asChild><Link to="/admin/hotel-cattery"><ArrowLeft className="mr-2 h-4 w-4" />Occupancy</Link></Button>} /><div className="flex-1 space-y-5 p-6">
    {enquiries.error && <p className="text-sm text-destructive">Could not load website enquiries.</p>}
    {quotes.error && <p className="text-sm text-destructive">Could not load open hotel quotes.</p>}
    {Boolean(quotes.data?.length) && <section className="space-y-3 border-b border-border pb-5"><h2 className="font-semibold">Open quotes ({quotes.data?.length})</h2>{quotes.data?.map(quote => <div key={quote.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-border py-3"><div><p className="font-medium">{quote.customer?.full_name ?? "Customer"}</p><p className="text-sm text-muted-foreground">{quote.estimate_number} · {quote.status === "draft" ? "Draft — not sent" : "Awaiting customer acceptance"}</p></div><Button variant="outline" asChild><Link to={`/admin/quotes/${quote.id}`}>Review quote<ArrowRight className="ml-2 h-4 w-4" /></Link></Button></div>)}</section>}
    {Boolean(enquiries.data?.length) && <section className="space-y-3 border-b border-border pb-5"><h2 className="font-semibold">Website enquiries</h2>{enquiries.data?.map(e => <div key={e.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-border py-3"><div><p className="font-medium">{e.customer?.full_name ?? "Customer"}</p><p className="text-sm text-muted-foreground">{e.preferred_start_at?.slice(0, 10)} · {e.customer_notes}</p></div><Button variant="outline" disabled={Boolean(converting)} onClick={() => openEnquiry(e.id)}>Open for review<ArrowRight className="ml-2 h-4 w-4" /></Button></div>)}</section>}
    <div className="flex flex-wrap gap-3"><label className="flex items-center gap-2 rounded-md border border-input bg-background px-3"><Search className="h-4 w-4 text-muted-foreground" /><input aria-label="Search hotel pipeline" placeholder="Customer, pet or booking" value={search} onChange={e => setSearch(e.target.value)} className="h-10 min-w-0 bg-transparent text-sm outline-none" /></label><select aria-label="Pipeline stage" value={status} onChange={e => setStatus(e.target.value)} className="rounded-md border border-input bg-background px-3 text-sm"><option value="all">All stages</option><option value="draft">Enquiry</option><option value="requested">Estimate / review</option><option value="needs_info">Needs info</option><option value="approved">Approved</option><option value="pending_payment">Awaiting payment</option><option value="confirmed">Confirmed</option></select><span className="self-center text-sm text-muted-foreground">{rows.length} stays</span></div>
    {q.isLoading ? <p className="text-sm text-muted-foreground">Loading stays…</p> : q.error ? <p className="text-sm text-destructive">Could not load the hotel pipeline.</p> : !rows.length ? <p className="py-10 text-sm text-muted-foreground">No stays match these filters.</p> : <div className="divide-y divide-border">{rows.map(b => <div key={b.id} className="flex flex-wrap items-center justify-between gap-4 py-5"><div className="min-w-0 space-y-1"><div className="font-semibold">{b.customer?.full_name ?? "Customer"} · {b.booking_pets.map(p => p.pet?.name).filter(Boolean).join(", ")}</div><div className="text-sm text-muted-foreground">{b.booking_number} · {b.start_at ? new Date(b.start_at).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" }) : "Dates needed"}</div></div><div className="flex items-center gap-4"><BookingStatusChip status={b.status} /><Button variant="outline" asChild><Link to={`/admin/bookings/${b.id}`} state={{ from: "/admin/hotel-cattery/pipeline" }}>Review stay<ArrowRight className="ml-2 h-4 w-4" /></Link></Button></div></div>)}</div>}
  </div></>;
}