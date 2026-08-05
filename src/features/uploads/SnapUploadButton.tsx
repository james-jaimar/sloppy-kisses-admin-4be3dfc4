import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Smartphone, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCreateSnapSession, useSnapSessionDocuments, readFnError, type SnapTarget } from "./snapQueries";

/**
 * "Use my phone" — opens a QR code that hands this upload slot to the user's
 * phone. Files land straight on the record; the desktop shows them as they arrive.
 */
export function SnapUploadButton({
  target,
  onUploaded,
  className,
  label = "Use my phone",
}: {
  target: SnapTarget;
  onUploaded?: () => void;
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<{ id: string; token: string; expires_at: string } | null>(null);
  const create = useCreateSnapSession();
  const docs = useSnapSessionDocuments(open ? (session?.id ?? null) : null);

  async function start() {
    setOpen(true);
    if (session) return;
    try {
      const s = await create.mutateAsync(target);
      setSession(s);
    } catch (e: any) {
      toast.error(await readFnError(e));
      setOpen(false);
    }
  }

  const url = session ? `${window.location.origin}/snap/${session.token}` : "";
  const arrived = docs.data ?? [];

  return (
    <>
      <button
        type="button"
        onClick={start}
        className={
          className ??
          "inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
        }
      >
        <Smartphone className="h-3.5 w-3.5" />
        {label}
      </button>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v && arrived.length && onUploaded) onUploaded();
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Upload from your phone</DialogTitle>
          </DialogHeader>
          {!session ? (
            <div className="grid h-48 place-items-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Scan this with your phone camera, then take a photo or pick a file. It appears here automatically.
              </p>
              <div className="grid place-items-center rounded-2xl border border-border bg-white p-4">
                <QRCodeSVG value={url} size={180} />
              </div>
              <p className="break-all text-center text-xs text-muted-foreground">{url}</p>
              <div className="rounded-xl bg-muted p-3 text-sm">
                {arrived.length === 0 ? (
                  <span className="text-muted-foreground">Waiting for your phone…</span>
                ) : (
                  <ul className="space-y-1">
                    {arrived.map((d: any) => (
                      <li key={d.id} className="flex items-center gap-2">
                        {d.status === "uploaded" ? (
                          <Check className="h-4 w-4 text-sk-green" />
                        ) : (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        )}
                        <span className="truncate">{d.file_name}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
