import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

export interface CustomerContact {
  id: string;
  tenant_id: string;
  customer_id: string;
  full_name: string;
  relationship: string | null;
  mobile: string | null;
  email: string | null;
  receives_emails: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type CustomerContactInput = {
  full_name: string;
  relationship: string | null;
  mobile: string | null;
  email: string | null;
  receives_emails: boolean;
};

const db = supabase as any;

export function useCustomerContacts(customerId: string | null | undefined) {
  return useQuery({
    queryKey: ["customer_contacts", customerId],
    enabled: Boolean(customerId),
    queryFn: async (): Promise<CustomerContact[]> => {
      const { data, error } = await db
        .from("customer_contacts")
        .select("*")
        .eq("customer_id", customerId as string)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CustomerContact[];
    },
  });
}

export function useSaveCustomerContact(tenantId: string | null | undefined, customerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: CustomerContactInput }) => {
      if (!tenantId) throw new Error("No tenant selected");
      if (id) {
        const { error } = await db.from("customer_contacts").update(input).eq("id", id);
        if (error) throw error;
        return id;
      }
      const { data, error } = await db
        .from("customer_contacts")
        .insert({ ...input, tenant_id: tenantId, customer_id: customerId })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customer_contacts", customerId] }),
  });
}

export function useDeleteCustomerContact(customerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("customer_contacts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customer_contacts", customerId] }),
  });
}

export function useSwapAccountHolder(customerId: string, tenantId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (contactId: string) => {
      const { error } = await db.rpc("swap_customer_account_holder", { p_contact_id: contactId });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer_contacts", customerId] });
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["customers", "detail", tenantId, customerId] });
    },
  });
}
