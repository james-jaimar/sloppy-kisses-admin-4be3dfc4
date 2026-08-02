import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Loader2 } from "lucide-react";
import { uploadDocumentToS3, getDocumentDownloadUrl } from "@/features/documents/uploadDocument";
import { useJobPhotos, useLinkJobPhoto, type PhotoKind } from "./queries";

function PhotoThumb({ documentId }: { documentId: string | null }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!documentId) return;
    getDocumentDownloadUrl(documentId)
      .then((r) => { if (!cancelled) setUrl(r.download_url); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [documentId]);
  return (
    <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-border bg-muted">
      {url ? (
        <img src={url} alt="Job photo" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <div className="grid h-full w-full place-items-center text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      )}
    </div>
  );
}

export function JobPhotos({
  tenantId,
  bookingId,
  petId,
  customerId,
}: {
  tenantId: string;
  bookingId: string;
  petId: string | null;
  customerId: string | null;
}) {
  const photosQ = useJobPhotos(bookingId);
  const link = useLinkJobPhoto(tenantId);
  const [busy, setBusy] = useState<PhotoKind | null>(null);
  const beforeRef = useRef<HTMLInputElement>(null);
  const afterRef = useRef<HTMLInputElement>(null);

  async function handleFile(kind: PhotoKind, file: File | undefined) {
    if (!file) return;
    setBusy(kind);
    try {
      const { document_id } = await uploadDocumentToS3({
        tenantId,
        petId,
        customerId,
        type: "booking_photo",
        file,
        uploadedVia: "admin",
      });
      await link.mutateAsync({ bookingId, petId, documentId: document_id, kind });
      toast.success(`${kind === "before" ? "Before" : "After"} photo saved`);
    } catch (err: any) {
      toast.error(err?.message ?? "Photo upload failed");
    } finally {
      setBusy(null);
    }
  }

  const photos = photosQ.data ?? [];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {(["before", "after"] as PhotoKind[]).map((kind) => (
          <button
            key={kind}
            onClick={() => (kind === "before" ? beforeRef : afterRef).current?.click()}
            disabled={busy !== null}
            className="flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-border bg-white text-base font-bold active:bg-muted disabled:opacity-50"
          >
            {busy === kind ? <Loader2 className="h-6 w-6 animate-spin" /> : <Camera className="h-6 w-6" />}
            {kind === "before" ? "Before photo" : "After photo"}
          </button>
        ))}
      </div>
      <input ref={beforeRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => { handleFile("before", e.target.files?.[0]); e.target.value = ""; }} />
      <input ref={afterRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => { handleFile("after", e.target.files?.[0]); e.target.value = ""; }} />

      {photos.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {photos.map((p) => (
            <div key={p.id} className="space-y-1">
              <PhotoThumb documentId={p.document_id} />
              <div className="text-center text-xs font-semibold capitalize text-muted-foreground">{p.kind}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}