import { supabase } from "@/integrations/supabase/client";
import type { QueryClient } from "@tanstack/react-query";

/** DELETE uses the caller's session and the existing document RLS policies. */
export async function deleteDocument(documentId: string, tenantId: string, qc: QueryClient) {
  const { data, error } = await supabase.from("documents").delete()
    .eq("id", documentId).eq("tenant_id", tenantId).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("This document cannot be deleted with your access.");
  for (const key of ["documents_panel", "pet_vax_docs", "pet_vaccinations", "booking_vax_gate", "pet_vax_status", "pets_vax_status", "pet_vax_cards", "pet_attachment_status", "vax_outstanding"]) {
    await qc.invalidateQueries({ queryKey: [key] });
  }
}