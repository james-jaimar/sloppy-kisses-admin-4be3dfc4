import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { CheckCircle2, Loader2, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  useCreateStudioSession,
  useSnapSessionProgress,
  useCloseSnapSession,
  readFnError,
} from "./snapQueries";

/**
 * "Use my phone" for shop product photos. One QR hands the whole catalogue to a
 * phone camera; photos land on the products and the till picks them up.
 */
export function StudioSnapDialog({
  tenantId,
  productId,
  label,
  buttonLabel = "Use my phone",
  className,
  onProgress,
  onFinished,
}: {
  tenantId: string;
  /** Set for a one-off shot of a single product; omit for the whole catalogue. */
  productId?: string | null;
  label?: string | null;
  buttonLabel?: string;
  className?: string;
  onProgress?: () => void;
  onFinished?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<{ id: string; token: string; expires_at: string } | null>(null);
  const create = useCreateStudioSession();
  const closeSession = useCloseSnapSession();
  const progress = useSnapSessionProgress(open ? (session?.id ?? null) : null);
  const received = Number(progress.data?.files_uploaded ?? 0);

  // Refresh the grid behind the dialog as photos land.
  useEffect(() => {
    if (received > 0) onProgress?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [received]);

  async function start() {
    setOpen(true);
    if (session) return;
    try {
      setSession(await create.mutateAsync({ tenantId, productId, label }));
    } catch (e: any) {
      toast.error(await readFnError(e));
      setOpen(false);
    }
  }

  async function finish() {
    if (session) await closeSession.mutateAsync(session.token).catch(() => undefined);
    setSession(null);
    setOpen(false);
    onProgress?.();
    onFinished?.();
    if (received > 0) toast.success(`${received} photo${received === 1 ? "" : "s"} saved from your phone`);
  }

  const url = session
    ? `${window.location.origin}${productId ? `/snap/studio/${session.token}` : `/snap/studio/${session.token}`}`
    : "";

  return (
    <>
      <button
        type="button"
        onClick={start}
        className={className ?? "inline-flex h-11 items-center gap-2 rounded-lg border border-border bg-white px-4 text-sm font-semibold hover:border-sk-coral"}
      >
        <Smartphone className="h-4 w-4" /> {buttonLabel}
      </button>

      <Dialog open={open} onOpenChange={(o) => { if (!o) finish(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Take photos with your phone</DialogTitle>
            <DialogDescription>
              Scan this code with the phone camera, then work through the products — photos appear here as they land.
            </DialogDescription>
          </DialogHeader>

          {!session ? (
            <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Preparing the link…
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid place-items-center rounded-2xl border border-border bg-white p-5">
                <QRCodeSVG value={url} size={190} />
              </div>
              <div className="break-all text-center text-xs text-muted-foreground">{url}</div>
              <div className="flex items-center justify-center gap-2 rounded-xl bg-sk-surface-muted p-3 text-sm font-semibold">
                {received > 0 ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Loader2 className="h-4 w-4 animate-spin" />}
                {received} photo{received === 1 ? "" : "s"} received
              </div>
              <button
                type="button"
                onClick={finish}
                className="h-11 w-full rounded-xl bg-sk-coral text-sm font-bold text-white hover:bg-sk-coral-dark"
              >
                Finish
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
