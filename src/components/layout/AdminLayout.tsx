import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { MobileTopBar } from "./MobileTopBar";
import { adminNav } from "@/constants/navigation";

const STORAGE_KEY = "sk.sidebar.collapsed";

export default function AdminLayout() {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  });
  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0"); } catch {}
  }, [collapsed]);

  return (
    <div className="flex min-h-screen w-full bg-sk-bg text-foreground">
      <AppSidebar
        items={adminNav}
        footerLabel="Sloppy Kisses · Bryanston"
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((c) => !c)}
      />
      <div className="flex-1 min-w-0 flex flex-col">
        <MobileTopBar items={adminNav} footerLabel="Sloppy Kisses · Bryanston" />
        <Outlet />
      </div>
    </div>
  );
}