import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Logo } from "./Logo";
import { SidebarNavList } from "./AppSidebar";

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
}

export function MobileTopBar({ items, footerLabel }: Props) {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  // Close drawer on route change
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  return (
    <div className="lg:hidden sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-sk-surface/95 px-3 backdrop-blur">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <button
            className="grid h-10 w-10 place-items-center rounded-xl border border-border text-foreground hover:bg-muted"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 p-0 flex flex-col [&>button]:hidden">
          <div className="flex items-center justify-between px-5 pt-5 pb-4">
            <Logo />
            <button
              onClick={() => setOpen(false)}
              className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted"
              aria-label="Close menu"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto px-3 pb-4">
            <SidebarNavList items={items} onNavigate={() => setOpen(false)} />
          </nav>
          {footerLabel && (
            <div className="border-t border-border px-5 py-3 text-[11px] uppercase tracking-wider text-muted-foreground">
              {footerLabel}
            </div>
          )}
        </SheetContent>
      </Sheet>
      <div className="flex-1 flex justify-center min-w-0 px-2">
        <Logo compact={false} />
      </div>
      <div className="w-10" />
    </div>
  );
}