import { Bell, MessageSquare, Plus, Search } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";

interface Props {
  title?: string;
  subtitle?: string;
  tabs?: { label: string; active?: boolean }[];
  actions?: React.ReactNode;
}

export function AppHeader({ title, subtitle, tabs, actions }: Props) {
  const { user } = useAuth();
  const initials = (user?.displayName ?? "?").split(" ").map((s) => s[0]).join("").slice(0, 2);

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-sk-surface/85 backdrop-blur">
      <div className="flex h-16 items-center gap-3 px-6">
        <div className="relative flex-1 max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search customers, pets, bookings..."
            className="h-10 w-full rounded-xl border border-border bg-sk-surface-muted pl-10 pr-4 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-sk-coral/40"
          />
        </div>
        <button className="hidden sm:inline-flex h-10 items-center gap-2 rounded-xl bg-sk-coral px-4 text-sm font-semibold text-white hover:bg-sk-coral-dark transition-colors">
          <Plus className="h-4 w-4" />
          Quick add
        </button>
        <button className="relative grid h-10 w-10 place-items-center rounded-xl border border-border text-muted-foreground hover:text-foreground hover:bg-muted">
          <MessageSquare className="h-[18px] w-[18px]" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-sk-turquoise" />
        </button>
        <button className="relative grid h-10 w-10 place-items-center rounded-xl border border-border text-muted-foreground hover:text-foreground hover:bg-muted">
          <Bell className="h-[18px] w-[18px]" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-sk-coral" />
        </button>
        <div className="flex items-center gap-2 pl-2">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-sk-turquoise-soft text-sk-turquoise-dark text-sm font-semibold">
            {initials}
          </div>
          <div className="hidden sm:block leading-tight">
            <div className="text-sm font-medium">{user?.displayName}</div>
            <div className="text-[11px] text-muted-foreground">Tenant owner</div>
          </div>
        </div>
      </div>
      {(title || tabs || actions) && (
        <div className="flex flex-col gap-3 border-t border-border px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {title && <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>}
            {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
            {tabs && (
              <div className="mt-3 flex flex-wrap gap-1">
                {tabs.map((t) => (
                  <button
                    key={t.label}
                    className={
                      "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors " +
                      (t.active
                        ? "bg-sk-coral-soft text-sk-coral-dark"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground")
                    }
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
    </header>
  );
}