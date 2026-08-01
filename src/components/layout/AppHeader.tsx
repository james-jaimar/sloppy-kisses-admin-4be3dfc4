import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Bell, KeyRound, LogOut, MessageSquare, Plus, Search, ShieldCheck, CalendarPlus, UserPlus, Dog, FileText, ChevronDown } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";
import { useCurrentUser } from "@/lib/tenant/TenantContext";
import { useQuickAdd, type QuickAddKind } from "@/components/quickAdd/QuickAddProvider";

interface Props {
  title?: string;
  subtitle?: string;
  tabs?: { label: string; active?: boolean; onClick?: () => void; badge?: number | string }[];
  actions?: React.ReactNode;
}

export function AppHeader({ title, subtitle, tabs, actions }: Props) {
  const { authUser, signOut } = useAuth();
  const { profile, roles } = useCurrentUser();
  const location = useLocation();
  const isPlatform = profile?.user_type === "platform";
  const inPlatform = location.pathname.startsWith("/platform");
  const isPortal = location.pathname.startsWith("/customer");
  const passwordPath = isPortal
    ? "/customer/profile/password"
    : "/admin/settings/password";
  const displayName = profile?.full_name ?? authUser?.email ?? "";
  const initials =
    (displayName || "?")
      .split(/\s+/)
      .filter(Boolean)
      .map((s) => s[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?";
  const roleLabel = isPlatform
    ? "Platform · Sys Dev"
    : (roles[0]?.label ?? (profile?.user_type ? profile.user_type : ""));
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [addOpen, setAddOpen] = useState(false);
  const addRef = useRef<HTMLDivElement>(null);
  const quickAdd = useQuickAdd();
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);
  useEffect(() => {
    if (!addOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (addRef.current && !addRef.current.contains(e.target as Node)) setAddOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [addOpen]);

  const quickAddItems: { kind: QuickAddKind; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { kind: "booking", label: "New booking", icon: CalendarPlus },
    { kind: "customer", label: "New customer", icon: UserPlus },
    { kind: "enrolment", label: "New daycare enrolment", icon: Dog },
    { kind: "invoice", label: "New invoice", icon: FileText },
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-sk-surface/85 backdrop-blur">
      <div className="flex h-16 items-center gap-2 px-3 sm:gap-3 sm:px-6">
        {isPortal ? (
          <div className="flex-1" />
        ) : (
        <>
        <div className="relative flex-1 max-w-xl min-w-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search…"
            className="h-10 w-full rounded-xl border border-border bg-sk-surface-muted pl-10 pr-4 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-sk-coral/40"
          />
        </div>
        <div className="relative hidden md:block" ref={addRef}>
          <button
            onClick={() => setAddOpen((v) => !v)}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-sk-coral px-4 text-sm font-semibold text-white hover:bg-sk-coral-dark transition-colors"
          >
            <Plus className="h-4 w-4" />
            Quick add
            <ChevronDown className="h-4 w-4 opacity-80" />
          </button>
          {addOpen && (
            <div className="absolute right-0 top-12 z-40 w-60 rounded-xl border border-border bg-white p-1 shadow-lg">
              {quickAddItems.map((it) => {
                const Icon = it.icon;
                return (
                  <button
                    key={it.kind}
                    onClick={() => { setAddOpen(false); quickAdd.open(it.kind); }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-muted"
                  >
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    {it.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {isPlatform && (
          <Link
            to={inPlatform ? "/admin/dashboard" : "/platform"}
            title={inPlatform ? "Back to tenant admin" : "Open Sys Dev area"}
            className="hidden lg:inline-flex h-10 items-center gap-2 rounded-xl border border-sk-coral-soft bg-sk-coral-soft/50 px-3 text-xs font-semibold text-sk-coral-dark hover:bg-sk-coral-soft"
          >
            <ShieldCheck className="h-4 w-4" />
            {inPlatform ? "Exit Sys Dev" : "Sys Dev"}
          </Link>
        )}
        <button className="relative hidden sm:grid h-10 w-10 place-items-center rounded-xl border border-border text-muted-foreground hover:text-foreground hover:bg-muted">
          <MessageSquare className="h-[18px] w-[18px]" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-sk-turquoise" />
        </button>
        <button className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border text-muted-foreground hover:text-foreground hover:bg-muted">
          <Bell className="h-[18px] w-[18px]" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-sk-coral" />
        </button>
        </>
        )}
        <div className="relative flex items-center gap-2 pl-1 sm:pl-2 shrink-0" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 rounded-xl px-1 py-1 hover:bg-muted"
          >
            <div className="grid h-10 w-10 place-items-center rounded-full bg-sk-turquoise-soft text-sk-turquoise-dark text-sm font-semibold">
              {initials}
            </div>
            <div className={(isPortal ? "hidden sm:block" : "hidden xl:block") + " leading-tight text-left"}>
              <div className="text-sm font-medium">{displayName || "\u2014"}</div>
              <div className="text-[11px] text-muted-foreground capitalize">{roleLabel || ""}</div>
            </div>
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-12 z-40 w-56 rounded-xl border border-border bg-white p-1 shadow-lg">
              <div className="px-3 py-2">
                <div className="text-sm font-medium truncate">{displayName || "\u2014"}</div>
                <div className="text-xs text-muted-foreground truncate">{authUser?.email}</div>
              </div>
              <div className="my-1 h-px bg-border" />
              <Link
                to={passwordPath}
                onClick={() => setMenuOpen(false)}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-muted"
              >
                <KeyRound className="h-4 w-4" /> Change password
              </Link>
              <button
                onClick={async () => {
                  setMenuOpen(false);
                  await signOut();
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-muted"
              >
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
      {(title || tabs || actions) && (
        <div className="flex flex-col gap-3 border-t border-border px-4 py-4 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            {title && <h1 className="text-xl sm:text-2xl font-semibold tracking-tight truncate">{title}</h1>}
            {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
            {tabs && (
              <div className="mt-3 flex flex-wrap gap-1">
                {tabs.map((t) => (
                  <button
                    key={t.label}
                    onClick={t.onClick}
                    className={
                      "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors " +
                      (t.active
                        ? "bg-sk-coral-soft text-sk-coral-dark"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground")
                    }
                  >
                    {t.label}
                    {t.badge !== undefined && t.badge !== null && (
                      <span className="ml-1.5 text-xs text-muted-foreground">{t.badge}</span>
                    )}
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