import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/AuthContext";

export interface CustomerNote {
  id: string;
  tenant_id: string;
  customer_id: string;
  author_profile_id: string | null;
  body: string;
  pinned: boolean;
  alert: boolean;
  created_at: string;
  updated_at: string;
  author?: { id: string; full_name: string | null; email: string | null } | null;
}

const SELECT = "*, author:profiles!customer_notes_author_profile_id_fkey(id, full_name, email)";

export function useCustomerNotes(customerId: string | null | undefined, tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["customer_notes", tenantId, customerId],
    enabled: Boolean(customerId && tenantId),
    queryFn: async (): Promise<CustomerNote[]> => {
      const { data, error } = await supabase
        .from("customer_notes")
        .select(SELECT)
        .eq("tenant_id", tenantId as string)
        .eq("customer_id", customerId as string)
        .order("pinned", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any;
    },
  });
}

// Pinned notes for a customer (used by banner)
export function useCustomerPinnedNotes(customerId: string | null | undefined, tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["customer_notes", "pinned", tenantId, customerId],
    enabled: Boolean(customerId && tenantId),
    queryFn: async (): Promise<CustomerNote[]> => {
      const { data, error } = await supabase
        .from("customer_notes")
        .select(SELECT)
        .eq("tenant_id", tenantId as string)
        .eq("customer_id", customerId as string)
        .eq("pinned", true)
        .order("alert", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any;
    },
  });
}

async function getMyProfileId(authUserId: string | undefined) {
  if (!authUserId) return null;
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  return data?.id ?? null;
}

export function useCreateCustomerNote(tenantId: string | null | undefined, customerId: string | null | undefined) {
  const qc = useQueryClient();
  const { authUser } = useAuth();
  return useMutation({
    mutationFn: async (input: { body: string; pinned: boolean; alert: boolean }) => {
      if (!tenantId || !customerId) throw new Error("Missing tenant or customer");
      const author_profile_id = await getMyProfileId(authUser?.id);
      const { data, error } = await supabase
        .from("customer_notes")
        .insert({
          tenant_id: tenantId,
          customer_id: customerId,
          author_profile_id,
          body: input.body.trim(),
          pinned: input.pinned,
          alert: input.alert,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer_notes", tenantId, customerId] });
      qc.invalidateQueries({ queryKey: ["customer_notes", "pinned", tenantId, customerId] });
    },
  });
}

export function useUpdateCustomerNote(tenantId: string | null | undefined, customerId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; body?: string; pinned?: boolean; alert?: boolean }) => {
      const patch: Record<string, unknown> = {};
      if (input.body !== undefined) patch.body = input.body.trim();
      if (input.pinned !== undefined) patch.pinned = input.pinned;
      if (input.alert !== undefined) patch.alert = input.alert;
      const { error } = await supabase.from("customer_notes").update(patch).eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer_notes", tenantId, customerId] });
      qc.invalidateQueries({ queryKey: ["customer_notes", "pinned", tenantId, customerId] });
    },
  });
}

export function useDeleteCustomerNote(tenantId: string | null | undefined, customerId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("customer_notes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer_notes", tenantId, customerId] });
      qc.invalidateQueries({ queryKey: ["customer_notes", "pinned", tenantId, customerId] });
    },
  });
}