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
  status: CustomerRow["status"];
  portal_access_enabled: boolean | null;
  pet_count: number;
}

export function useCustomers(search: string = "") {
  return useQuery({
    queryKey: ["customers", "list", search],
    queryFn: async (): Promise<CustomerListRow[]> => {
      let query = supabase
        .from("customers")
        .select(
          "id, customer_number, full_name, first_name, last_name, email, mobile, status, portal_access_enabled, pets(count)",
        )
        .order("customer_number", { ascending: true })
        .limit(200);

      if (search.trim()) {
        const q = `%${search.trim()}%`;
        query = query.or(
          `full_name.ilike.${q},email.ilike.${q},mobile.ilike.${q},customer_number.ilike.${q}`,
        );
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map((c: any) => ({
        id: c.id,
        customer_number: c.customer_number,
        full_name: c.full_name,
        first_name: c.first_name,
        last_name: c.last_name,
        email: c.email,
        mobile: c.mobile,
        status: c.status,
        portal_access_enabled: c.portal_access_enabled,
        pet_count: Array.isArray(c.pets) ? Number(c.pets[0]?.count ?? 0) : 0,
      }));
    },
  });
}

export function useCustomer(customerId: string | null | undefined) {
  return useQuery({
    queryKey: ["customers", "detail", customerId],
    enabled: Boolean(customerId),
    queryFn: async (): Promise<CustomerRow | null> => {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("id", customerId as string)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });
}

export function useCustomerPets(customerId: string | null | undefined) {
  return useQuery({
    queryKey: ["pets", "byCustomer", customerId],
    enabled: Boolean(customerId),
    queryFn: async (): Promise<PetRow[]> => {
      const { data, error } = await supabase
        .from("pets")
        .select("*")
        .eq("customer_id", customerId as string)
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