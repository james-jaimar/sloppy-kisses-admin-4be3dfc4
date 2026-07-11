import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// Module-level stack so nested modals close top-most first on Escape.
const modalStack: Array<() => void> = [];

interface Props {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  onClose?: () => void;
  headerRight?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  wide?: boolean;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
}

export function ModalShell({
  title, subtitle, onClose, headerRight, footer, children, className, wide,
  closeOnBackdrop = false, closeOnEscape = true,
}: Props) {
  useEffect(() => {
    if (!onClose) return;
    const handler = () => onClose();
    if (closeOnEscape) modalStack.push(handler);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !closeOnEscape) return;
      const top = modalStack[modalStack.length - 1];
      if (top === handler) {
        e.stopPropagation();
        top();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      const idx = modalStack.lastIndexOf(handler);
      if (idx >= 0) modalStack.splice(idx, 1);
    };
  }, [onClose, closeOnEscape]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (closeOnBackdrop && onClose && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={cn(
          "relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl",
          wide ? "max-w-5xl" : "max-w-2xl",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold">{title}</h2>
            {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-2">
            {headerRight}
            <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="border-t border-border bg-sk-surface-muted px-6 py-3">{footer}</div>}
      </div>
    </div>
  );
}