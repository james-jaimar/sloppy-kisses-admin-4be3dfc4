import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

interface Props {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Small status chip shown in the header, visible while collapsed. */
  badge?: ReactNode;
  icon?: ReactNode;
  defaultOpen?: boolean;
  /** When set, open/closed state is remembered in localStorage. */
  storageKey?: string;
  /** Force the card open (e.g. deep link) — overrides stored state once. */
  forceOpen?: boolean;
  id?: string;
  children: ReactNode;
}

export function CollapsibleCard({
  title, subtitle, badge, icon, defaultOpen = false, storageKey, forceOpen, id, children,
}: Props) {
  const [open, setOpen] = useState(() => {
    if (typeof window !== "undefined" && storageKey) {
      const stored = window.localStorage.getItem(`sk-collapse:${storageKey}`);
      if (stored === "1") return true;
      if (stored === "0") return false;
    }
    return defaultOpen;
  });

  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);

  function toggle() {
    setOpen((v) => {
      const next = !v;
      if (storageKey) window.localStorage.setItem(`sk-collapse:${storageKey}`, next ? "1" : "0");
      return next;
    });
  }

  return (
    <div id={id} className="sk-card overflow-hidden p-0 scroll-mt-24">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-muted/40"
      >
        {icon}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{title}</span>
            {badge}
          </div>
          {subtitle && <div className="mt-0.5 text-xs text-muted-foreground">{subtitle}</div>}
        </div>
        <ChevronDown className={"h-4 w-4 shrink-0 text-muted-foreground transition-transform " + (open ? "rotate-180" : "")} />
      </button>
      {open && <div className="border-t border-border">{children}</div>}
    </div>
  );
}
