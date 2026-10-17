import { Link, Outlet, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Logo } from "./Logo";

export default function PublicFormLayout() {
  const { pathname } = useLocation();
  const isBooking = pathname === "/book" || pathname === "/book/hotel";
  return (
    <div className="min-h-screen w-full bg-sk-bg">
      <header className="border-b border-border bg-sk-surface">
        <div className={`mx-auto flex h-20 items-center justify-between gap-4 px-4 sm:px-6 ${isBooking ? "max-w-6xl" : "max-w-4xl"}`}>
          <Logo />
          <a href="https://sloppykisses.co.za" className="hidden text-sm text-muted-foreground hover:text-foreground sm:block">
            sloppykisses.co.za
          </a>
          {isBooking && <Button asChild variant="outline" size="sm"><Link to="/login">Sign in</Link></Button>}
        </div>
      </header>
      <main className={`mx-auto px-4 sm:px-6 ${isBooking ? "max-w-6xl py-6 sm:py-8" : "max-w-3xl py-10"}`}>
        <Outlet />
      </main>
      <footer className="py-8 text-center text-xs text-muted-foreground">
        © Sloppy Kisses. All information is kept private and secure.
      </footer>
    </div>
  );
}