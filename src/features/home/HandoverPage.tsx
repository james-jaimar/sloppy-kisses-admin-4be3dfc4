import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, LogIn, LogOut, Receipt, StickyNote, Inbox, AlertTriangle } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase/client";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import { useBookingPeekClick } from "@/features/bookings/BookingPeek";
import { dayBounds, fmtTime } from "@/features/lists/queries";

const SERVICE_LABEL: Record<string, string> = {
  daycare: "Daycare", daycare_assessment: "Assessment", hotel_dog: "Dog hotel", hotel_cat: "Cattery",
  grooming_inhouse: "Grooming", grooming_mobile: "Mobile groom", pickup_dropoff: "Transport",
};
const DEAD = ["cancelled", "no_show"];
const OPEN_INVOICE = ["issued", "part_paid", "overdue", "sent"];

function startOfDay(d: Date) { const c = new Date(d); c.setHours(0, 0, 0, 0); return c; }
function addDays(d: Date, n: number) { const c = new Date(d); c.setDate(c.getDate() + n); return c; }
const zar = (n: number) => `R${n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface Row {
  id: string; booking_number: string | null; status: string; service_type: string;
  start_at: string; end_at: string | null; shift_note: string | null; customer_id: string | null;
  customer: { id: string; full_name: string } | null;
  booking_pets: { pet: { name: string } | null }[];
}

function useHandover(tenantId: string | null, day: Date) {
  const { startIso, endIso } = dayBounds(day);
  return useQuery({
    queryKey: ["handover", tenantId, startIso],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      const sel = "id, booking_number, status, service_type, start_at, end_at, shift_note, customer_id, customer:customers(id, full_name), booking_pets(pet:pets(name))";
      const [arr, dep, req] = await Promise.all([
        supabase.from("bookings").select(sel).eq("tenant_id", tenantId!).gte("start_at", startIso).lt("start_at", endIso).order("start_at"),
        supabase.from("bookings").select(sel).eq("tenant_id", tenantId!).in("service_type", ["hotel_dog", "hotel_cat"] as any)
          .gte("end_at", startIso).lt("end_at", endIso).lt("start_at", startIso).order("end_at"),
        supabase.from("booking_requests").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId!).in("status", ["pending_review", "needs_info"] as any),
      ]);
      if (arr.error) throw arr.error;
      if (dep.error) throw dep.error;
      const arrivals = ((arr.data ?? []) as unknown as Row[]).filter((b) => !DEAD.includes(b.status));
      const departures = ((dep.data ?? []) as unknown as Row[]).filter((b) => !DEAD.includes(b.status));
      const all = [...arrivals, ...departures];
      const customerIds = [...new Set(all.map((b) => b.customer_id).filter(Boolean))] as string[];
      let invoices: any[] = [];
      let notes: any[] = [];
      if (customerIds.length) {
        const [inv, cn] = await Promise.all([
          supabase.from("invoices").select("id, invoice_number, customer_id, booking_id, balance_due, due_date, status")
            .eq("tenant_id", tenantId!).in("customer_id", customerIds).in("status", OPEN_INVOICE as any).gt("balance_due", 0),
          supabase.from("customer_notes").select("id, customer_id, body, alert, pinned")
            .eq("tenant_id", tenantId!).in("customer_id", customerIds).or("alert.eq.true,pinned.eq.true"),
        ]);
        if (inv.error) throw inv.error;
        invoices = inv.data ?? [];
        notes = cn.data ?? [];
      }
      return { arrivals, departures, invoices, notes, openRequests: req.count ?? 0 };
    },
  });
}

export default function HandoverPage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const [day, setDay] = useState(() => startOfDay(new Date()));
  const q = useHandover(tenantId, day);
  const peek = useBookingPeekClick();

  const owing = useMemo(() => {
    const m: Record<string, number> = {};
    for (const i of q.data?.invoices ?? []) m[i.customer_id] = (m[i.customer_id] ?? 0) + Number(i.balance_due);
    return m;
  }, [q.data]);
  const custName = useMemo(() => {
    const m: Record<string, string> = {};
    for (const b of [...(q.data?.arrivals ?? []), ...(q.data?.departures ?? [])]) if (b.customer) m[b.customer.id] = b.customer.full_name;
    return m;
  }, [q.data]);
  const shiftNotes = [...(q.data?.arrivals ?? []), ...(q.data?.departures ?? [])].filter((b) => b.shift_note);

  const dayLabel = day.toLocaleDateString("en-ZA", { weekday: "long", day: "2-digit", month: "short", year: "numeric" });

  const BookingLine = ({ b, time }: { b: Row; time: string | null }) => (
    <li className="flex flex-wrap items-center gap-2 border-b border-border py-2 last:border-0">
      <span className="w-12 font-mono text-sm text-muted-foreground">{fmtTime(time)}</span>
      <Link to={`/admin/bookings/${b.id}`} onClick={peek(b.id)} className="font-medium text-foreground hover:underline">
        {b.customer?.full_name ?? "Walk-in"}
      </Link>
      <span className="text-sm text-muted-foreground">{b.booking_pets.map((p) => p.pet?.name).filter(Boolean).join(", ")}</span>
      <Badge variant="secondary">{SERVICE_LABEL[b.service_type] ?? b.service_type}</Badge>
      <Badge variant="outline">{b.status.replace(/_/g, " ")}</Badge>
      {b.customer_id && owing[b.customer_id] > 0 && <Badge variant="destructive">Owes {zar(owing[b.customer_id])}</Badge>}
      {b.shift_note && <span className="rounded bg-accent px-2 py-0.5 text-xs text-accent-foreground">{b.shift_note}</span>}
    </li>
  );

  const Section = ({ icon: Icon, title, count, children }: any) => (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="mb-2 flex items-center gap-2 font-semibold text-card-foreground">
        <Icon className="h-4 w-4 text-primary" /> {title} <span className="text-muted-foreground">({count})</span>
      </h2>
      {children}
    </section>
  );

  return (
    <div className="flex-1">
      <AppHeader title="Front desk handover" subtitle="Everything the next shift needs to know today" />
      <div className="space-y-4 p-4 md:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setDay(addDays(day, -1))} aria-label="Previous day"><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" onClick={() => setDay(startOfDay(new Date()))}>Today</Button>
          <Button variant="outline" size="icon" onClick={() => setDay(addDays(day, 1))} aria-label="Next day"><ChevronRight className="h-4 w-4" /></Button>
          <span className="font-medium">{dayLabel}</span>
          {(q.data?.openRequests ?? 0) > 0 && (
            <Link to="/admin/hotel-cattery" className="ml-auto">
              <Badge className="gap-1"><Inbox className="h-3 w-3" /> {q.data!.openRequests} requests waiting for review</Badge>
            </Link>
          )}
        </div>
        {q.isLoading && <p className="text-muted-foreground">Loading…</p>}
        {q.error && <p className="text-destructive">Could not load handover: {(q.error as Error).message}</p>}
        {q.data && (
          <div className="grid gap-4 lg:grid-cols-2">
            <Section icon={LogIn} title="Arriving / booked today" count={q.data.arrivals.length}>
              {q.data.arrivals.length ? <ul>{q.data.arrivals.map((b) => <BookingLine key={b.id} b={b} time={b.start_at} />)}</ul>
                : <p className="text-sm text-muted-foreground">Nothing booked.</p>}
            </Section>
            <Section icon={LogOut} title="Hotel departures" count={q.data.departures.length}>
              {q.data.departures.length ? <ul>{q.data.departures.map((b) => <BookingLine key={b.id} b={b} time={b.end_at} />)}</ul>
                : <p className="text-sm text-muted-foreground">No one going home.</p>}
            </Section>
            <Section icon={Receipt} title="Unpaid invoices for today's customers" count={q.data.invoices.length}>
              {q.data.invoices.length ? (
                <ul>{q.data.invoices.map((i) => (
                  <li key={i.id} className="flex items-center gap-2 border-b border-border py-2 last:border-0">
                    <Link to={`/admin/invoices/${i.id}`} className="font-mono text-sm hover:underline">{i.invoice_number}</Link>
                    <span>{custName[i.customer_id]}</span>
                    {i.due_date && <span className="text-xs text-muted-foreground">due {new Date(i.due_date).toLocaleDateString("en-ZA", { day: "2-digit", month: "short" })}</span>}
                    <span className="ml-auto font-semibold text-destructive">{zar(Number(i.balance_due))}</span>
                  </li>))}</ul>
              ) : <p className="text-sm text-muted-foreground">All paid up.</p>}
            </Section>
            <Section icon={StickyNote} title="Notes to pass on" count={shiftNotes.length + q.data.notes.length}>
              {shiftNotes.length + q.data.notes.length === 0 && <p className="text-sm text-muted-foreground">No notes.</p>}
              <ul>
                {q.data.notes.map((n) => (
                  <li key={n.id} className="flex gap-2 border-b border-border py-2 text-sm last:border-0">
                    {n.alert && <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />}
                    <Link to={`/admin/customers/${n.customer_id}`} className="font-medium hover:underline">{custName[n.customer_id]}</Link>
                    <span>{n.body}</span>
                  </li>))}
                {shiftNotes.map((b) => (
                  <li key={b.id} className="flex gap-2 border-b border-border py-2 text-sm last:border-0">
                    <Link to={`/admin/bookings/${b.id}`} onClick={peek(b.id)} className="font-medium hover:underline">{b.customer?.full_name ?? b.booking_number}</Link>
                    <span>{b.shift_note}</span>
                  </li>))}
              </ul>
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}
