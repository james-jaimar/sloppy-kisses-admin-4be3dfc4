import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type CustomerAddressRow = Database["public"]["Tables"]["customer_addresses"]["Row"];
export type CustomerAddressInsert = Database["public"]["Tables"]["customer_addresses"]["Insert"];
export type CustomerAddressUpdate = Database["public"]["Tables"]["customer_addresses"]["Update"];

/** Mirror a primary address back onto the legacy customer columns. */
async function mirrorToCustomer(tenantId: string, customerId: string, row: any) {
  if (!row?.is_primary) return;
  const { error } = await supabase
    .from("customers")
    .update({
      address_line_1: row.address_line_1 ?? null,
      address_line_2: row.address_line_2 ?? null,
      suburb: row.suburb ?? null,
      city: row.city ?? null,
      province: row.province ?? null,
      postcode: row.postcode ?? null,
    })
    .eq("id", customerId)
    .eq("tenant_id", tenantId);
  if (error) console.error("Failed to mirror address to customer", error);
}

export function useCustomerAddresses(customerId: string | null | undefined, tenantId?: string | null) {
  return useQuery({
    queryKey: ["customer_addresses", tenantId, customerId],
    enabled: Boolean(customerId) && Boolean(tenantId),
    queryFn: async (): Promise<CustomerAddressRow[]> => {
      const { data, error } = await supabase
        .from("customer_addresses")
        .select("*")
        .eq("customer_id", customerId as string)
        .eq("tenant_id", tenantId as string)
        .order("is_primary", { ascending: false })
        .order("label", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateCustomerAddress(tenantId: string | null | undefined, customerId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<CustomerAddressInsert, "tenant_id" | "customer_id">) => {
      if (!tenantId || !customerId) throw new Error("No tenant or customer selected");
      const { data, error } = await supabase
        .from("customer_addresses")
        .insert({ ...input, tenant_id: tenantId, customer_id: customerId } as CustomerAddressInsert)
        .select("*")
        .single();
      if (error) throw error;
      await mirrorToCustomer(tenantId, customerId, data);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer_addresses", tenantId, customerId] });
      qc.invalidateQueries({ queryKey: ["customers"] });
    },
  });
}

export function useUpdateCustomerAddress(tenantId: string | null | undefined, customerId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: CustomerAddressUpdate }) => {
      if (!tenantId || !customerId) throw new Error("No tenant or customer selected");
      const { tenant_id: _tid, customer_id: _cid, id: _id, ...safe } = patch as any;
      const { data, error } = await supabase
        .from("customer_addresses")
        .update(safe)
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .eq("customer_id", customerId)
        .select("*")
        .single();
      if (error) throw error;
      await mirrorToCustomer(tenantId, customerId, data);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer_addresses", tenantId, customerId] });
      qc.invalidateQueries({ queryKey: ["customers"] });
    },
  });
}

export function useDeleteCustomerAddress(tenantId: string | null | undefined, customerId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!tenantId || !customerId) throw new Error("No tenant or customer selected");
      const { error } = await supabase
        .from("customer_addresses")
        .delete()
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .eq("customer_id", customerId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer_addresses", tenantId, customerId] });
    },
  });
}
