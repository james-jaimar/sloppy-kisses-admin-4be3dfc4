import { X } from "lucide-react";

/** Full-screen, thumb-friendly sheet. Deliberately simpler than a modal dialog. */
export function WorkSheet({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <button
          onClick={onClose}
          aria-label="Close"
          className="grid h-12 w-12 place-items-center rounded-xl border border-border active:bg-muted"
        >
          <X className="h-6 w-6" />
        </button>
        <h2 className="truncate text-lg font-bold">{title}</h2>
      </header>
      <div className="flex-1 overflow-y-auto p-4">{children}</div>
      {footer && <div className="border-t border-border p-4">{footer}</div>}
    </div>
  );
}

export function BigButton({
  children,
  onClick,
  tone = "primary",
  disabled,
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  tone?: "primary" | "green" | "orange" | "neutral" | "danger";
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  const tones: Record<string, string> = {
    primary: "bg-sk-coral text-white active:bg-sk-coral-dark",
    green: "bg-sk-green text-white active:opacity-90",
    orange: "bg-sk-orange text-white active:opacity-90",
    neutral: "border border-border bg-white text-foreground active:bg-muted",
    danger: "border border-destructive/40 bg-white text-destructive active:bg-destructive/10",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`flex min-h-[60px] w-full items-center justify-center gap-2 rounded-2xl px-5 text-lg font-bold transition disabled:opacity-50 ${tones[tone]}`}
    >
      {children}
    </button>
  );
}