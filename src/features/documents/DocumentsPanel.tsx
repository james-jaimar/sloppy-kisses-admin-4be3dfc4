import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Loader2, Upload, Download, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase/client";
import { uploadDocumentToS3, getDocumentDownloadUrl } from "./uploadDocument";
import { SnapUploadButton } from "@/features/uploads/SnapUploadButton";
import { useConfirm } from "@/components/ui/confirm-dialog";

type Props = {
  tenantId: string;
  petId?: string | null;
  customerId?: string | null;
  uploadedVia?: "portal" | "admin";
  allowUpload?: boolean;
  title?: string;
  /** Restrict the upload type dropdown. Defaults to all types. */
  docTypes?: { value: string; label: string }[];
  /** Render without the card chrome (e.g. inside a CollapsibleCard). */
  bare?: boolean;
};

const DEFAULT_DOC_TYPES = [
  { value: "vaccination", label: "Vaccination cert" },
  { value: "medical", label: "Medical / vet" },
  { value: "consent", label: "Consent form" },
  { value: "other", label: "Other" },
];

// Shared documents list + upload widget, used in customer portal and admin panels.
// Files live on S3; RLS on `documents` controls who sees what.
export function DocumentsPanel({
  tenantId, petId = null, customerId = null,
  uploadedVia = "admin", allowUpload = true, title = "Documents",
  docTypes = DEFAULT_DOC_TYPES, bare = false,
}: Props) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [docType, setDocType] = useState(docTypes[0]?.value ?? "other");

  const key = ["documents_panel", tenantId, petId, customerId];
  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      let query = supabase
        .from("documents")
        .select("id, type, file_name, status, created_at, size_bytes, expires_at, archived_at, uploaded_via, pet_id, customer_id")
        .eq("tenant_id", tenantId)
        .is("archived_at", null)
        .order("created_at", { ascending: false });
      if (petId) query = query.eq("pet_id", petId);
      else if (customerId) query = query.eq("customer_id", customerId).is("pet_id", null);
      const { data, error } = await query.limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  async function handlePick() { fileRef.current?.click(); }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploading(true);
    try {
      await uploadDocumentToS3({ tenantId, petId, customerId, type: docType, file, uploadedVia });
      toast.success("Uploaded");
      qc.invalidateQueries({ queryKey: key });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload(id: string) {
    try {
      const { download_url } = await getDocumentDownloadUrl(id);
      window.open(download_url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function handleDelete(id: string) {
    const ok = await confirm({ title: "Delete document?", description: "This removes the file for you and staff.", confirmLabel: "Delete", tone: "destructive" });
    if (!ok) return;
    const { error } = await supabase.from("documents").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: key });
  }

  return (
    <div className={bare ? "p-5" : "sk-card p-5"}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {bare ? <div /> : <div className="text-sm font-semibold">{title}</div>}
        {allowUpload && (
          <div className="flex items-center gap-2">
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
            >
              {docTypes.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <input ref={fileRef} type="file" className="hidden" onChange={handleFile} />
            <button
              type="button"
              onClick={handlePick}
              disabled={uploading}
              className="inline-flex items-center gap-2 rounded-lg bg-sk-coral px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:brightness-105 disabled:opacity-60"
            >
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {uploading ? "Uploading…" : "Upload"}
            </button>
          </div>
        )}
      </div>

      {q.isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
      ) : !q.data?.length ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
          No documents yet.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {q.data.map((d: any) => (
            <li key={d.id} className="flex items-center gap-3 py-2.5">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{d.file_name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {d.type ?? "document"}
                  {d.size_bytes ? ` · ${(d.size_bytes / 1024 / 1024).toFixed(2)} MB` : ""}
                  {" · "}{format(new Date(d.created_at), "dd MMM yyyy")}
                  {d.expires_at ? ` · expires ${format(new Date(d.expires_at), "dd MMM yyyy")}` : ""}
                </div>
              </div>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                {d.status}
              </span>
              <button onClick={() => handleDownload(d.id)} title="Download" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                <Download className="h-4 w-4" />
              </button>
              <button onClick={() => handleDelete(d.id)} title="Delete" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-sk-coral-dark">
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}