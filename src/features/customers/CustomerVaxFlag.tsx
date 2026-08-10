import { Link } from "react-router-dom";
import { Syringe } from "lucide-react";
import { useVaxOutstanding } from "@/features/pets/vaccinationGate";

/** Admin banner: which of this customer's pets still owe vaccination paperwork. */
export function CustomerVaxFlag({ tenantId, customerId }: { tenantId?: string | null; customerId: string }) {
  const q = useVaxOutstanding(tenantId, customerId);
  const rows = (q.data ?? []).filter((r) => r.outstanding > 0);
  if (rows.length === 0) return null;
  return (
    <div className="sk-card flex items-start gap-3 border-sk-orange bg-sk-orange-soft/50 p-4 text-sm text-sk-orange">
      <Syringe className="mt-0.5 h-4 w-4 flex-none" />
      <div className="min-w-0">
        <div className="font-semibold">Vaccination paperwork outstanding</div>
        <div className="mt-1 flex flex-wrap gap-2 text-xs">
          {rows.map((r) => (
            <Link
              key={r.pet_id}
              to={`/admin/pets/${r.pet_id}`}
              className="rounded-full bg-white px-2.5 py-1 font-semibold hover:bg-sk-orange-soft"
            >
              {r.pet_name} — {r.outstanding} outstanding
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}