import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";

import { AppSidebar } from "./AppSidebar";
import { MobileTopBar } from "./MobileTopBar";
import { SendLockBanner } from "./SendLockBanner";
import { adminNav } from "@/constants/navigation";
import { QuickAddProvider } from "@/components/quickAdd/QuickAddProvider";

const STORAGE_KEY = "sk.sidebar.collapsed";

export default function AdminLayout() {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  });
  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0"); } catch {}
  }, [collapsed]);

  // Full-screen tools (the till) need a hard height cap so their internal
  // scroll areas work and the pay buttons stay pinned to the bottom.
  const { pathname } = useLocation();
  const fixedHeight = pathname.startsWith("/admin/pos");

  return (
    <QuickAddProvider>
    <div
      className={
        "flex w-full bg-sk-bg text-foreground " +
        (fixedHeight ? "h-[100dvh] overflow-hidden" : "min-h-screen")
      }
    >
      {!fixedHeight && (
        <AppSidebar
          items={adminNav}
          footerLabel="Sloppy Kisses · Bryanston"
          collapsed={collapsed}
          onToggleCollapsed={() => setCollapsed((c) => !c)}
        />
      )}
      <div className={"flex-1 min-w-0 flex flex-col" + (fixedHeight ? " min-h-0 overflow-hidden" : "")}>
        {!fixedHeight && <MobileTopBar items={adminNav} footerLabel="Sloppy Kisses · Bryanston" />}
        <SendLockBanner />
        <Outlet />
      </div>
    </div>
    </QuickAddProvider>
  );
}
