import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

export type GlobalSearchGroup = "customers" | "pets" | "bookings" | "invoices";

export interface GlobalSearchHit {
  group: GlobalSearchGroup;
  id: string;
  title: string;
  subtitle: string;
  to: string;
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
              .select("id, booking_number, service_type, start_at, status, customer:customers(full_name)")
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

      const hits: GlobalSearchHit[] = [];

      for (const c of ((cust as any).data ?? []) as any[]) {
        hits.push({
          group: "customers",
          id: c.id,
          title: c.full_name ?? "Unnamed customer",
          subtitle: [c.customer_number, c.email ?? c.mobile].filter(Boolean).join(" · "),
          to: `/admin/customers/${c.id}`,
        });
      }
      for (const p of ((pets as any).data ?? []) as any[]) {
        hits.push({
          group: "pets",
          id: p.id,
          title: p.name,
          subtitle: [p.breed ?? p.species, p.customer?.full_name].filter(Boolean).join(" · "),
          to: `/admin/pets/${p.id}`,
        });
      }
      for (const b of ((bookings as any).data ?? []) as any[]) {
        const when = b.start_at
          ? new Date(b.start_at).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" })
          : "No date";
        hits.push({
          group: "bookings",
          id: b.id,
          title: b.booking_number ?? "Booking",
          subtitle: [when, String(b.service_type ?? "").replace(/_/g, " "), b.customer?.full_name]
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
            `R${Number(i.total ?? 0).toFixed(2)}`,
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