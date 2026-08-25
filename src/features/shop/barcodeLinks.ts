import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ProductBarcode {
  id: string;
  tenant_id: string;
  product_id: string;
  code: string;
  is_primary: boolean;
  created_at: string;
}

/** Every code attached to a product (a product may carry more than one when allowed). */
export function useProductBarcodes(tenantId: string | null | undefined, productId?: string | null) {
  return useQuery({
    queryKey: ["product_barcodes", tenantId, productId ?? "all"],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<ProductBarcode[]> => {
      let q = supabase
        .from("product_barcodes" as any)
        .select("*")
        .eq("tenant_id", tenantId as string)
        .order("created_at", { ascending: false })
        .limit(2000);
      if (productId) q = q.eq("product_id", productId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any as ProductBarcode[];
    },
  });
}

/** Coverage counters for the capture screen: how many products still need a code. */
export function useBarcodeCoverage(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["barcode_coverage", tenantId],
    enabled: Boolean(tenantId),
    refetchInterval: 5000,
    queryFn: async () => {
      const base = () =>
        supabase.from("products").select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId as string).eq("active", true);
      const [totalRes, missingRes] = await Promise.all([base(), base().is("barcode", null)]);
      if (totalRes.error) throw totalRes.error;
      if (missingRes.error) throw missingRes.error;
      const total = totalRes.count ?? 0;
      const missing = missingRes.count ?? 0;
      return { total, missing, done: total - missing };
    },
  });
}

/** Look a code up across product_barcodes (used by the till when the cached list misses). */
export async function findProductIdByBarcode(tenantId: string, code: string): Promise<string | null> {
  const { data } = await supabase
    .from("product_barcodes" as any)
    .select("product_id")
    .eq("tenant_id", tenantId)
    .ilike("code", code)
    .maybeSingle();
  return (data as any)?.product_id ?? null;
}

/**
 * Save a scanned code onto a product.
 *
 * With "allow multiple barcodes" off the code replaces whatever the product had;
 * with it on the code is added alongside. A code already used by a different
 * product is refused rather than moved.
 */
export function useSaveProductBarcode(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ code, productId }: { code: string; productId: string }) => {
      const clean = code.trim();
      if (!clean) throw new Error("Enter a barcode first");

      const { data: clash } = await supabase
        .from("product_barcodes" as any)
        .select("id, product_id, products(name)")
        .eq("tenant_id", tenantId)
        .ilike("code", clean)
        .maybeSingle();
      if (clash && (clash as any).product_id !== productId) {
        throw new Error(`That code is already on “${(clash as any).products?.name ?? "another product"}”.`);
      }
      if (clash) return { id: (clash as any).id as string, already: true };

      const { data: settings } = await supabase
        .from("retail_settings" as any)
        .select("allow_multi_barcode")
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (!(settings as any)?.allow_multi_barcode) {
        await supabase.from("product_barcodes" as any).delete().eq("product_id", productId);
      }

      const { data: user } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("product_barcodes" as any)
        .insert({
          tenant_id: tenantId,
          product_id: productId,
          code: clean,
          is_primary: true,
          created_by: user?.user?.id ?? null,
        } as any)
        .select("id")
        .single();
      if (error) throw error;

      await supabase
        .from("pos_barcode_queue" as any)
        .update({
          resolved_product_id: productId,
          resolved_at: new Date().toISOString(),
          resolved_by: user?.user?.id ?? null,
        } as any)
        .eq("tenant_id", tenantId)
        .eq("code", clean);

      return { id: (data as any).id as string, already: false };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["product_barcodes"] });
      qc.invalidateQueries({ queryKey: ["barcode_coverage"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["pos_barcode_queue"] });
    },
  });
}

/** Undo — remove a code from a product. */
export function useDeleteProductBarcode(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("product_barcodes" as any)
        .delete()
        .eq("id", id)
        .eq("tenant_id", tenantId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["product_barcodes"] });
      qc.invalidateQueries({ queryKey: ["barcode_coverage"] });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
}
