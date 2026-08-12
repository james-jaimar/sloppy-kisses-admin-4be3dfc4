import { AlertTriangle, Check, PawPrint } from "lucide-react";
import type { PrefsState } from "./prefsQueries";

const META: Record<PrefsState, { label: string; short: string; cls: string; Icon: typeof Check }> = {
  missing: {
    label: "Prefs missing",
    short: "No prefs",
    cls: "bg-sk-orange-soft text-sk-orange border-sk-orange/40",
    Icon: AlertTriangle,
  },
  from_pet: {
    label: "Prefs from profile",
    short: "Profile prefs",
    cls: "bg-muted text-muted-foreground border-border",
    Icon: PawPrint,
  },
  set: {
    label: "Prefs set",
    short: "Prefs set",
    cls: "bg-sk-green-soft text-sk-green border-sk-green/40",
    Icon: Check,
  },
};

export function GroomingPrefsChip({
  state,
  onClick,
  compact,
  title,
}: {
  state: PrefsState;
  onClick?: () => void;
  compact?: boolean;
  title?: string;
}) {
  const m = META[state];
  const content = (
    <>
      <m.Icon className="h-3 w-3 shrink-0" />
      {compact ? m.short : m.label}
    </>
  );
  const cls = `inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-semibold ${m.cls}`;
  if (!onClick) return <span className={cls} title={title}>{content}</span>;
  return (
    <button
      type="button"
      title={title ?? "Set grooming preferences"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      className={`${cls} hover:opacity-80`}
    >
      {content}
    </button>
  );
}
