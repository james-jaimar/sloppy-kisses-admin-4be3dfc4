import { Outlet } from "react-router-dom";
import { Logo } from "./Logo";

export default function PublicFormLayout() {
  return (
    <div className="min-h-screen w-full bg-sk-bg">
      <header className="border-b border-border bg-sk-surface">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-6">
          <Logo />
          <a href="https://sloppykisses.co.za" className="text-sm text-muted-foreground hover:text-foreground">
            sloppykisses.co.za
          </a>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-10">
        <Outlet />
      </main>
      <footer className="py-8 text-center text-xs text-muted-foreground">
        © Sloppy Kisses. All information is kept private and secure.
      </footer>
    </div>
  );
}