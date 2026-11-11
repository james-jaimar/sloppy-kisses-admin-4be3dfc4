import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, BadgeCheck, CircleAlert, Search, Wallet } from "lucide-react";
import { useHotelWorkflowSettings } from "./queries";
import { hotelPaymentPercent } from "./paymentRules";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import { supabase } from "@/integrations/supabase/client";
import { BookingStatusChip } from "@/features/bookings/statusMeta";
import { HOTEL_REVIEW_STATUSES } from "./reviewQueue";
import { HOTEL_PIPELINE_STAGES as stages, matchesPipelineStage as matches } from "./pipelineStages";
import { quoteSendState } from "./quoteFlow";

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
  const [stage, setStage] = useState("action");
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
      const { data, error } = await supabase.from("bookings").select("id, booking_number, start_at, end_at, status, created_at, customer:customers(full_name), booking_pets(pet:pets(name)), review:hotel_booking_reviews(checklist, approved_at, confirmed_at, payment_percent_override, estimate:estimates(estimate_number, total, status, accepted_at, sent_at))").eq("tenant_id", tenant.id).in("service_type", ["hotel_dog", "hotel_cat"]).in("status", [...HOTEL_REVIEW_STATUSES, "confirmed"]).order("created_at", { ascending: false }).range(from, from + 499);
      if (error) throw error;
      rows.push(...(data ?? []));
      if ((data?.length ?? 0) < 500) return rows;
    }
  }, refetchInterval: 30000 });
  const settings = useHotelWorkflowSettings(tenant?.id);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" });
  const zar = (n: number) => new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(n);
  function glance(b: any) {
    const r = Array.isArray(b.review) ? b.review[0] : b.review;
    const est = r?.estimate;
    if (!est || r?.confirmed_at || b.status === "confirmed") return null;
    const accepted = Boolean(est.accepted_at) || est.status === "accepted";
    const startDay = b.start_at ? new Date(b.start_at).toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" }) : today;
    const pct = hotelPaymentPercent(startDay, today, settings.data?.payment_cutoff_days ?? 30, Number(settings.data?.advance_deposit_pct ?? 50), r?.payment_percent_override == null ? null : Number(r.payment_percent_override));
    const amount = Math.round(Number(est.total ?? 0) * pct) / 100;
    return { accepted, est, pct, amount };
  }
  const all = q.data ?? [];
  const needle = search.toLowerCase();
  const searched = all.filter(b => `${b.booking_number} ${b.customer?.full_name} ${b.booking_pets.map(p => p.pet?.name).join(" ")}`.toLowerCase().includes(needle));
  const counts = Object.fromEntries(stages.map(s => [s.key, searched.filter(b => matches(b.status, s.key)).length]));
  const rows = searched.filter(b => matches(b.status, stage));
  return <><AppHeader title="Hotel pipeline & approvals" actions={<Button variant="outline" asChild><Link to="/admin/hotel-cattery"><ArrowLeft className="mr-2 h-4 w-4" />Occupancy</Link></Button>} /><div className="flex-1 space-y-5 p-6">
    {enquiries.error && <p className="text-sm text-destructive">Could not load website enquiries.</p>}
    {quotes.error && <p className="text-sm text-destructive">Could not load open hotel quotes.</p>}
    {Boolean(quotes.data?.length) && <section className="space-y-3 border-b border-border pb-5"><h2 className="font-semibold">Open quotes ({quotes.data?.length})</h2>{quotes.data?.map(quote => <div key={quote.id} role="link" tabIndex={0} onClick={() => navigate(`/admin/quotes/${quote.id}`)} onKeyDown={e => { if (e.key === "Enter") navigate(`/admin/quotes/${quote.id}`); }} className="-mx-2 flex cursor-pointer flex-wrap items-center justify-between gap-3 rounded-md border-t border-border px-2 py-3 transition-colors hover:bg-muted/60"><div><p className="font-medium">{quote.customer?.full_name ?? "Customer"}</p><p className="text-sm text-muted-foreground">{quote.estimate_number} · {quote.status === "draft" ? "Draft — not sent" : "Awaiting customer acceptance"}</p></div><Button variant="outline" asChild><Link to={`/admin/quotes/${quote.id}`}>Review quote<ArrowRight className="ml-2 h-4 w-4" /></Link></Button></div>)}</section>}
    {Boolean(enquiries.data?.length) && <section className="space-y-3 border-b border-border pb-5"><h2 className="font-semibold">Website enquiries</h2>{enquiries.data?.map(e => <div key={e.id} role="button" tabIndex={0} onClick={() => { if (!converting) openEnquiry(e.id); }} onKeyDown={ev => { if (ev.key === "Enter" && !converting) openEnquiry(e.id); }} className="-mx-2 flex cursor-pointer flex-wrap items-center justify-between gap-3 rounded-md border-t border-border px-2 py-3 transition-colors hover:bg-muted/60"><div><p className="font-medium">{e.customer?.full_name ?? "Customer"}</p><p className="text-sm text-muted-foreground">{e.preferred_start_at?.slice(0, 10)} · {e.customer_notes}</p></div><Button variant="outline" disabled={Boolean(converting)} onClick={ev => { ev.stopPropagation(); openEnquiry(e.id); }}>Open for review<ArrowRight className="ml-2 h-4 w-4" /></Button></div>)}</section>}
    <div className="flex flex-wrap items-center gap-3"><label className="flex items-center gap-2 rounded-md border border-input bg-background px-3"><Search className="h-4 w-4 text-muted-foreground" /><input aria-label="Search hotel pipeline" placeholder="Customer, pet or booking" value={search} onChange={e => setSearch(e.target.value)} className="h-10 min-w-0 bg-transparent text-sm outline-none" /></label><div role="group" aria-label="Pipeline stage" className="flex flex-wrap gap-2">{stages.map(s => <button key={s.key} type="button" aria-pressed={stage === s.key} onClick={() => setStage(s.key)} className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${stage === s.key ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background text-muted-foreground hover:bg-muted/60 hover:text-foreground"}`}>{s.label} <span className={stage === s.key ? "opacity-80" : "text-muted-foreground"}>({counts[s.key] ?? 0})</span></button>)}</div><span className="text-sm text-muted-foreground">{rows.length} stays</span></div>
    {q.isLoading ? <p className="text-sm text-muted-foreground">Loading stays…</p> : q.error ? <p className="text-sm text-destructive">Could not load the hotel pipeline.</p> : !rows.length ? <p className="py-10 text-sm text-muted-foreground">No stays match these filters.</p> : <div className="divide-y divide-border">{rows.map(b => <div key={b.id} role="link" tabIndex={0} onClick={() => navigate(`/admin/bookings/${b.id}`, { state: { from: "/admin/hotel-cattery/pipeline" } })} onKeyDown={e => { if (e.key === "Enter") navigate(`/admin/bookings/${b.id}`, { state: { from: "/admin/hotel-cattery/pipeline" } }); }} className="-mx-2 cursor-pointer rounded-md px-2 transition-colors hover:bg-muted/60 flex flex-wrap items-center justify-between gap-4 py-5"><div className="min-w-0 space-y-1"><div className="font-semibold">{b.customer?.full_name ?? "Customer"} · {b.booking_pets.map(p => p.pet?.name).filter(Boolean).join(", ")}</div><div className="text-sm text-muted-foreground">{b.booking_number} · {b.start_at ? new Date(b.start_at).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" }) : "Dates needed"}</div>{(() => { const g = glance(b); if (!g) return null; return <div className="flex flex-wrap gap-2 pt-1">{g.accepted ? <span className="inline-flex items-center gap-1.5 rounded-full bg-sk-green-soft px-3 py-1 text-sm font-semibold text-sk-green"><BadgeCheck className="h-4 w-4" />Quote accepted{g.est.accepted_at ? ` · ${new Date(g.est.accepted_at).toLocaleString("en-ZA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Johannesburg" })}` : ""}</span> : quoteSendState(g.est) === "sent" ? <span className="rounded-full bg-sk-orange-soft px-3 py-1 text-sm font-semibold text-sk-orange">Quote {g.est.estimate_number} sent · awaiting acceptance</span> : <span className="inline-flex items-center gap-1.5 rounded-full bg-sk-red-soft px-3 py-1 text-sm font-semibold text-destructive"><CircleAlert className="h-4 w-4" />Quote {g.est.estimate_number} prepared · Not sent yet</span>}<span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-sm font-medium"><Wallet className="h-4 w-4" />{g.pct >= 100 ? "Full payment" : `${g.pct}% deposit`} {zar(g.amount)} on confirmation</span></div>; })()}</div><div className="flex items-center gap-4"><BookingStatusChip status={b.status} /><Button variant="outline" asChild><Link to={`/admin/bookings/${b.id}`} state={{ from: "/admin/hotel-cattery/pipeline" }}>Review stay<ArrowRight className="ml-2 h-4 w-4" /></Link></Button></div></div>)}</div>}
  </div></>;
}