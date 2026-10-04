import { useState } from "react";
import { Delete, X } from "lucide-react";

/** Big 4-digit PIN pad for the parlour tablet. Calls onSubmit once 4 digits are entered. */
export function PinPad({
  title,
  subtitle,
  busy,
  error,
  onSubmit,
  onCancel,
}: {
  title: string;
  subtitle?: string;
  busy?: boolean;
  error?: string | null;
  onSubmit: (pin: string) => void;
  onCancel: () => void;
}) {
  const [pin, setPin] = useState("");

  function press(d: string) {
    if (busy || pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    if (next.length === 4) {
      onSubmit(next);
      setTimeout(() => setPin(""), 300);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-foreground/60 p-4">
      <div className="w-full max-w-sm rounded-3xl bg-background p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">{title}</h2>
            {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          <button onClick={onCancel} aria-label="Cancel" className="grid h-11 w-11 place-items-center rounded-xl border border-border">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mb-2 flex justify-center gap-3">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={"h-5 w-5 rounded-full border-2 border-primary " + (pin.length > i ? "bg-primary" : "")} />
          ))}
        </div>
        <p className="mb-4 h-5 text-center text-sm font-medium text-destructive">{busy ? "Checking…" : error ?? ""}</p>
        <div className="grid grid-cols-3 gap-3">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button key={d} onClick={() => press(d)} className="h-16 rounded-2xl border border-border text-2xl font-bold active:bg-muted">
              {d}
            </button>
          ))}
          <span />
          <button onClick={() => press("0")} className="h-16 rounded-2xl border border-border text-2xl font-bold active:bg-muted">0</button>
          <button onClick={() => setPin((p) => p.slice(0, -1))} aria-label="Delete" className="grid h-16 place-items-center rounded-2xl border border-border active:bg-muted">
            <Delete className="h-6 w-6" />
          </button>
        </div>
      </div>
    </div>
  );
}
