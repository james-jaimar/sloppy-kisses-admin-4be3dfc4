import { cn } from "@/lib/utils";

type Tone = "coral" | "turquoise" | "green" | "orange" | "muted" | "red";

const TONE_CLASSES: Record<Tone, string> = {
  coral:     "bg-sk-coral-soft text-sk-coral-dark",
  turquoise: "bg-sk-turquoise-soft text-sk-turquoise-dark",
  green:     "bg-sk-green-soft text-sk-green",
  orange:    "bg-sk-orange-soft text-sk-orange",
  red:       "bg-sk-red-soft text-sk-coral-dark",
  muted:     "bg-muted text-muted-foreground",
};

const STATUS_MAP: Record<string, { tone: Tone; label: string }> = {
  draft:            { tone: "muted",     label: "Draft" },
  requested:        { tone: "orange",    label: "Requested" },
  pending_review:   { tone: "orange",    label: "Pending review" },
  needs_info:       { tone: "orange",    label: "Needs info" },
  approved:         { tone: "turquoise", label: "Approved" },
  declined:         { tone: "red",       label: "Declined" },
  converted:        { tone: "green",     label: "Converted" },
  confirmed:        { tone: "turquoise", label: "Confirmed" },
  pending_payment:  { tone: "orange",    label: "Awaiting payment" },
  checked_in:       { tone: "green",     label: "Checked in" },
  in_progress:      { tone: "coral",     label: "In progress" },
  ready:            { tone: "turquoise", label: "Ready" },
  checked_out:      { tone: "muted",     label: "Checked out" },
  completed:        { tone: "muted",     label: "Completed" },
  cancelled:        { tone: "muted",     label: "Cancelled" },
  no_show:          { tone: "red",       label: "No show" },
  not_arrived:      { tone: "orange",    label: "Not arrived" },
  walk_in:          { tone: "coral",     label: "Walk-in" },
  up_to_date:       { tone: "green",     label: "Up to date" },
  expiring:         { tone: "orange",    label: "Expiring" },
  missing:          { tone: "red",       label: "Missing" },
};

interface Props {
  status: string;
  className?: string;
  tone?: Tone;
  label?: string;
}

export function StatusBadge({ status, className, tone, label }: Props) {
  const meta = STATUS_MAP[status] ?? { tone: tone ?? "muted", label: label ?? status };
  const finalTone = tone ?? meta.tone;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        TONE_CLASSES[finalTone],
        className,
      )}
    >
      {label ?? meta.label}
    </span>
  );
}