import type { ReactNode } from "react";
import { CheckCircle2, CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

const TONES = {
  neutral: "border-sk-border bg-sk-surface",
  blue: "border-sk-turquoise/40 bg-sk-turquoise-soft/40",
  muted: "border-sk-border bg-sk-surface-muted",
  coral: "border-sk-coral/30 bg-sk-coral-soft/40",
  green: "border-sk-green/40 bg-sk-green-soft/40",
} as const;

/** Numbered, colour-tinted booking section with a clear done/outstanding badge. */
export function StageBand({ id, step, title, tone, done, status, actions, children }: {
  id?: string; step: number; title: string; tone: keyof typeof TONES;
  done?: boolean; status?: string; actions?: ReactNode; children: ReactNode;
}) {
  return <section id={id} className={cn("scroll-mt-24 rounded-2xl border-2 p-4 sm:p-5", TONES[tone])} aria-labelledby={id ? `${id}-title` : undefined}>
    <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-sm font-bold text-background">{step}</span>
        <h2 id={id ? `${id}-title` : undefined} className="text-lg font-semibold">{title}</h2>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {done !== undefined && <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold", done ? "bg-sk-green-soft text-sk-green" : "bg-sk-orange-soft text-sk-orange")}>
          {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <CircleAlert className="h-3.5 w-3.5" />}{status ?? (done ? "Done" : "Outstanding")}
        </span>}
        {actions}
      </div>
    </header>
    <div className="space-y-3">{children}</div>
  </section>;
}
