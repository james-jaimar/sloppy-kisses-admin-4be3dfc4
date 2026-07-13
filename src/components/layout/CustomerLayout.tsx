import { Outlet } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { MobileTopBar } from "./MobileTopBar";
import { customerNav } from "@/constants/navigation";

export default function CustomerLayout() {
  return (
    <div className="flex min-h-screen w-full bg-sk-bg text-foreground">
      <AppSidebar items={customerNav} footerLabel="Customer Portal" />
      <div className="flex-1 min-w-0 flex flex-col">
        <MobileTopBar items={customerNav} footerLabel="Customer Portal" />
        <Outlet />
      </div>
    </div>
  );
}