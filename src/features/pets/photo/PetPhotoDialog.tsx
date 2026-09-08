import { useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { Camera, ImagePlus, Loader2, Smartphone, CheckCircle2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { uploadDocumentToS3 } from "@/features/documents/uploadDocument";
import { useCreateSnapSession, useSnapSessionDocuments, useCloseSnapSession, readFnError } from "@/features/uploads/snapQueries";
import { toSquareJpeg } from "./squareImage";
import { invalidatePetPhotos } from "./petPhotoQueries";

export function PetPhotoDialog({
  open, onOpenChange, tenantId, petId, petName, onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tenantId: string;
  petId: string;
  petName: string;
  onDone?: () => void;
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState<{ id: string; token: string } | null>(null);
  const [received, setReceived] = useState(false);
  const camRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const create = useCreateSnapSession();
  const closeSession = useCloseSnapSession();
  const docs = useSnapSessionDocuments(open && qr && !received ? qr.id : null);

  const arrived = docs.data ?? [];
  if (qr && !received && arrived.length > 0) {
    setReceived(true);
    closeSession.mutate(qr.token);
    invalidatePetPhotos(qc);
    onDone?.();
    toast.success(`New photo saved for ${petName}`);
    setTimeout(() => close(), 1200);
  }

  function close() {
    onOpenChange(false);
    setQr(null);
    setReceived(false);
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const squared = await toSquareJpeg(file);
      await uploadDocumentToS3({ tenantId, petId, type: "pet_photo", file: squared, uploadedVia: "admin" });
      invalidatePetPhotos(qc);
      onDone?.();
      toast.success(`New photo saved for ${petName}`);
      close();
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't save the photo");
    } finally {
      setBusy(false);
    }
  }

  async function startQr() {
    try {
      const s = await create.mutateAsync({ tenantId, petId, docType: "pet_photo", label: `Photo of ${petName}` });
      setQr({ id: s.id, token: s.token });
    } catch (e: any) {
      toast.error(await readFnError(e));
    }
  }

  const url = qr ? `${window.location.origin}/snap/${qr.token}` : "";

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{received ? "Photo received" : `Photo of ${petName}`}</DialogTitle>
          <DialogDescription>
            {received
              ? "Saved as the pet's main picture."
              : "Take a new picture, use your phone, or pick one from this device."}
          </DialogDescription>
        </DialogHeader>

        {received ? (
          <div className="grid place-items-center gap-2 py-8 text-center">
            <CheckCircle2 className="h-10 w-10 text-sk-green" />
          </div>
        ) : qr ? (
          <div className="space-y-3 text-center">
            <div className="grid place-items-center rounded-xl border border-border bg-white p-4">
              <QRCodeSVG value={url} size={180} />
            </div>
            <p className="text-sm text-muted-foreground">
              Scan with your phone camera, snap {petName}, and the picture appears here automatically.
            </p>
            <button type="button" onClick={() => setQr(null)} className="text-xs font-semibold underline">
              Back
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <ActionRow icon={Camera} label="Take a photo now" hint="Opens the camera on phones and tablets"
              onClick={() => camRef.current?.click()} busy={busy} />
            <ActionRow icon={Smartphone} label="Use my phone" hint="Shows a QR code to scan"
              onClick={startQr} busy={create.isPending} />
            <ActionRow icon={ImagePlus} label="Choose a picture" hint="Upload a file from this device"
              onClick={() => fileRef.current?.click()} busy={busy} />
          </div>
        )}

        <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ""; }} />
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ""; }} />
      </DialogContent>
    </Dialog>
  );
}

function ActionRow({
  icon: Icon, label, hint, onClick, busy,
}: {
  icon: typeof Camera; label: string; hint: string; onClick: () => void; busy?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left hover:bg-muted disabled:opacity-50"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-sk-turquoise-soft text-sk-turquoise-dark">
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Icon className="h-5 w-5" />}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </button>
  );
}
