import { fetchBookingInvoices } from "@/features/shared/payments/deskInvoiceQueries";
import { visitInvoiceState, outstandingTotal } from "@/features/shared/payments/invoiceSummary";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

export type GlobalSearchGroup = "customers" | "pets" | "bookings" | "invoices";

export interface GlobalSearchHit {
  group: GlobalSearchGroup;
  id: string;
  title: string;
  subtitle: string;
  to: string;
  balance?: number;
  financialUnavailable?: boolean;
  invoiceState?: string;
}

function esc(v: string) {
  return v.replace(/[,()]/g, " ").trim();
}

export const GROUP_LABEL: Record<GlobalSearchGroup, string> = {
  customers: "Customers",
  pets: "Pets",
  bookings: "Bookings",
  invoices: "Invoices",
};

/** Debounced-by-caller global lookup across customers, pets, bookings and invoices. */
export function useGlobalSearch(
  tenantId: string | null | undefined,
  query: string,
  opts: { customers: boolean; pets: boolean; bookings: boolean; invoices: boolean },
) {
  const q = esc(query);
  return useQuery({
    queryKey: ["global-search", tenantId, q.toLowerCase(), opts],
    enabled: Boolean(tenantId) && q.length >= 2,
    staleTime: 15_000,
    placeholderData: (prev) => prev,
    queryFn: async (): Promise<GlobalSearchHit[]> => {
      const like = `%${q}%`;
      const tid = tenantId as string;

      const [cust, pets, bookings, invoices] = await Promise.all([
        opts.customers
          ? supabase
              .from("customers")
              .select("id, full_name, customer_number, email, mobile")
              .eq("tenant_id", tid)
              .or(
                `full_name.ilike.${like},customer_number.ilike.${like},email.ilike.${like},mobile.ilike.${like}`,
              )
              .limit(5)
          : Promise.resolve({ data: [], error: null } as any),
        opts.pets
          ? supabase
              .from("pets")
              .select("id, name, breed, species, customer:customers(id, full_name, customer_number)")
              .eq("tenant_id", tid)
              .or(`name.ilike.${like},breed.ilike.${like},pet_number.ilike.${like}`)
              .limit(5)
          : Promise.resolve({ data: [], error: null } as any),
        opts.bookings
          ? supabase
              .from("bookings")
              .select("id, booking_number, service_type, start_at, status, customer:customers(full_name), booking_pets(pet:pets(name))")
              .eq("tenant_id", tid)
              .ilike("booking_number", like)
              .order("start_at", { ascending: false, nullsFirst: false })
              .limit(5)
          : Promise.resolve({ data: [], error: null } as any),
        opts.invoices
          ? supabase
              .from("invoices")
              .select("id, invoice_number, status, total, balance_due, customer:customers(full_name)")
              .eq("tenant_id", tid)
              .ilike("invoice_number", like)
              .order("created_at", { ascending: false })
              .limit(5)
          : Promise.resolve({ data: [], error: null } as any),
      ]);

      for (const result of [cust, pets, bookings, invoices]) if (result.error) throw result.error;
      const customerIds = [...new Set([...(cust.data ?? []).map((c: any) => c.id), ...(pets.data ?? []).map((p: any) => p.customer?.id)].filter(Boolean))] as string[];
      const petIds = (pets.data ?? []).map((p: any) => p.id);
      let matchedVisits: any[] = [];
      if (opts.bookings && (customerIds.length || petIds.length)) {
        let petVisitIds: string[] = [];
        if (petIds.length) {
          const links = await supabase.from("booking_pets").select("booking_id").eq("tenant_id", tid).in("pet_id", petIds).limit(100);
          if (links.error) throw links.error;
          petVisitIds = [...new Set((links.data ?? []).map(l => l.booking_id))];
        }
        const filters = [customerIds.length ? `customer_id.in.(${customerIds.join(",")})` : "", petVisitIds.length ? `id.in.(${petVisitIds.join(",")})` : ""].filter(Boolean);
        if (filters.length) {
          const visits = await supabase.from("bookings").select("id, booking_number, service_type, start_at, status, customer:customers(full_name), booking_pets(pet:pets(name))").eq("tenant_id", tid).or(filters.join(",")).order("start_at", { ascending: false }).limit(30);
          if (visits.error) throw visits.error;
          matchedVisits = visits.data ?? [];
        }
      }
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" });
      const visitRows = [...new Map([...(bookings.data ?? []), ...matchedVisits].map((b: any) => [b.id, b])).values()].sort((a: any, b: any) => {
        const current = (v: any) => v.start_at && new Date(v.start_at).toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" }) === today ? 1 : 0;
        return current(b) - current(a) || new Date(b.start_at ?? 0).getTime() - new Date(a.start_at ?? 0).getTime();
      }).slice(0, 8);
      let balances: Record<string, any[]> = {};
      let accountInvoices: any[] = [];
      let financialUnavailable = false;
      if (opts.invoices) {
        try {
          balances = await fetchBookingInvoices(tid, visitRows.map((b: any) => b.id));
          if (customerIds.length) {
            const accounts = await supabase.from("invoices").select("id, customer_id, status, balance_due").eq("tenant_id", tid).in("customer_id", customerIds).not("status", "in", "(draft,cancelled,paid)");
            if (accounts.error) throw accounts.error;
            accountInvoices = accounts.data ?? [];
          }
        } catch { financialUnavailable = true; }
      }
      const accountBalance = (id: string) => opts.invoices && !financialUnavailable ? outstandingTotal(accountInvoices.filter(inv => inv.customer_id === id)) : undefined;
      const hits: GlobalSearchHit[] = [];

      for (const c of ((cust as any).data ?? []) as any[]) {
        hits.push({
          group: "customers",
          id: c.id,
          title: c.full_name ?? "Unnamed customer",
          balance: accountBalance(c.id), financialUnavailable: opts.invoices && financialUnavailable,
          subtitle: [c.customer_number, c.email ?? c.mobile].filter(Boolean).join(" · "),
          to: `/admin/customers/${c.id}`,
        });
      }
      for (const p of ((pets as any).data ?? []) as any[]) {
        hits.push({
          group: "pets",
          id: p.id,
          title: p.name,
          balance: accountBalance(p.customer?.id), financialUnavailable: opts.invoices && financialUnavailable,
          subtitle: [p.breed ?? p.species, p.customer?.full_name].filter(Boolean).join(" · "),
          to: `/admin/pets/${p.id}`,
        });
      }
      for (const b of visitRows as any[]) {
        const when = b.start_at
          ? new Date(b.start_at).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" })
          : "No date";
        hits.push({
          group: "bookings",
          id: b.id,
          title: b.booking_number ?? "Booking",
          invoiceState: opts.invoices && !financialUnavailable ? visitInvoiceState(balances[b.id] ?? []) : undefined,
          balance: opts.invoices && !financialUnavailable && visitInvoiceState(balances[b.id] ?? []) === "outstanding" ? outstandingTotal(balances[b.id]) : undefined, financialUnavailable: opts.invoices && financialUnavailable,
          subtitle: [when, String(b.service_type ?? "").replace(/_/g, " "), b.customer?.full_name, (b.booking_pets ?? []).map((bp: any) => bp.pet?.name).filter(Boolean).join(", ")]
            .filter(Boolean)
            .join(" · "),
          to: `/admin/bookings/${b.id}`,
        });
      }
      for (const i of ((invoices as any).data ?? []) as any[]) {
        hits.push({
          group: "invoices",
          id: i.id,
          title: i.invoice_number ?? "Invoice",
          subtitle: [
            String(i.status ?? "").replace(/_/g, " "),
            `Balance R${Number(i.balance_due ?? 0).toFixed(2)}`,
            i.customer?.full_name,
          ]
            .filter(Boolean)
            .join(" · "),
          to: `/admin/invoices/${i.id}`,
        });
      }

      return hits;
    },
  });
}