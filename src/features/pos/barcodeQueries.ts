import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface BarcodeQueueRow {
  id: string;
  tenant_id: string;
  code: string;
  scan_count: number;
  first_seen_at: string;
  last_seen_at: string;
  last_scanned_by: string | null;
  note: string | null;
  resolved_product_id: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
}

/** Unknown barcodes that still need a product. */
export function useUnknownBarcodes(tenantId: string | null | undefined, opts?: { includeResolved?: boolean }) {
  const includeResolved = opts?.includeResolved ?? false;
  return useQuery({
    queryKey: ["pos_barcode_queue", tenantId, includeResolved],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<BarcodeQueueRow[]> => {
      let q = supabase
        .from("pos_barcode_queue" as any)
        .select("*")
        .eq("tenant_id", tenantId as string)
        .order("last_seen_at", { ascending: false })
        .limit(500);
      if (!includeResolved) q = q.is("resolved_product_id", null);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any as BarcodeQueueRow[];
    },
  });
}

/** Record (or bump) an unrecognised scan. */
export function useRecordUnknownBarcode(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ code, note }: { code: string; note?: string | null }) => {
      const { data: profile } = await supabase.auth.getUser();
      const uid = profile?.user?.id ?? null;
      const { data: existing } = await supabase
        .from("pos_barcode_queue" as any)
        .select("id, scan_count, note")
        .eq("tenant_id", tenantId)
        .eq("code", code)
        .maybeSingle();

      if (existing) {
        const row = existing as any;
        const { error } = await supabase
          .from("pos_barcode_queue" as any)
          .update({
            scan_count: Number(row.scan_count ?? 1) + 1,
            last_seen_at: new Date().toISOString(),
            last_scanned_by: uid,
            note: note ?? row.note ?? null,
          } as any)
          .eq("id", row.id);
        if (error) throw error;
        return;
      }

      const { error } = await supabase.from("pos_barcode_queue" as any).insert({
        tenant_id: tenantId,
        code,
        last_scanned_by: uid,
        note: note ?? null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pos_barcode_queue"] }),
  });
}

/** Save a barcode onto a product and close out any queued rows for it. */
export function useLinkBarcode(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ code, productId }: { code: string; productId: string }) => {
      const { data: clash } = await supabase
        .from("products")
        .select("id, name")
        .eq("tenant_id", tenantId)
        .ilike("barcode", code)
        .maybeSingle();
      if (clash && (clash as any).id !== productId) {
        throw new Error(`That barcode is already on “${(clash as any).name}”.`);
      }

      const { error } = await supabase
        .from("products")
        .update({ barcode: code } as any)
        .eq("id", productId)
        .eq("tenant_id", tenantId);
      if (error) throw error;

      const { data: profile } = await supabase.auth.getUser();
      await supabase
        .from("pos_barcode_queue" as any)
        .update({
          resolved_product_id: productId,
          resolved_at: new Date().toISOString(),
          resolved_by: profile?.user?.id ?? null,
        } as any)
        .eq("tenant_id", tenantId)
        .eq("code", code);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pos_barcode_queue"] });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

export function useDeleteBarcodeQueueRow(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pos_barcode_queue" as any).delete().eq("id", id).eq("tenant_id", tenantId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pos_barcode_queue"] }),
  });
}
