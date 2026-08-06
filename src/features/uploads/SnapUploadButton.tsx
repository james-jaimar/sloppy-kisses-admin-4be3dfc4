import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Smartphone, Check, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  useCreateSnapSession,
  useSnapSessionDocuments,
  useCloseSnapSession,
  readFnError,
  type SnapTarget,
} from "./snapQueries";

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
  onUploaded?: (docs: { id: string; file_name: string }[]) => void;
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<{ id: string; token: string; expires_at: string } | null>(null);
  const [done, setDone] = useState(false);
  const create = useCreateSnapSession();
  const closeSession = useCloseSnapSession();
  const docs = useSnapSessionDocuments(open && !done ? (session?.id ?? null) : null);
  const acceptedRef = useRef(false);

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

  // Auto-accept: once every file has landed, refresh the record, close the
  // session so the QR can't be reused, and dismiss the dialog by itself.
  useEffect(() => {
    if (!open || acceptedRef.current || arrived.length === 0) return;
    const settled = arrived.every((d: any) => d.status === "uploaded" || d.status === "verified");
    if (!settled) return;
    acceptedRef.current = true;
    setDone(true);
    onUploaded?.(arrived as any);
    if (session) closeSession.mutate(session.token);
    const t = setTimeout(() => reset(false), 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, arrived]);

  function reset(fireCallback: boolean) {
    setOpen(false);
    if (fireCallback && !acceptedRef.current && arrived.length) onUploaded?.(arrived as any);
    setSession(null);
    setDone(false);
    acceptedRef.current = false;
  }

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
          if (v) setOpen(true);
          else reset(true);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{done ? "Photo received" : "Upload from your phone"}</DialogTitle>
            <DialogDescription>
              {done
                ? "Saved to this record — you can replace it any time."
                : "Scan the QR code with your phone to add a photo or file to this record."}
            </DialogDescription>
          </DialogHeader>
          {done ? (
            <div className="grid place-items-center gap-2 py-8 text-center">
              <CheckCircle2 className="h-10 w-10 text-sk-green" />
              <p className="text-sm text-muted-foreground">
                {arrived.map((d: any) => d.file_name).join(", ")}
              </p>
            </div>
          ) : !session ? (
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
                    {arrived.map((d: any) => {
                      const stalled =
                        d.status === "pending" &&
                        Date.now() - new Date(d.created_at).getTime() > 60_000;
                      return (
                        <li key={d.id} className="flex items-center gap-2">
                          {d.status === "pending" ? (
                            stalled ? (
                              <AlertTriangle className="h-4 w-4 shrink-0 text-sk-orange" />
                            ) : (
                              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                            )
                          ) : (
                            <Check className="h-4 w-4 shrink-0 text-sk-green" />
                          )}
                          <span className="truncate">{d.file_name}</span>
                          {stalled && (
                            <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                              didn't finish — retry on the phone
                            </span>
                          )}
                        </li>
                      );
                    })}
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
