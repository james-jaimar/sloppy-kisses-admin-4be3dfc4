import type { ReactNode } from "react";

/** One printable A4 sheet. Screen shows a paper-like card; print gets a page break. */
export function Sheet({
  title,
  subtitle,
  meta,
  children,
}: {
  title: string;
  subtitle?: string;
  meta?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="sk-sheet mb-6 rounded-2xl border border-border bg-white p-6 shadow-sm print:mb-0 print:rounded-none print:border-0 print:p-0 print:shadow-none">
      <header className="mb-4 flex items-end justify-between gap-4 border-b-2 border-black/80 pb-2">
        <div>
          <h2 className="text-2xl font-black uppercase tracking-tight print:text-[20pt]">{title}</h2>
          {subtitle && <p className="text-base font-semibold print:text-[12pt]">{subtitle}</p>}
        </div>
        {meta && <div className="text-right text-sm font-medium print:text-[10pt]">{meta}</div>}
      </header>
      {children}
    </section>
  );
}

/** Empty tick box big enough to mark with a pen. */
export function Tick({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 align-middle">
      <span className="inline-block h-5 w-5 shrink-0 border-2 border-black/70 print:h-[14pt] print:w-[14pt]" />
      {label && <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>}
    </span>
  );
}

/** Ruled writing area for hand-written notes. */
export function WriteLine({ className = "" }: { className?: string }) {
  return <span className={`inline-block border-b border-dotted border-black/50 align-bottom ${className}`} />;
}

export function AlertChips({ alerts }: { alerts: string[] }) {
  if (!alerts.length) return null;
  return (
    <span className="ml-1 inline-flex flex-wrap gap-1">
      {alerts.map((a) => (
        <span
          key={a}
          className="rounded border border-black px-1 text-[10px] font-black uppercase tracking-wide print:text-[7pt]"
        >
          {a}
        </span>
      ))}
    </span>
  );
}

export const TH = "border border-black/70 px-2 py-1 text-left text-[11px] font-black uppercase tracking-wide print:text-[8pt]";
export const TD = "border border-black/40 px-2 py-1.5 align-top text-sm print:text-[9pt]";
export const TABLE = "w-full table-fixed border-collapse";

export function EmptyState({ what }: { what: string }) {
  return (
    <p className="py-8 text-center text-sm italic text-muted-foreground print:text-black">
      Nothing scheduled for {what} on this day.
    </p>
  );
}
