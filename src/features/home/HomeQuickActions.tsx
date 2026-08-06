import { useState } from "react";
import { CalendarPlus, Dog, CreditCard, FileText } from "lucide-react";
import { useCurrentUser } from "@/lib/tenant/TenantContext";
import { useQuickAdd } from "@/components/quickAdd/QuickAddProvider";
import { WalkInDialog } from "@/features/daycare/WalkInDialog";
import { TakePaymentDialog } from "@/features/invoices/TakePaymentDialog";
import { NewQuoteDrawer } from "@/features/quotes/NewQuoteDrawer";

type Dialog = "walkin" | "payment" | "quote" | null;

export function HomeQuickActions() {
  const { currentTenant, profile, hasPermission } = useCurrentUser();
  const tenantId = currentTenant?.id ?? null;
  const isPlatform = profile?.user_type === "platform";
  const quickAdd = useQuickAdd();
  const [dialog, setDialog] = useState<Dialog>(null);

  const can = (code: string) => isPlatform || hasPermission(code);

  const actions = [
    { key: "booking", label: "New booking", icon: CalendarPlus, show: can("bookings.create"), onClick: () => quickAdd.open("booking") },
    { key: "walkin", label: "Walk-in check-in", icon: Dog, show: can("daycare.checkin"), onClick: () => setDialog("walkin") },
    { key: "payment", label: "Take a payment", icon: CreditCard, show: can("payments.create"), onClick: () => setDialog("payment") },
    { key: "quote", label: "New quote", icon: FileText, show: can("invoices.create"), onClick: () => setDialog("quote") },
  ].filter((a) => a.show);

  if (!tenantId || actions.length === 0) return null;

  return (
    <>
      <div className="flex flex-wrap gap-2 sm:gap-3">
        {actions.map((a) => {
          const Icon = a.icon;
          return (
            <button
              key={a.key}
              onClick={a.onClick}
              className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border border-border bg-white px-4 text-sm font-semibold shadow-sm transition-colors hover:border-sk-coral hover:bg-sk-coral-soft/40"
            >
              <Icon className="h-4 w-4 text-sk-coral" />
              {a.label}
            </button>
          );
        })}
      </div>

      {dialog === "walkin" && <WalkInDialog tenantId={tenantId} onClose={() => setDialog(null)} />}
      {dialog === "payment" && <TakePaymentDialog tenantId={tenantId} onClose={() => setDialog(null)} />}
      {dialog === "quote" && <NewQuoteDrawer tenantId={tenantId} onClose={() => setDialog(null)} />}
    </>
  );
}