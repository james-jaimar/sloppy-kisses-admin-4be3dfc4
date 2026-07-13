import { NavLink } from "react-router-dom";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { Logo } from "./Logo";
import { cn } from "@/lib/utils";
import { useCurrentUser } from "@/lib/tenant/TenantContext";

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  code?: string;
}

interface Props {
  items: readonly NavItem[];
  footerLabel?: string;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

export function SidebarNavList({
  items,
  collapsed = false,
  onNavigate,
}: {
  items: readonly NavItem[];
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const { hasPermission, profile } = useCurrentUser();
  const isPlatform = profile?.user_type === "platform";
  const visibleItems = items.filter((it) => !it.code || isPlatform || hasPermission(it.code));
  return (
    <ul className="space-y-0.5">
      {visibleItems.map((item) => {
        const Icon = item.icon;
        return (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end
              onClick={onNavigate}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) =>
                cn(
                  "group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                  collapsed && "justify-center px-2",
                  isActive
                    ? "bg-sk-coral-soft text-sk-coral-dark"
                    : "text-foreground/75 hover:bg-muted hover:text-foreground",
                )
              }
            >
              <Icon className="h-[18px] w-[18px] shrink-0" />
              {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
              {item.badge ? (
                collapsed ? (
                  <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-sk-coral" />
                ) : (
                  <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-sk-coral px-1.5 text-[11px] font-semibold text-white">
                    {item.badge}
                  </span>
                )
              ) : null}
            </NavLink>
          </li>
        );
      })}
    </ul>
  );
}

export function AppSidebar({ items, footerLabel, collapsed = false, onToggleCollapsed }: Props) {
  const { hasPermission, profile } = useCurrentUser();
  const isPlatform = profile?.user_type === "platform";
  void hasPermission; void isPlatform;
  return (
    <aside
      className={cn(
        "hidden lg:flex shrink-0 flex-col border-r border-border bg-sidebar transition-[width] duration-200",
        collapsed ? "w-16" : "w-64",
      )}
    >
      <div className={cn("flex items-center pt-5 pb-4", collapsed ? "justify-center px-2" : "justify-between px-5")}>
        <Logo compact={collapsed} />
        {onToggleCollapsed && !collapsed && (
          <button
            onClick={onToggleCollapsed}
            className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-muted"
            title="Collapse sidebar"
          >
            <ChevronsLeft className="h-4 w-4" />
          </button>
        )}
      </div>
      {onToggleCollapsed && collapsed && (
        <div className="flex justify-center pb-2">
          <button
            onClick={onToggleCollapsed}
            className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-muted"
            title="Expand sidebar"
          >
            <ChevronsRight className="h-4 w-4" />
          </button>
        </div>
      )}
      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        <SidebarNavList items={items} collapsed={collapsed} />
      </nav>
      {footerLabel && !collapsed && (
        <div className="border-t border-border px-5 py-3 text-[11px] uppercase tracking-wider text-muted-foreground">
          {footerLabel}
        </div>
      )}
    </aside>
  );
}