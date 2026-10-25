import { ReactNode, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Camera, Check, FileText, Loader2, Upload } from "lucide-react";
import { uploadDocumentToS3 } from "@/features/documents/uploadDocument";
import { SnapUploadButton } from "./SnapUploadButton";
import { usePetAttachmentStatus, useDocumentPreviewUrl, type PetDocKind } from "./snapQueries";
import { useQueryClient } from "@tanstack/react-query";

const KIND_META: Record<PetDocKind, { label: string; hint: string; icon: typeof Camera }> = {
  pet_photo: { label: "Photo of your pet", hint: "Helps us match pets to owners at check-in", icon: Camera },
  vaccination: { label: "Vaccination card", hint: "A clear photo or PDF of the card", icon: FileText },
};

function Tile({
  kind, petId, petName, tenantId, onDone, uploadedVia, action,
}: {
  kind: PetDocKind;
  petId: string;
  petName: string;
  tenantId: string;
  onDone: () => void;
  uploadedVia: "portal" | "admin";
  action?: ReactNode;
}) {
  const meta = KIND_META[kind];
  const Icon = meta.icon;
  const [busy, setBusy] = useState(false);
  const [justDone, setJustDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const status = usePetAttachmentStatus([petId]);
  const doc = status.data?.[petId]?.[kind] ?? null;
  const onFileState = Boolean(doc) || justDone;
  const isImage = (doc?.content_type ?? "").startsWith("image/");
  const preview = useDocumentPreviewUrl(isImage ? doc?.id : null);

  async function handle(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      await uploadDocumentToS3({ tenantId, petId, type: kind, file, uploadedVia });
      setJustDone(true);
      onDone();
      toast.success(`${meta.label} saved for ${petName}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={
        "space-y-2 rounded-lg border p-3 " +
        (onFileState ? "border-sk-green bg-sk-green-soft/40" : "border-dashed border-border bg-background")
      }
    >
      <div className="flex items-center gap-2 text-sm font-semibold">
        {onFileState ? <Check className="h-4 w-4 text-sk-green" /> : <Icon className="h-4 w-4 text-muted-foreground" />}
        {meta.label}
      </div>
      <div className="flex items-center gap-2">
        {preview.data && (
          <img
            src={preview.data}
            alt={`${meta.label} for ${petName}`}
            className="h-12 w-12 shrink-0 rounded-lg border border-border object-cover"
            loading="lazy"
          />
        )}
        <p className="min-w-0 truncate text-xs text-muted-foreground">
          {onFileState ? (doc?.file_name ?? "On file") : meta.hint}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm"
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          {onFileState ? kind === "vaccination" ? "Add another card" : "Update photo" : "Upload"}
        </Button>
        <SnapUploadButton
          target={{
            tenantId,
            petId,
            docType: kind,
            label: `${meta.label} for ${petName}`,
          }}
          onUploaded={onDone}
        />
      </div>
      {action}
      {kind === "vaccination" && <VaccinationCards tenantId={tenantId} petId={petId} />}
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => { handle(e.target.files?.[0]); e.target.value = ""; }}
      />
    </div>
  );
}

/** Photo + vaccination card for one pet — real uploads, not a tick box. */
export function PetAttachments({
  tenantId, petId, petName, uploadedVia = "portal", photoAction, vaccinationAction,
}: {
  tenantId: string;
  petId: string;
  petName: string;
  uploadedVia?: "portal" | "admin";
  photoAction?: ReactNode;
  vaccinationAction?: ReactNode;
}) {
  const qc = useQueryClient();
  const refresh = () => { for (const key of ["pet_attachment_status", "pet_vax_cards", "pet_vax_docs", "pet_photo_status", "booking_photo_gate", "booking_vax_gate", "pet_vax_status"]) void qc.invalidateQueries({ queryKey: [key] }); };
  return (
    <div className="grid gap-3 md:col-span-2 md:grid-cols-2">
      <Tile kind="pet_photo" petId={petId} petName={petName} tenantId={tenantId} onDone={refresh} uploadedVia={uploadedVia} action={photoAction} />
      <Tile kind="vaccination" petId={petId} petName={petName} tenantId={tenantId} onDone={refresh} uploadedVia={uploadedVia} action={vaccinationAction} />
    </div>
  );
}

function VaccinationCards({ tenantId, petId }: { tenantId: string; petId: string }) {
  const cards = useQuery({ queryKey: ["pet_vax_cards", tenantId, petId], queryFn: async () => {
    const { data, error } = await supabase.from("documents").select("id, file_name, created_at").eq("tenant_id", tenantId).eq("pet_id", petId).eq("type", "vaccination").is("deleted_at", null).is("archived_at", null).in("status", ["uploaded", "verified"]).order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  } });
  if (cards.error) return <p className="text-xs text-destructive">Could not load vaccination cards.</p>;
  if (!cards.data?.length) return null;
  return <details className="border-t border-border pt-2"><summary className="cursor-pointer text-xs font-medium">Cards on file ({cards.data.length})</summary><ul className="mt-2 space-y-1">{cards.data.map(card => <li key={card.id}><CardDownload id={card.id} name={card.file_name} /></li>)}</ul></details>;
}

function CardDownload({ id, name }: { id: string; name: string | null }) {
  const preview = useDocumentPreviewUrl(id);
  return preview.data ? <a className="block break-words text-xs text-primary underline" href={preview.data} target="_blank" rel="noopener noreferrer">{name || "Vaccination card"}</a> : <span className="block break-words text-xs text-muted-foreground">{name || "Vaccination card"}</span>;
}
