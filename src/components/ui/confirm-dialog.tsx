import * as React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ConfirmTone = "default" | "primary" | "destructive";

export type ConfirmOptions = {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
};

type Pending = ConfirmOptions & { resolve: (v: boolean) => void };

const ConfirmContext = React.createContext<((opts: ConfirmOptions) => Promise<boolean>) | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = React.useState<Pending | null>(null);

  const confirm = React.useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...opts, resolve });
    });
  }, []);

  const handle = (v: boolean) => {
    pending?.resolve(v);
    setPending(null);
  };

  const tone: ConfirmTone = pending?.tone ?? "primary";
  const actionClass =
    tone === "destructive"
      ? cn(buttonVariants({ variant: "destructive" }))
      : tone === "default"
        ? cn(buttonVariants({ variant: "default" }))
        : "inline-flex h-10 items-center justify-center rounded-lg bg-sk-coral px-4 text-sm font-semibold text-white hover:bg-sk-coral-dark focus:outline-none focus:ring-2 focus:ring-sk-coral/40";

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog open={!!pending} onOpenChange={(o) => { if (!o) handle(false); }}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{pending?.title}</AlertDialogTitle>
            {pending?.description ? (
              <AlertDialogDescription>{pending.description}</AlertDialogDescription>
            ) : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => handle(false)}>
              {pending?.cancelLabel ?? "Cancel"}
            </AlertDialogCancel>
            <AlertDialogAction className={actionClass} onClick={() => handle(true)}>
              {pending?.confirmLabel ?? "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = React.useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return ctx;
}