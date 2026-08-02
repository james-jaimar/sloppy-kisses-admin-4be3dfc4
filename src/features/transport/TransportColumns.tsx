import { ArrowRight, ArrowLeft } from "lucide-react";
import type { TransportLeg } from "./queries";
import { TransportCard } from "./TransportCard";
import { PaymentFlagsProvider } from "@/features/shared/payments/paymentFlags";

function isPickup(leg: TransportLeg): boolean {
  const d = leg.details?.direction;
  return d === "pickup" || d === "round_trip" || d == null; // default unknown → pickup lane
}
function isDropoff(leg: TransportLeg): boolean {
  const d = leg.details?.direction;
  return d === "dropoff" || d === "round_trip";
}

export function TransportColumns({ legs }: { legs: TransportLeg[] }) {
  const pickups = legs.filter(isPickup);
  const dropoffs = legs.filter(isDropoff);
  return (
    <PaymentFlagsProvider bookingIds={legs.map((l) => l.id)}>
    <div className="grid gap-4 md:grid-cols-2">
      <Column title="Pickups" count={pickups.length} icon={<ArrowRight className="h-4 w-4" />}>
        {pickups.length === 0 ? (
          <Empty>No pickups scheduled.</Empty>
        ) : (
          pickups.map((l) => <TransportCard key={`p-${l.id}`} leg={l} />)
        )}
      </Column>
      <Column title="Drop-offs" count={dropoffs.length} icon={<ArrowLeft className="h-4 w-4" />}>
        {dropoffs.length === 0 ? (
          <Empty>No drop-offs scheduled.</Empty>
        ) : (
          dropoffs.map((l) => <TransportCard key={`d-${l.id}`} leg={l} />)
        )}
      </Column>
    </div>
    </PaymentFlagsProvider>
  );
}

function Column({ title, count, icon, children }: { title: string; count: number; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-sk-surface-muted/50 p-3">
      <div className="mb-3 flex items-center gap-2 px-1 text-sm font-semibold">
        {icon}
        {title}
        <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-muted-foreground">{count}</span>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">{children}</div>;
}