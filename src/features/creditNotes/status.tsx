import type { CreditNoteStatus } from "./queries";

export function CreditNoteStatusChip({ status }: { status: CreditNoteStatus }) {
  const map: Record<CreditNoteStatus, { label: string; cls: string }> = {
    draft:     { label: "Draft",     cls: "bg-muted text-foreground/70" },
    issued:    { label: "Issued",    cls: "bg-sk-coral/15 text-sk-coral-dark" },
    applied:   { label: "Applied",   cls: "bg-sk-green/15 text-sk-green" },
    cancelled: { label: "Cancelled", cls: "bg-destructive/15 text-destructive" },
  };
  const m = map[status] ?? map.draft;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${m.cls}`}>
      {m.label}
    </span>
  );
}

export const fmtZar = (n: number | string | null | undefined) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", minimumFractionDigits: 2 })
    .format(Number(n ?? 0));