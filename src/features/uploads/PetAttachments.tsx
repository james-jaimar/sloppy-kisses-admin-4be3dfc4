import { useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Check, FileText, Loader2, Upload } from "lucide-react";
import { uploadDocumentToS3 } from "@/features/documents/uploadDocument";
import { SnapUploadButton } from "./SnapUploadButton";
import { usePetAttachmentStatus, type PetDocKind } from "./snapQueries";
import { useQueryClient } from "@tanstack/react-query";

const KIND_META: Record<PetDocKind, { label: string; hint: string; icon: typeof Camera }> = {
  pet_photo: { label: "Photo of your pet", hint: "Helps us match pets to owners at check-in", icon: Camera },
  vaccination: { label: "Vaccination card", hint: "A clear photo or PDF of the card", icon: FileText },
};

function Tile({
  kind, petId, petName, tenantId, onFile, onDone, onFile: _x, uploadedVia,
}: {
  kind: PetDocKind;
  petId: string;
  petName: string;
  tenantId: string;
  onFile?: never;
  onDone: () => void;
  uploadedVia: "portal" | "admin";
}) {
  const meta = KIND_META[kind];
  const Icon = meta.icon;
  const [busy, setBusy] = useState(false);
  const [justDone, setJustDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const status = usePetAttachmentStatus([petId]);
  const onFileState = Boolean(status.data?.[petId]?.[kind]) || justDone;

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
        "space-y-2 rounded-xl border p-3 " +
        (onFileState ? "border-sk-green bg-sk-green-soft/40" : "border-dashed border-border bg-white")
      }
    >
      <div className="flex items-center gap-2 text-sm font-semibold">
        {onFileState ? <Check className="h-4 w-4 text-sk-green" /> : <Icon className="h-4 w-4 text-muted-foreground" />}
        {meta.label}
      </div>
      <p className="text-xs text-muted-foreground">{onFileState ? "On file" : meta.hint}</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          {onFileState ? "Replace" : "Upload"}
        </button>
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
  tenantId, petId, petName, uploadedVia = "portal",
}: {
  tenantId: string;
  petId: string;
  petName: string;
  uploadedVia?: "portal" | "admin";
}) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["pet_attachment_status"] });
  return (
    <div className="grid gap-3 md:col-span-2 md:grid-cols-2">
      <Tile kind="pet_photo" petId={petId} petName={petName} tenantId={tenantId} onDone={refresh} uploadedVia={uploadedVia} />
      <Tile kind="vaccination" petId={petId} petName={petName} tenantId={tenantId} onDone={refresh} uploadedVia={uploadedVia} />
    </div>
  );
}
