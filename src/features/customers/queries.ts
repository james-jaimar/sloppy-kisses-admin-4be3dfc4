import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type CustomerRow = Database["public"]["Tables"]["customers"]["Row"];
export type PetRow = Database["public"]["Tables"]["pets"]["Row"];

export interface CustomerListRow {
  id: string;
  customer_number: string | null;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  mobile: string | null;
  city: string | null;
  suburb: string | null;
  status: CustomerRow["status"];
  portal_access_enabled: boolean | null;
  pet_count: number;
}

export interface CustomersPage {
  rows: CustomerListRow[];
  total: number;
  page: number;
  pageSize: number;
}

export function useCustomers(params: {
  tenantId: string | null | undefined;
  search?: string;
  page?: number;
  pageSize?: number;
}) {
  const { tenantId, search = "", page = 0, pageSize = 50 } = params;
  return useQuery({
    queryKey: ["customers", "list", tenantId, search, page, pageSize],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<CustomersPage> => {
      const from = page * pageSize;
      const to = from + pageSize - 1;
      let query = supabase
        .from("customers")
        .select(
          "id, customer_number, full_name, first_name, last_name, email, mobile, city, suburb, status, portal_access_enabled, pets(count)",
          { count: "exact" },
        )
        .eq("tenant_id", tenantId as string)
        .order("full_name", { ascending: true, nullsFirst: false })
        .range(from, to);

      const s = search.trim();
      if (s) {
        const q = `%${s}%`;
        query = query.or(
          `full_name.ilike.${q},first_name.ilike.${q},last_name.ilike.${q},email.ilike.${q},mobile.ilike.${q},customer_number.ilike.${q}`,
        );
      }

      const { data, error, count } = await query;
      if (error) throw error;
      const rows = (data ?? []).map((c: any) => ({
        id: c.id,
        customer_number: c.customer_number,
        full_name: c.full_name,
        first_name: c.first_name,
        last_name: c.last_name,
        email: c.email,
        mobile: c.mobile,
        city: c.city,
        suburb: c.suburb,
        status: c.status,
        portal_access_enabled: c.portal_access_enabled,
        pet_count: Array.isArray(c.pets) ? Number(c.pets[0]?.count ?? 0) : 0,
      }));
      return { rows, total: count ?? rows.length, page, pageSize };
    },
  });
}

export function useCustomer(customerId: string | null | undefined, tenantId?: string | null) {
  return useQuery({
    queryKey: ["customers", "detail", tenantId, customerId],
    enabled: Boolean(customerId) && Boolean(tenantId),
    queryFn: async (): Promise<CustomerRow | null> => {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("id", customerId as string)
        .eq("tenant_id", tenantId as string)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });
}

export function useCustomerPets(customerId: string | null | undefined, tenantId?: string | null) {
  return useQuery({
    queryKey: ["pets", "byCustomer", tenantId, customerId],
    enabled: Boolean(customerId) && Boolean(tenantId),
    queryFn: async (): Promise<PetRow[]> => {
      const { data, error } = await supabase
        .from("pets")
        .select("*")
        .eq("customer_id", customerId as string)
        .eq("tenant_id", tenantId as string)
        .order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function usePets(search: string = "") {
  return useQuery({
    queryKey: ["pets", "list", search],
    queryFn: async () => {
      let query = supabase
        .from("pets")
        .select(
          "id, pet_number, name, species, breed, sex, size, status, customer_id, customers(id, customer_number, full_name)",
        )
        .order("pet_number", { ascending: true })
        .limit(200);
      if (search.trim()) {
        const q = `%${search.trim()}%`;
        query = query.or(`name.ilike.${q},breed.ilike.${q},pet_number.ilike.${q}`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCustomerAndPetCounts() {
  return useQuery({
    queryKey: ["stats", "customerPetCounts"],
    queryFn: async () => {
      const [{ count: customers, error: e1 }, { count: pets, error: e2 }] = await Promise.all([
        supabase.from("customers").select("id", { count: "exact", head: true }),
        supabase.from("pets").select("id", { count: "exact", head: true }),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      return { customers: customers ?? 0, pets: pets ?? 0 };
    },
  });
}