import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type CustomerRow = Database["public"]["Tables"]["customers"]["Row"];
export type PetRow = Database["public"]["Tables"]["pets"]["Row"];
export type CustomerInsert = Database["public"]["Tables"]["customers"]["Insert"];
export type CustomerUpdate = Database["public"]["Tables"]["customers"]["Update"];
export type PetInsert = Database["public"]["Tables"]["pets"]["Insert"];
export type PetUpdate = Database["public"]["Tables"]["pets"]["Update"];

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
  sortColumn?: "full_name" | "email" | "status" | "customer_number";
  sortAscending?: boolean;
}) {
  const { tenantId, search = "", page = 0, pageSize = 50, sortColumn = "full_name", sortAscending = true } = params;
  return useQuery({
    queryKey: ["customers", "list", tenantId, search, page, pageSize, sortColumn, sortAscending],
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
        .order(sortColumn, { ascending: sortAscending, nullsFirst: false })
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

export interface PetsPage {
  rows: any[];
  total: number;
  page: number;
  pageSize: number;
}

export function useTenantPets(params: {
  tenantId: string | null | undefined;
  search?: string;
  page?: number;
  pageSize?: number;
  sortColumn?: "name" | "breed" | "species" | "status" | "pet_number";
  sortAscending?: boolean;
}) {
  const { tenantId, search = "", page = 0, pageSize = 50, sortColumn = "name", sortAscending = true } = params;
  return useQuery({
    queryKey: ["pets", "tenantList", tenantId, search, page, pageSize, sortColumn, sortAscending],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<PetsPage> => {
      const from = page * pageSize;
      const to = from + pageSize - 1;
      const s = search.trim();

      // If searching, find matching customer ids (by number or name) up-front,
      // then OR-match those into the pets query.
      let matchingCustomerIds: string[] = [];
      if (s) {
        const q = `%${s}%`;
        const { data: cids, error: cerr } = await supabase
          .from("customers")
          .select("id")
          .eq("tenant_id", tenantId as string)
          .or(`full_name.ilike.${q},customer_number.ilike.${q}`)
          .limit(500);
        if (cerr) throw cerr;
        matchingCustomerIds = (cids ?? []).map((c: any) => c.id);
      }

      let query = supabase
        .from("pets")
        .select(
          "id, pet_number, name, species, breed, sex, size, status, customer_id, customers(id, customer_number, full_name)",
          { count: "exact" },
        )
        .eq("tenant_id", tenantId as string)
        .order(sortColumn, { ascending: sortAscending, nullsFirst: false })
        .range(from, to);

      if (s) {
        const q = `%${s}%`;
        const parts = [
          `name.ilike.${q}`,
          `breed.ilike.${q}`,
          `pet_number.ilike.${q}`,
        ];
        if (matchingCustomerIds.length) {
          parts.push(`customer_id.in.(${matchingCustomerIds.join(",")})`);
        }
        query = query.or(parts.join(","));
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return { rows: data ?? [], total: count ?? 0, page, pageSize };
    },
  });
}

export function usePet(petId: string | null | undefined, tenantId?: string | null) {
  return useQuery({
    queryKey: ["pets", "detail", tenantId, petId],
    enabled: Boolean(petId) && Boolean(tenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pets")
        .select("*, customers(id, customer_number, full_name, first_name, last_name, email, mobile, phone_alt)")
        .eq("id", petId as string)
        .eq("tenant_id", tenantId as string)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

// ---------- Mutations ----------

export function useCreateCustomer(tenantId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<CustomerInsert, "tenant_id" | "customer_number" | "full_name"> & { full_name?: string }) => {
      if (!tenantId) throw new Error("No tenant selected");
      const { data: numData, error: numErr } = await supabase.rpc("next_customer_number", {
        target_tenant_id: tenantId,
      });
      if (numErr) throw numErr;
      const customer_number = numData as unknown as string;
      const full_name =
        input.full_name?.trim() ||
        [input.first_name, input.last_name].filter(Boolean).join(" ").trim() ||
        "Unnamed";
      const { data, error } = await supabase
        .from("customers")
        .insert({ ...input, full_name, customer_number, tenant_id: tenantId } as CustomerInsert)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });
}

export function useUpdateCustomer(tenantId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: CustomerUpdate }) => {
      if (!tenantId) throw new Error("No tenant selected");
      // Never allow changing customer_number or tenant_id via this mutation
      const { customer_number: _cn, tenant_id: _tid, ...safe } = patch as any;
      const { data, error } = await supabase
        .from("customers")
        .update(safe)
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["customers", "detail", tenantId, vars.id] });
    },
  });
}

export function useCreatePet(tenantId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<PetInsert, "tenant_id" | "pet_number">) => {
      if (!tenantId) throw new Error("No tenant selected");
      if (!input.customer_id) throw new Error("Pet must be linked to a customer");
      const { data: numData, error: numErr } = await supabase.rpc("next_pet_number", {
        target_tenant_id: tenantId,
      });
      if (numErr) throw numErr;
      const pet_number = numData as unknown as string;
      const { data, error } = await supabase
        .from("pets")
        .insert({ ...input, tenant_id: tenantId, pet_number } as PetInsert)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["pets"] });
      qc.invalidateQueries({ queryKey: ["pets", "byCustomer", tenantId, vars.customer_id] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });
}

export function useUpdatePet(tenantId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: PetUpdate }) => {
      if (!tenantId) throw new Error("No tenant selected");
      const { pet_number: _pn, tenant_id: _tid, customer_id: _cid, ...safe } = patch as any;
      const { data, error } = await supabase
        .from("pets")
        .update(safe)
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pets"] });
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