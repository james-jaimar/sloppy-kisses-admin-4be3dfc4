import { Link, useSearchParams } from "react-router-dom";
import { BedDouble, Scissors, Car, Sun, Truck, Loader2, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AwardPlaceholder, BookingPhotos } from "./BookingPhotos";
import { usePublicTenant } from "./publicBookingQueries";

const SERVICES = [
  {
    key: "hotel",
    icon: BedDouble,
    title: "Dog & Cat Hotel",
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
      <BookingPhotos title={tenant.data.name} subtitle="A stay, a play day, or a fresh new look. Find the right care for your pet." />
      <AwardPlaceholder />
      <div className="flex flex-wrap items-end justify-between gap-2"><h2 className="text-xl font-bold">What are we booking?</h2><span className="text-xs text-muted-foreground">No account needed · Requests confirmed by our team</span></div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SERVICES.map((s) => {
          const Icon = s.icon;
          const inner = (
            <div
              className={
                "flex h-full min-h-40 items-start gap-3 rounded-lg border p-5 transition " +
                (s.ready
                  ? "border-border bg-sk-surface hover:border-sk-coral"
                  : "border-border bg-muted/40 opacity-70")
              }
            >
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-sk-coral-soft text-sk-coral">
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
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.blurb}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary">Choose service <ArrowUpRight className="h-3.5 w-3.5" /></span>
              </div>
            </div>
          );
          return s.ready ? (
            <Button asChild key={s.key} variant="ghost" className="h-auto whitespace-normal p-0 text-left font-normal hover:bg-transparent"><Link to={`/book/${s.key}${suffix}`}>{inner}</Link></Button>
          ) : (
            <div key={s.key}>{inner}</div>
          );
        })}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Already a customer?{" "}
        <Link to="/login" state={{ from: "/customer/bookings/new" }} className="font-semibold text-sk-coral hover:text-sk-coral-dark">
          Sign in
        </Link>{" "}
        to book from your account and track your bookings.
      </p>
    </div>
  );
}
