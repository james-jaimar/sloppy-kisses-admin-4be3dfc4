import { useState } from "react";
import { toast } from "sonner";
import { Syringe } from "lucide-react";
import { HealthGateBanner } from "@/features/pets/HealthGateBanner";
import {
  useChargeArrivalTreatment,
  useParasiteRules,
  usePetHealthGate,
} from "@/features/pets/healthQueries";
import { useCurrentTenant, useCurrentUser } from "@/lib/tenant/TenantContext";

/**
 * Arrival gate for one booking: shows each pet's parasite / hold status and lets staff
 * apply a chargeable treatment on arrival when proof is missing.
 */
export function ArrivalHealthGate({
  bookingId,
  pets,
  onDate,
}: {
  bookingId: string;
  pets: Array<{ id: string; name?: string | null }>;
  onDate?: string;
}) {
  const { tenant } = useCurrentTenant();
  const { hasPermission } = useCurrentUser();
  const canManage = hasPermission("pets.manage");
  const rulesQ = useParasiteRules(tenant?.id ?? null, { activeOnly: true });
  const chargeable = (rulesQ.data ?? []).filter((r) => r.chargeable_on_arrival);

  if (pets.length === 0) return null;

  return (
    <section className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Health gate</div>
      {pets.map((p) => (
        <div key={p.id} className="space-y-1.5">
          <HealthGateBanner petId={p.id} petName={pets.length > 1 ? p.name : null} onDate={onDate} showWhenClear />
          {canManage &&
            chargeable.map((rule) => (
              <ApplyTreatmentButton
                key={rule.kind}
                bookingId={bookingId}
                petId={p.id}
                petName={p.name}
                kind={rule.kind}
                label={rule.label}
                onDate={onDate}
              />
            ))}
        </div>
      ))}
    </section>
  );
}

function ApplyTreatmentButton({
  bookingId, petId, petName, kind, label, onDate,
}: {
  bookingId: string;
  petId: string;
  petName?: string | null;
  kind: string;
  label: string;
  onDate?: string;
}) {
  const gateQ = usePetHealthGate(petId, onDate);
  const charge = useChargeArrivalTreatment();
  const [product, setProduct] = useState("");

  const row = (gateQ.data?.treatments ?? []).find((t) => t.kind === kind);
  if (!row || (row.status !== "missing" && row.status !== "overdue")) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs">
      <Syringe className="h-3.5 w-3.5 text-muted-foreground" />
      <span>
        No proof of {label.toLowerCase()}
        {petName ? ` for ${petName}` : ""}. Apply it on arrival and charge it to this booking?
      </span>
      <input
        value={product}
        onChange={(e) => setProduct(e.target.value)}
        placeholder="Product used"
        className="h-8 w-36 rounded border border-border bg-white px-2"
      />
      <button
        disabled={charge.isPending}
        onClick={async () => {
          try {
            const res = await charge.mutateAsync({ bookingId, petId, kind, product: product || null });
            toast.success(
              res?.charged ? `Treatment applied and R${Number(res.charged).toFixed(2)} added to the invoice` : "Treatment recorded",
            );
            setProduct("");
          } catch (e: any) {
            toast.error(e?.message ?? "Could not apply treatment");
          }
        }}
        className="rounded-lg bg-sk-coral px-2.5 py-1.5 font-semibold text-white hover:opacity-90 disabled:opacity-60"
      >
        {charge.isPending ? "Applying…" : "Apply & charge"}
      </button>
    </div>
  );
}