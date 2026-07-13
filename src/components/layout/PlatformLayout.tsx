import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { MobileTopBar } from "./MobileTopBar";
import { platformNav } from "@/constants/navigation";

const STORAGE_KEY = "sk.platform.sidebar.collapsed";

export default function PlatformLayout() {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  });
  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0"); } catch { /* noop */ }
  }, [collapsed]);

  return (
    <div className="flex min-h-screen w-full bg-sk-bg text-foreground">
      <AppSidebar
        items={platformNav}
        footerLabel="Platform · Sys Dev"
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((c) => !c)}
      />
      <div className="flex-1 min-w-0 flex flex-col">
        <MobileTopBar items={platformNav} footerLabel="Platform · Sys Dev" />
        <Outlet />
      </div>
    </div>
  );
}