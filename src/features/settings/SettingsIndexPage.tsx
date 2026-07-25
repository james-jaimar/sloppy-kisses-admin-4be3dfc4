import { Link } from "react-router-dom";
import { Sliders, Users, KeyRound, Mail, Building2, ChevronRight, Scissors, PlusCircle, Hotel, Truck, ArrowLeftRight, CalendarDays, Sun, Receipt, CreditCard, MessageSquare, Send, Syringe, Package, Warehouse, ShoppingBag, ShieldCheck, Palette, Server, FileUp, Dog } from "lucide-react";
import { Archive } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";

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

export default function SettingsIndexPage() {
  return (
    <>
      <AppHeader title="Settings" subtitle="Configure the business." />
      <div className="flex-1 p-6">
        <div className="grid gap-3 sm:grid-cols-2">
          {SECTIONS.map((s) => {
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
      </div>
    </>
  );
}