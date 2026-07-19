import { Link } from "react-router-dom";
import { ArrowLeft, Hotel, Dog, Scissors, Truck, ArrowLeftRight, ChevronRight } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";

const SERVICES = [
  { to: "hotel", label: "Hotel & Cattery", desc: "Overnight stays for your dog or cat", icon: Hotel, tone: "text-sk-turquoise-dark bg-sk-turquoise-soft" },
  { to: "daycare", label: "Daycare", desc: "A day of play, socialising & snoozing", icon: Dog, tone: "text-sk-coral-dark bg-sk-coral-soft" },
  { to: "grooming-inhouse", label: "Grooming (in-house)", desc: "Book a spa day at the salon", icon: Scissors, tone: "text-sk-green bg-sk-green-soft" },
  { to: "grooming-mobile", label: "Grooming (mobile)", desc: "We bring the van to your door", icon: Truck, tone: "text-sk-orange bg-sk-orange-soft" },
  { to: "transport", label: "Pick up / Drop off", desc: "Add or standalone transport", icon: ArrowLeftRight, tone: "text-sk-turquoise-dark bg-sk-turquoise-soft" },
];

export default function ServicePickerPage() {
  return (
    <>
      <AppHeader title="What would you like to book?" subtitle="Pick a service to get started" />
      <div className="flex-1 space-y-4 p-4 md:p-6">
        <Link to="/customer/bookings" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to bookings
        </Link>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {SERVICES.map((s) => {
            const Icon = s.icon;
            return (
              <Link
                key={s.to}
                to={`/customer/bookings/new/${s.to}`}
                className="sk-card flex items-center gap-4 p-5 transition hover:border-sk-coral hover:shadow-md"
              >
                <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${s.tone}`}>
                  <Icon className="h-6 w-6" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-base font-semibold">{s.label}</div>
                  <div className="text-xs text-muted-foreground">{s.desc}</div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </Link>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">All requests are reviewed by our team — you'll get a confirmation once we've slotted you in.</p>
      </div>
    </>
  );
}