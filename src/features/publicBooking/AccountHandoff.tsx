import { Link } from "react-router-dom";
import { ArrowRight, UserCheck } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";

/** Public service key → matching booking wizard inside the customer portal. */
export const PORTAL_PATH: Record<string, string> = {
  hotel: "/customer/bookings/new/hotel",
  grooming: "/customer/bookings/new/grooming-inhouse",
  mobile: "/customer/bookings/new/grooming-mobile",
  daycare: "/customer/bookings/new/daycare",
  transport: "/customer/bookings/new/transport",
  all: "/customer/bookings/new",
};

const linkCls = "font-semibold text-sk-coral hover:text-sk-coral-dark";

/** Top-of-page bar: signed-in visitors jump to their portal; others get a sign-in link that returns them to this service. */
export function AccountBar({ service }: { service: keyof typeof PORTAL_PATH }) {
  const { authUser } = useAuth();
  const to = PORTAL_PATH[service];
  if (authUser) {
    return (
      <Link to={to} className="flex items-center justify-between gap-3 rounded-2xl border border-sk-turquoise/40 bg-sk-turquoise/5 p-4 text-sm hover:border-sk-turquoise">
        <span className="flex items-center gap-2"><UserCheck className="h-4 w-4 text-sk-turquoise" /> You're signed in — book from your account so your pets and details are filled in.</span>
        <ArrowRight className="h-4 w-4 shrink-0" />
      </Link>
    );
  }
  return (
    <p className="rounded-2xl border border-border bg-sk-surface px-4 py-3 text-xs text-muted-foreground">
      Already a customer? <Link to="/login" state={{ from: to }} className={linkCls}>Sign in</Link> and we'll take you straight to this booking with your pets ready to pick.
    </p>
  );
}

/** Shown after a public request: neutral wording so it never reveals whether the email already has an account. */
export function DoneHandoff({ contact, tenantSlug }: {
  contact: { first_name: string; last_name: string; email: string; mobile: string };
  tenantSlug?: string | null;
}) {
  const { authUser } = useAuth();
  if (authUser) {
    return <p className="text-xs text-muted-foreground"><Link to="/customer/bookings" className={linkCls}>Go to my bookings</Link></p>;
  }
  const q = new URLSearchParams({
    email: contact.email, first: contact.first_name, last: contact.last_name, mobile: contact.mobile,
    ...(tenantSlug ? { tenant: tenantSlug } : {}),
  });
  return (
    <div className="space-y-2 border-t border-border pt-4 text-xs text-muted-foreground">
      <p>Want to track this request, upload vaccination cards and book faster next time?</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Link to={`/customer/signup?${q.toString()}`} className="inline-flex h-9 items-center rounded-xl bg-sk-coral px-4 text-xs font-semibold text-primary-foreground hover:bg-sk-coral-dark">Set up my account</Link>
        <Link to="/login" state={{ from: "/customer/bookings" }} className="inline-flex h-9 items-center rounded-xl border border-border px-4 text-xs font-semibold hover:bg-muted">I already have one — sign in</Link>
      </div>
    </div>
  );
}
