import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";

interface Props {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function WizardShell({ title, subtitle, children, footer }: Props) {
  return (
    <>
      <AppHeader title={title} subtitle={subtitle} />
      <div className="flex-1 space-y-4 p-4 md:p-6">
        <Link to="/customer/bookings/new" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Choose a different service
        </Link>
        <div className="sk-card p-5 md:p-6">
          <div className="space-y-5">{children}</div>
          {footer && <div className="mt-6 flex justify-end gap-2 border-t border-border pt-4">{footer}</div>}
        </div>
      </div>
    </>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      {children}
      {hint && <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>}
    </label>
  );
}

export const inputCls = "h-10 w-full rounded-lg border border-border bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-sk-coral/40";
export const selectCls = inputCls;
export const textareaCls = "w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sk-coral/40";