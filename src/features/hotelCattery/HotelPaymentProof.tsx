import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { uploadDocumentToS3, getDocumentDownloadUrl } from "@/features/documents/uploadDocument";
import { SnapUploadButton } from "@/features/uploads/SnapUploadButton";

export function HotelPaymentProof({ tenantId, customerId, bookingId, portal }: { tenantId: string; customerId: string; bookingId: string; portal: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const queryKey = ["hotel_payment_proof", bookingId];
  const docs = useQuery({ queryKey, queryFn: async () => {
    const { data, error } = await supabase.from("documents").select("id, file_name, status").eq("booking_id", bookingId).eq("type", "payment_proof").is("deleted_at", null).order("created_at", { ascending: false });
    if (error) throw error; return data ?? [];
  }});
  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try { await uploadDocumentToS3({ tenantId, customerId, bookingId, type: "payment_proof", file, uploadedVia: portal ? "portal" : "admin" }); await qc.invalidateQueries({ queryKey }); toast.success("Payment proof uploaded for staff review"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Upload failed"); } finally { setBusy(false); }
  }
  return <section className="space-y-3 border-t border-border pt-4"><h3 className="font-semibold">Payment proof</h3><p className="text-xs text-muted-foreground">Staff must confirm money received before issuing your invoice.</p><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => input.current?.click()}><Upload className="mr-2 h-4 w-4" />Upload proof</Button><SnapUploadButton target={{ tenantId, customerId, bookingId, docType: "payment_proof", label: "Hotel payment proof" }} onUploaded={() => qc.invalidateQueries({ queryKey })} /></div><input ref={input} type="file" accept="image/*,application/pdf" className="hidden" onChange={e => { upload(e.target.files?.[0]); e.target.value = ""; }} />{docs.error && <p className="text-sm text-destructive">Could not load payment proofs.</p>}{docs.data?.map(d => <Button key={d.id} variant="ghost" className="h-auto max-w-full whitespace-normal text-left" onClick={async () => { try { const result = await getDocumentDownloadUrl(d.id); window.open(result.download_url, "_blank", "noopener,noreferrer"); } catch { toast.error("Could not open proof"); } }}><FileText className="mr-2 h-4 w-4 shrink-0" />{d.file_name} · {d.status}</Button>)}</section>;
}