import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Printer, Search } from "lucide-react";
import { supabase as sb } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { HOTEL_SERVICE_TYPES } from "./queries";

const supabase = sb as any;
const zar = (n: number | null | undefined) => n == null ? "—" : `R ${Number(n).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dShort = (iso: string | null) => iso ? new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "short" }) : "—";
const nights = (a: string, b: string | null) => {
  if (!b) return null;
  const s = new Date(a); s.setHours(0, 0, 0, 0); const e = new Date(b); e.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((e.getTime() - s.getTime()) / 86400000));
};
type Prep = { ribbon_made: boolean; checkin_card: boolean; gift: boolean; notes: string | null };

function useMonthRows(tenantId: string | null, month: Date, showCancelled: boolean) {
  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  const end = new Date(month.getFullYear(), month.getMonth() + 1, 1);
  return useQuery({
    queryKey: ["hotel_list", tenantId, start.toISOString()],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      const { data: bks, error } = await supabase.from("bookings")
        .select("id, booking_number, status, start_at, end_at, customer:customers(id, full_name), booking_pets(pet:pets(id, name, breed, species)), hotel_booking_details(check_in_window, grooming_required, medication_instructions)")
        .eq("tenant_id", tenantId).in("service_type", HOTEL_SERVICE_TYPES)
        .gte("start_at", start.toISOString()).lt("start_at", end.toISOString())
        .order("start_at", { ascending: true });
      if (error) throw error;
      const ids = (bks ?? []).map((b: any) => b.id);
      if (!ids.length) return [];
      const [inv, est, grm, sur, prep] = await Promise.all([
        supabase.from("invoices").select("id, booking_id, invoice_number, total, amount_paid, balance_due, deposit_due, status").in("booking_id", ids).neq("status", "cancelled"),
        supabase.from("estimates").select("id, booking_id, estimate_number").in("booking_id", ids),
        supabase.from("hotel_grooming_requests").select("hotel_booking_id, status").in("hotel_booking_id", ids),
        supabase.from("hotel_booking_surcharges").select("booking_id, quantity, surcharge:hotel_surcharges(*)").in("booking_id", ids),
        supabase.from("hotel_desk_prep").select("*").in("booking_id", ids),
      ]);
      const by = (r: any, k: string) => { const m: Record<string, any[]> = {}; (r.data ?? []).forEach((x: any) => (m[x[k]] ??= []).push(x)); return m; };
      const I = by(inv, "booking_id"), E = by(est, "booking_id"), G = by(grm, "hotel_booking_id"), S = by(sur, "booking_id"), P = by(prep, "booking_id");
      return (bks ?? []).map((b: any) => {
        const d = Array.isArray(b.hotel_booking_details) ? b.hotel_booking_details[0] : b.hotel_booking_details;
        const pets = (b.booking_pets ?? []).map((x: any) => x.pet).filter(Boolean);
        const groom = (G[b.id] ?? []).some((g: any) => g.status !== "declined") || Boolean(d?.grooming_required);
        const extras = (S[b.id] ?? []).map((s: any) => `${s.surcharge?.name ?? s.surcharge?.label ?? "Extra"}${s.quantity > 1 ? ` ×${s.quantity}` : ""}`);
        if (d?.medication_instructions) extras.push("Meds");
        return { b, d, pets, groom, extras, invoices: I[b.id] ?? [], quotes: E[b.id] ?? [], prep: (P[b.id]?.[0] ?? null) as Prep | null };
      });
    },
    select: (rows: any[]) => showCancelled ? rows : rows.filter((r) => !["cancelled", "no_show"].includes(r.b.status)),
  });
}

export function HotelListView({ tenantId, showCancelled }: { tenantId: string | null; showCancelled: boolean }) {
  const qc = useQueryClient();
  const [month, setMonth] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); });
  const [q, setQ] = useState("");
  const rowsQ = useMonthRows(tenantId, month, showCancelled);
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    const all = rowsQ.data ?? [];
    if (!t) return all;
    return all.filter((r: any) => [r.b.customer?.full_name, r.b.booking_number, ...r.pets.flatMap((p: any) => [p.name, p.breed])].some((v) => v?.toLowerCase().includes(t)));
  }, [rowsQ.data, q]);

  async function savePrep(r: any, patch: Partial<Prep>) {
    const next = { ribbon_made: false, checkin_card: false, gift: false, notes: null, ...(r.prep ?? {}), ...patch };
    const { error } = await supabase.from("hotel_desk_prep").upsert({ booking_id: r.b.id, tenant_id: tenantId, ribbon_made: next.ribbon_made, checkin_card: next.checkin_card, gift: next.gift, notes: next.notes, updated_at: new Date().toISOString() });
    if (error) { toast.error(`Couldn't save: ${error.message}`); return; }
    qc.invalidateQueries({ queryKey: ["hotel_list", tenantId] });
  }

  const label = month.toLocaleDateString("en-ZA", { month: "long", year: "numeric" });
  const shift = (n: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <div className="inline-flex overflow-hidden rounded-lg border border-border bg-card">
          <button onClick={() => shift(-1)} className="grid h-9 w-9 place-items-center hover:bg-muted" title="Previous month"><ChevronLeft className="h-4 w-4" /></button>
          <div className="grid h-9 min-w-[160px] place-items-center border-x border-border px-3 text-sm font-semibold">{label}</div>
          <button onClick={() => shift(1)} className="grid h-9 w-9 place-items-center hover:bg-muted" title="Next month"><ChevronRight className="h-4 w-4" /></button>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search client, pet or breed" className="pl-8" />
        </div>
        <span className="text-sm text-muted-foreground">{rows.length} stay{rows.length === 1 ? "" : "s"} arriving</span>
        <Button variant="outline" className="ml-auto" onClick={() => window.print()}><Printer className="mr-1 h-4 w-4" /> Print</Button>
      </div>
      <h2 className="hidden text-lg font-semibold print:block">Hotel bookings — {label}</h2>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[1200px] text-sm">
          <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>{["#", "Client", "Pets", "Breed", "In", "Out", "Time", "Nights", "Groom", "Other", "Quote", "Invoice", "Amount", "Ribbon", "Card", "Gift", "Notes"].map((h) => <th key={h} className="px-2 py-2 font-semibold">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rowsQ.isLoading && <tr><td colSpan={17} className="p-6 text-center text-muted-foreground">Loading…</td></tr>}
            {!rowsQ.isLoading && rows.length === 0 && <tr><td colSpan={17} className="p-6 text-center text-muted-foreground">No hotel stays arriving in {label}.</td></tr>}
            {rows.map((r: any, i: number) => {
              const inv = r.invoices[0];
              const cancelled = ["cancelled", "no_show"].includes(r.b.status);
              return (
                <tr key={r.b.id} className={`border-t border-border align-top ${cancelled ? "opacity-50 line-through" : i % 2 ? "bg-muted/40" : ""}`}>
                  <td className="px-2 py-2 text-muted-foreground">{i + 1}</td>
                  <td className="px-2 py-2 font-medium"><Link className="hover:underline" to={`/admin/bookings/${r.b.id}`}>{r.b.customer?.full_name ?? "—"}</Link></td>
                  <td className="px-2 py-2">{r.pets.map((p: any) => p.name).join(", ") || "—"}</td>
                  <td className="px-2 py-2 text-muted-foreground">{r.pets.map((p: any) => p.breed || (p.species === "cat" ? "Cat" : "—")).join(", ")}</td>
                  <td className="whitespace-nowrap px-2 py-2">{dShort(r.b.start_at)}</td>
                  <td className="whitespace-nowrap px-2 py-2">{dShort(r.b.end_at)}</td>
                  <td className="whitespace-nowrap px-2 py-2">{r.d?.check_in_window ?? "—"}</td>
                  <td className="px-2 py-2 text-center">{nights(r.b.start_at, r.b.end_at) ?? "—"}</td>
                  <td className="px-2 py-2">{r.groom ? "Yes" : "No"}</td>
                  <td className="px-2 py-2 text-xs">{r.extras.join(", ") || "—"}</td>
                  <td className="px-2 py-2">{r.quotes.map((e: any) => <Link key={e.id} className="block hover:underline" to={`/admin/quotes/${e.id}`}>{e.estimate_number}</Link>)}{!r.quotes.length && "—"}</td>
                  <td className="px-2 py-2">{inv ? <Link className="hover:underline" to={`/admin/invoices/${inv.id}`}>{inv.invoice_number}</Link> : "—"}</td>
                  <td className="whitespace-nowrap px-2 py-2">{inv ? <><div>{zar(inv.total)}</div><div className="text-xs text-muted-foreground">{Number(inv.balance_due) <= 0 ? "Paid" : `Paid ${zar(inv.amount_paid)}`}</div></> : "—"}</td>
                  {(["ribbon_made", "checkin_card", "gift"] as const).map((k) => (
                    <td key={k} className="px-2 py-2 text-center"><Checkbox aria-label={k} checked={Boolean(r.prep?.[k])} onCheckedChange={(v) => savePrep(r, { [k]: v === true })} /></td>
                  ))}
                  <td className="px-2 py-2"><Input key={r.prep?.notes ?? ""} defaultValue={r.prep?.notes ?? ""} placeholder="Note" className="h-8 min-w-[140px] text-xs"
                    onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== (r.prep?.notes ?? null)) savePrep(r, { notes: v }); }} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
