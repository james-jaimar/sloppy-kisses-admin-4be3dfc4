import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Sliders, Users, KeyRound, Building2, ChevronRight, Scissors, PlusCircle, Hotel, Truck, ArrowLeftRight, CalendarDays, Sun, Receipt, CreditCard, MessageSquare, Send, Syringe, Package, Warehouse, ShoppingBag, ShieldCheck, Palette, Server, FileUp, Dog, FileText, Gavel, Search, MapPin } from "lucide-react";
import { Archive, Link2, ListChecks } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFeature } from "@/lib/features/useFeature";
import { FEATURE } from "@/lib/features/catalog";

/** Settings entries that only exist when the tenant has the module. */
const FEATURE_GATED_SECTIONS: Record<string, string> = {
  Xero: FEATURE.xero,
  "Xero sync log": FEATURE.xero,
  "Xero customers": FEATURE.xero,
};

const SECTIONS = [
  {
    to: "/admin/settings/resources",
    label: "Resources",
    description: "Groomers, mobile vans, kennels, runs, daycare areas.",
    icon: Sliders,
    ready: true,
  },
  {
    to: "/admin/settings/grooming-packages",
    label: "Grooming rate card",
    description: "Package prices by species and size. Admin-editable.",
    icon: Scissors,
    ready: true,
  },
  {
    to: "/admin/settings/groomers",
    label: "Groomers",
    description: "Who is on the floor, their hours and diary colour. Used for auto-assign and preferred groomers.",
    icon: Scissors,
    ready: true,
  },
  {
    to: "/admin/settings/grooming-addons",
    label: "Grooming add-ons",
    description: "Teeth, nails, ear clean, shampoo upgrades, travel fee.",
    icon: PlusCircle,
    ready: true,
  },
  {
    to: "/admin/settings/grooming-workflow",
    label: "Grooming workflow",
    description: "Vaccination gate, pensioner discount, default mobile travel fee.",
    icon: Scissors,
    ready: true,
  },
  {
    to: "/admin/settings/grooming-instructions",
    label: "Grooming instructions",
    description: "Catalog of Shampoo / Head / Body / Legs / Accessories / Medical flags for staff and customer selection.",
    icon: Scissors,
    ready: true,
  },
  {
    to: "/admin/settings/dog-breeds",
    label: "Dog breeds",
    description: "Master list of breeds with size band. Auto-fills a pet's size when a breed is picked.",
    icon: Dog,
    ready: true,
  },
  {
    to: "/admin/settings/hotel-workflow",
    label: "Hotel & Cattery workflow",
    description: "Vaccination gate, check-in window, late-checkout fee.",
    icon: Hotel,
    ready: true,
  },
  {
    to: "/admin/settings/hotel-rates",
    label: "Hotel & Cattery rates",
    description: "Nightly rates by species/accommodation, peak uplift, extra-pet fee, and surcharges.",
    icon: Hotel,
    ready: true,
  },
  {
    to: "/admin/settings/van-workflow",
    label: "Mobile van workflow",
    description: "Travel gap warnings, working hours, per-van home suburb.",
    icon: Truck,
    ready: true,
  },
  {
    to: "/admin/settings/transport-workflow",
    label: "Transport workflow",
    description: "Pick-up / drop-off gap warnings, working hours, default lead times.",
    icon: ArrowLeftRight,
    ready: true,
  },
  {
    to: "/admin/settings/daycare-plans",
    label: "Daycare plans",
    description: "Weekly/monthly daycare packages and pricing.",
    icon: CalendarDays,
    ready: true,
  },
  {
    to: "/admin/settings/daycare-workflow",
    label: "Daycare workflow",
    description: "Arrival window, late cutoff, auto-checkout, vax gate.",
    icon: Sun,
    ready: true,
  },
  {
    to: "/admin/settings/daycare-import",
    label: "Import daycare register",
    description: "Reconcile the weekly register against customers, pets, and create July invoices.",
    icon: FileUp,
    ready: true,
  },
  {
    to: "/admin/settings/invoicing",
    label: "Invoicing",
    description: "Company details, invoice numbering, VAT, reminders.",
    icon: Receipt,
    ready: true,
  },
  {
    to: "/admin/settings/payment-methods",
    label: "Payment methods",
    description: "Manual payment methods available when recording payments.",
    icon: CreditCard,
    ready: true,
  },
  {
    to: "/admin/settings/payment-providers",
    label: "Payment providers",
    description: "Manual refunds today. PayFast / Yoco / Stripe scaffolding for future connect.",
    icon: CreditCard,
    ready: true,
  },
  {
    to: "/admin/settings/message-templates",
    label: "Message templates",
    description: "Customer messages for bookings, invoices and reminders.",
    icon: MessageSquare,
    ready: true,
  },
  {
    to: "/admin/settings/gateway-activity",
    label: "Gateway activity",
    description: "Online payment notifications, checkout attempts and a test tool.",
    icon: CreditCard,
    ready: true,
  },
  {
    to: "/admin/settings/comms",
    label: "Comms settings",
    description: "Sender identity, quiet hours, test sends.",
    icon: Send,
    ready: true,
  },
  {
    to: "/admin/settings/email",
    label: "Email server",
    description: "SMTP host, port, credentials and test send.",
    icon: Server,
    ready: true,
  },
  {
    to: "/admin/settings/branding",
    label: "Branding",
    description: "Logo, favicon and colour scheme.",
    icon: Palette,
    ready: true,
  },
  {
    to: "/admin/settings/vaccination-rules",
    label: "Vaccination rules",
    description: "Per-service vaccine requirements and grace periods.",
    icon: Syringe,
    ready: true,
  },
  {
    to: "/admin/settings/product-categories",
    label: "Product categories",
    description: "Group retail products for filtering and reports.",
    icon: Package,
    ready: true,
  },
  {
    to: "/admin/settings/stock-locations",
    label: "Stock locations",
    description: "Where retail stock is held (front counter, storeroom, van).",
    icon: Warehouse,
    ready: true,
  },
  {
    to: "/admin/settings/retail",
    label: "Retail settings",
    description: "Default VAT, negative-stock rule, low-stock notifications.",
    icon: ShoppingBag,
    ready: true,
  },
  {
    to: "/admin/settings/documents",
    label: "Documents & retention",
    description: "How long we keep vaccination certificates and other uploads, archive grace, nightly purge.",
    icon: Archive,
    ready: true,
  },
  {
    to: "/admin/settings/job-checklists",
    label: "Job checklists",
    description: "Steps staff tick off in Work mode for each service — grooming, hotel, cattery, daycare and transport.",
    icon: Archive,
    ready: true,
  },
  {
    to: "/admin/settings/policies",
    label: "Policies",
    description: "Deposits, cancellation windows, notice periods and overdue interest applied across bookings and invoices.",
    icon: Gavel,
    ready: true,
  },
  {
    to: "/admin/settings/closures",
    label: "Closures & holidays",
    description: "Public holidays and shut days. Daycare pro-rata skips them and bookings are blocked.",
    icon: Gavel,
    ready: true,
  },
  {
    to: "/admin/settings/catchup-credits",
    label: "Catch-up credits",
    description: "Daycare days missed through closures or illness, when they expire and when they were used.",
    icon: CalendarDays,
    ready: true,
  },
  {
    to: "/admin/settings/parasite-treatments",
    label: "Parasite treatments",
    description: "Tick & flea, deworming and kennel cough intervals, whether they warn or block at arrival, and the on-arrival treatment charge.",
    icon: Gavel,
    ready: true,
  },
  {
    to: "/admin/settings/price-increase",
    label: "Annual price increase",
    description: "Lift daycare plans, hotel rates and grooming prices by a percentage. Preview before applying.",
    icon: Receipt,
    ready: true,
  },
  {
    to: "/admin/settings/terms",
    label: "Terms & Registration",
    description: "Versioned Terms & Conditions and daycare registration text customers accept on portal login.",
    icon: FileText,
    ready: true,
  },
  {
    to: "/admin/settings/consent-status",
    label: "Registration status",
    description: "See which customers have completed the digital registration, who's still in the grace window, and who's overdue.",
    icon: FileText,
    ready: true,
  },
  {
    to: "/admin/users",
    label: "Users & roles",
    description: "Staff accounts, roles and permissions.",
    icon: Users,
    ready: true,
  },
  {
    to: "/admin/settings/roles-permissions",
    label: "Roles & permissions",
    description: "See which permissions each role has.",
    icon: ShieldCheck,
    ready: true,
  },
  {
    to: "/admin/settings/password",
    label: "Change password",
    description: "Update your own password.",
    icon: KeyRound,
    ready: true,
  },
  {
    to: "#",
    label: "Branch details",
    description: "Trading hours, address, tax settings.",
    icon: Building2,
    ready: false,
  },
];

SECTIONS.push(
  {
    to: "/admin/settings/xero",
    label: "Xero",
    description: "Connect a Xero organisation, map sales and bank accounts, and push customers, invoices and payments across.",
    icon: Link2,
    ready: true,
  },
  {
    to: "/admin/settings/xero-log",
    label: "Xero sync log",
    description: "Every push to Xero with the exact error when one fails.",
    icon: ListChecks,
    ready: true,
  },
  {
    to: "/admin/settings/xero-customers",
    label: "Xero customers",
    description: "Match contacts that already exist in Xero to Sloppy Kisses customers so nothing gets duplicated.",
    icon: Link2,
    ready: true,
  },
  {
    to: "/admin/settings/billing-item-codes",
    label: "Billing item codes",
    description: "SKUs for each service, added to invoice lines and pushed to Xero as item codes.",
    icon: ListChecks,
    ready: true,
  },
  {
    to: "/admin/settings/address-verification",
    label: "Address verification",
    description: "Backfill saved addresses with Google Place IDs and coordinates for maps and routing.",
    icon: MapPin,
    ready: true,
  },
);

const GROUPS: { id: string; label: string; members: string[] }[] = [
  {
    id: "operations",
    label: "Operations",
    members: ["Resources", "Daycare plans", "Daycare workflow", "Import daycare register", "Hotel & Cattery workflow", "Mobile van workflow", "Transport workflow"],
  },
  {
    id: "work",
    label: "Staff work mode",
    members: ["Job checklists"],
  },
  {
    id: "grooming",
    label: "Grooming",
    members: ["Grooming rate card", "Grooming add-ons", "Grooming workflow", "Grooming instructions", "Dog breeds"],
  },
  {
    id: "pricing",
    label: "Pricing & billing",
    members: ["Hotel & Cattery rates", "Annual price increase", "Invoicing", "Payment methods", "Payment providers", "Gateway activity"],
  },
  {
    id: "comms",
    label: "Comms",
    members: ["Message templates", "Comms settings", "Email server"],
  },
  {
    id: "compliance",
    label: "Compliance",
    members: ["Vaccination rules", "Documents & retention", "Policies", "Closures & holidays", "Catch-up credits", "Terms & Registration", "Registration status"],
  },
  {
    id: "retail",
    label: "Retail",
    members: ["Product categories", "Stock locations", "Retail settings"],
  },
  {
    id: "integrations",
    label: "Integrations",
    members: ["Xero", "Xero customers", "Billing item codes", "Xero sync log", "Address verification"],
  },
  {
    id: "admin",
    label: "Business & access",
    members: ["Branding", "Users & roles", "Roles & permissions", "Change password", "Branch details"],
  },
];

export default function SettingsIndexPage() {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const xeroOn = useFeature(FEATURE.xero);
  const featureOn: Record<string, boolean> = { [FEATURE.xero]: xeroOn };

  const groups = useMemo(() => {
    const byLabel = new Map(SECTIONS.map((s) => [s.label, s] as const));
    return GROUPS.map((g) => ({
      ...g,
      items: g.members
        .map((m) => byLabel.get(m))
        .filter(Boolean)
        .filter((s) => {
          const key = FEATURE_GATED_SECTIONS[s!.label];
          return !key || featureOn[key];
        })
        .filter((s) =>
          !query ||
          s!.label.toLowerCase().includes(query) ||
          s!.description.toLowerCase().includes(query),
        ) as typeof SECTIONS,
    }));
  }, [query, xeroOn]);

  const visibleGroups = groups.filter((g) => g.items.length > 0);

  function renderGrid(items: typeof SECTIONS) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((s) => {
            const Icon = s.icon;
            const content = (
              <div className="sk-card flex items-center gap-4 p-5 transition-colors hover:border-sk-coral">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-sk-coral-soft text-sk-coral-dark">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="font-semibold">{s.label}</div>
                    {!s.ready && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        Soon
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">{s.description}</div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            );
            return s.ready ? (
              <Link key={s.label} to={s.to}>{content}</Link>
            ) : (
              <div key={s.label} className="cursor-not-allowed opacity-60">{content}</div>
            );
        })}
      </div>
    );
  }

  return (
    <>
      <AppHeader title="Settings" subtitle="Configure the business." />
      <div className="flex-1 p-6">
        <div className="relative mb-4 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search settings…"
            className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm"
          />
        </div>

        {query ? (
          <div className="space-y-6">
            {visibleGroups.length === 0 && (
              <div className="text-sm text-muted-foreground">No settings match “{q}”.</div>
            )}
            {visibleGroups.map((g) => (
              <section key={g.id}>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</h2>
                {renderGrid(g.items)}
              </section>
            ))}
          </div>
        ) : (
          <Tabs defaultValue={GROUPS[0].id}>
            <TabsList className="mb-4 flex h-auto w-full flex-wrap justify-start gap-1">
              {visibleGroups.map((g) => (
                <TabsTrigger key={g.id} value={g.id} className="text-xs sm:text-sm">
                  {g.label}
                  <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{g.items.length}</span>
                </TabsTrigger>
              ))}
            </TabsList>
            {visibleGroups.map((g) => (
              <TabsContent key={g.id} value={g.id} className="mt-0">
                {renderGrid(g.items)}
              </TabsContent>
            ))}
          </Tabs>
        )}
      </div>
    </>
  );
}