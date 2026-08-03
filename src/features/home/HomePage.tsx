import { format } from "date-fns";
import {
  Dog, Hotel, Scissors, Truck, ArrowLeftRight, Users, PawPrint, CalendarCheck,
  LayoutDashboard, MessageSquare, ReceiptText, AlertCircle,
  Sparkles,
} from "lucide-react";
import { useCurrentUser } from "@/lib/tenant/TenantContext";
import { useDashboardTodayStats } from "@/features/dashboard/queries";
import { useHomeAttention } from "./queries";
import { SoftDashboardTile, type SoftTileTone } from "@/components/ui/SoftDashboardTile";

interface Tile {
  to: string;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  code?: string;
  countKey?: "grooming" | "mobile" | "daycare" | "hotel" | "transport";
  attentionKey?: "unpaidToday" | "unassigned";
  showStayPlay?: boolean;
  tone: "coral" | "turquoise" | "green" | "orange";
}

const TILES: Tile[] = [
  { to: "/admin/daycare", label: "Daycare", hint: "Today's dogs", icon: Dog, code: "daycare.view", countKey: "daycare", tone: "green", showStayPlay: true },
  { to: "/admin/hotel-cattery", label: "Hotel & Cattery", hint: "In house today", icon: Hotel, code: "hotel.view", countKey: "hotel", tone: "turquoise" },
  { to: "/admin/grooming", label: "Grooming", hint: "Today's appointments", icon: Scissors, code: "grooming.view", countKey: "grooming", attentionKey: "unpaidToday", tone: "coral" },
  { to: "/admin/mobile-vans", label: "Mobile vans", hint: "Today's route", icon: Truck, code: "grooming.view", countKey: "mobile", tone: "orange" },
  { to: "/admin/pickup-dropoff", label: "Pick up / Drop off", hint: "Today's legs", icon: ArrowLeftRight, code: "transport.view", countKey: "transport", attentionKey: "unassigned", tone: "turquoise" },
  { to: "/admin/bookings", label: "Bookings", hint: "Search & create", icon: CalendarCheck, code: "bookings.view", tone: "coral" },
  { to: "/admin/customers", label: "Customers", hint: "Accounts & contacts", icon: Users, code: "customers.view", tone: "green" },
  { to: "/admin/pets", label: "Pets", hint: "Profiles & vaccinations", icon: PawPrint, code: "pets.view", tone: "orange" },
  { to: "/admin/comms", label: "Comms", hint: "Messages sent", icon: MessageSquare, code: "comms.view", tone: "turquoise" },
  { to: "/admin/invoices", label: "Invoices", hint: "Look up an account", icon: ReceiptText, code: "invoices.view", tone: "coral" },
  { to: "/admin/dashboard", label: "Dashboard", hint: "The full picture", icon: LayoutDashboard, tone: "green" },
];

const TONES: Record<Tile["tone"], SoftTileTone> = {
  coral: "coral",
  turquoise: "cyan",
  green: "green",
  orange: "orange",
};

export default function HomePage() {
  const { profile, currentTenant, hasPermission } = useCurrentUser();
  const isPlatform = profile?.user_type === "platform";
  const tenantId = currentTenant?.id ?? null;
  const statsQ = useDashboardTodayStats(tenantId);
  const attention = useHomeAttention(tenantId);

  const tiles = TILES.filter((t) => !t.code || isPlatform || hasPermission(t.code));
  const displayName = (profile?.full_name ?? "").trim() || "there";

  return (
    <div className="flex-1 space-y-6 px-5 py-6 sm:px-7 sm:py-7 lg:px-9 lg:py-9">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-[-0.02em] sm:text-[34px] sm:leading-tight">Hi {displayName}</h1>
        <p className="text-sm text-muted-foreground sm:text-[15px]">
          {format(new Date(), "EEEE, d MMMM yyyy")} — pick where you're working.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 md:grid-cols-3 xl:grid-cols-4">
        {tiles.map((tile) => {
          const Icon = tile.icon;
          const count = tile.countKey ? statsQ.data?.[tile.countKey]?.today : undefined;
          const alerts = tile.attentionKey ? (attention.data?.[tile.attentionKey] ?? 0) : 0;
          const sp = tile.showStayPlay ? (attention.data?.stayPlayToday ?? 0) : 0;
          const spLate = tile.showStayPlay ? (attention.data?.stayPlayOverdue ?? 0) : 0;
          return (
            <SoftDashboardTile
              key={tile.to + tile.label}
              to={tile.to}
              title={tile.label}
              subtitle={tile.hint}
              tone={TONES[tile.tone]}
              icon={<Icon className="h-6 w-6 sm:h-7 sm:w-7" />}
              loading={Boolean(tile.countKey) && statsQ.isLoading}
              value={tile.countKey ? (count ?? 0) : undefined}
              alert={
                alerts > 0 || sp > 0 ? (
                  <span className="mt-2 flex flex-wrap gap-1.5">
                    {alerts > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-1 text-[11px] font-semibold text-destructive">
                        <AlertCircle className="h-3 w-3" />
                        {tile.attentionKey === "unpaidToday" ? `${alerts} unpaid today` : `${alerts} unassigned`}
                      </span>
                    )}
                    {sp > 0 && (
                      <span
                        className={
                          "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold " +
                          (spLate > 0
                            ? "bg-destructive/10 text-destructive"
                            : "bg-sk-turquoise-soft text-sk-turquoise-dark")
                        }
                      >
                        <Sparkles className="h-3 w-3" />
                        {spLate > 0 ? `${spLate} Stay & Play overdue` : `${sp} Stay & Play`}
                      </span>
                    )}
                  </span>
                ) : undefined
              }
            />
          );
        })}
      </div>
    </div>
  );
}