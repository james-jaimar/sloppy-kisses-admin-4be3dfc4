import { NavLink } from "react-router-dom";
import { Logo } from "./Logo";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

interface Props {
  items: readonly NavItem[];
  footerLabel?: string;
}

export function AppSidebar({ items, footerLabel }: Props) {
  return (
    <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-border bg-sidebar">
      <div className="px-5 pt-5 pb-4">
        <Logo />
      </div>
      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        <ul className="space-y-0.5">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end
                  className={({ isActive }) =>
                    cn(
                      "group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-sk-coral-soft text-sk-coral-dark"
                        : "text-foreground/75 hover:bg-muted hover:text-foreground",
                    )
                  }
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" />
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.badge ? (
                    <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-sk-coral px-1.5 text-[11px] font-semibold text-white">
                      {item.badge}
                    </span>
                  ) : null}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>
      {footerLabel && (
        <div className="border-t border-border px-5 py-3 text-[11px] uppercase tracking-wider text-muted-foreground">
          {footerLabel}
        </div>
      )}
    </aside>
  );
}