import { Outlet } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { adminNav } from "@/constants/navigation";

export default function AdminLayout() {
  return (
    <div className="flex min-h-screen w-full bg-sk-bg text-foreground">
      <AppSidebar items={adminNav} footerLabel="Sloppy Kisses · Bryanston" />
      <div className="flex-1 min-w-0 flex flex-col">
        <Outlet />
      </div>
    </div>
  );
}