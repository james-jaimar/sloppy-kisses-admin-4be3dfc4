import { Link, useSearchParams } from "react-router-dom";
import { BedDouble, Scissors, Car, Sun, Truck, Loader2 } from "lucide-react";
import { usePublicTenant } from "./publicBookingQueries";

const SERVICES = [
  {
    key: "hotel",
    icon: BedDouble,
    title: "Hotel & Cattery",
    blurb: "Overnight stays for dogs and cats — check live space and prices, then book.",
    ready: true,
  },
  {
    key: "grooming",
    icon: Scissors,
    title: "In-house Grooming",
    blurb: "Full grooms, baths and tidy-ups at the parlour.",
    ready: true,
  },
  {
    key: "mobile",
    icon: Car,
    title: "Mobile Grooming",
    blurb: "The grooming van comes to your home.",
    ready: true,
  },
  {
    key: "daycare",
    icon: Sun,
    title: "Doggy Daycare",
    blurb: "Daily play, socialising and supervision.",
    ready: true,
  },
  {
    key: "transport",
    icon: Truck,
    title: "Pick up & Drop off",
    blurb: "Pet taxi to and from any of our services.",
    ready: true,
  },
];

export default function PublicBookPage() {
  const [params] = useSearchParams();
  const tenantSlug = params.get("tenant");
  const tenant = usePublicTenant(tenantSlug);
  const suffix = tenantSlug ? `?tenant=${encodeURIComponent(tenantSlug)}` : "";

  if (tenant.isLoading) {
    return <div className="grid place-items-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (!tenant.data) {
    return (
      <div className="rounded-2xl border border-border bg-sk-surface p-8 text-center text-sm text-muted-foreground">
        We couldn't find that business. Please check the link and try again.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Book with {tenant.data.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose a service to check live availability and prices — no account needed.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {SERVICES.map((s) => {
          const Icon = s.icon;
          const inner = (
            <div
              className={
                "flex h-full items-start gap-3 rounded-2xl border p-5 transition " +
                (s.ready
                  ? "border-border bg-sk-surface hover:border-sk-coral hover:shadow-md"
                  : "border-border bg-muted/40 opacity-70")
              }
            >
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-sk-coral-soft text-sk-coral">
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{s.title}</span>
                  {!s.ready && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Coming soon
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{s.blurb}</p>
              </div>
            </div>
          );
          return s.ready ? (
            <Link key={s.key} to={`/book/${s.key}${suffix}`}>{inner}</Link>
          ) : (
            <div key={s.key}>{inner}</div>
          );
        })}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Already a customer?{" "}
        <Link to="/login" className="font-semibold text-sk-coral hover:text-sk-coral-dark">
          Sign in
        </Link>{" "}
        to book from your account and track your bookings.
      </p>
    </div>
  );
}
