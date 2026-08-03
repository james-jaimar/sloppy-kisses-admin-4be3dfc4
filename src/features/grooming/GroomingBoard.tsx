import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useGroomingPackages } from "@/features/settings/groomingRateCardQueries";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import { GroomingCard } from "./GroomingCard";
import {
  GROOMING_COLUMNS,
  columnForStatus,
  useGroomingBoardBookings,
  useUpdateGroomingStatus,
  checkVaccinations,
  logVaccinationOverride,
  type GroomingBoardCard,
  type GroomingColumn,
} from "./queries";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { PaymentFlagsProvider } from "@/features/shared/payments/paymentFlags";
import { useStayPlayForBookings } from "@/features/daycare/stayPlayQueries";

export function GroomingBoard({ day }: { day: Date }) {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const confirm = useConfirm();

  const bookingsQ = useGroomingBoardBookings({ tenantId, day });
  const packagesQ = useGroomingPackages(tenantId, { activeOnly: true });
  const updateStatus = useUpdateGroomingStatus(tenantId ?? "");
  const bookingIds = useMemo(() => (bookingsQ.data ?? []).map((c) => c.id), [bookingsQ.data]);
  const stayPlayQ = useStayPlayForBookings(tenantId, bookingIds);

  const [dragId, setDragId] = useState<string | null>(null);
  const [hoverCol, setHoverCol] = useState<GroomingColumn | null>(null);

  const packagesById = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of packagesQ.data ?? []) m.set(p.id, p.expected_minutes);
    return m;
  }, [packagesQ.data]);

  const cardsByColumn = useMemo(() => {
    const map: Record<GroomingColumn, GroomingBoardCard[]> = {
      booked: [], checked_in: [], grooming: [], ready: [],
    };
    for (const c of bookingsQ.data ?? []) {
      const col = columnForStatus(c.status);
      if (col) map[col].push(c);
    }
    return map;
  }, [bookingsQ.data]);

  async function moveCard(card: GroomingBoardCard, toCol: GroomingColumn) {
    const target = GROOMING_COLUMNS.find((c) => c.key === toCol)!;
    if (columnForStatus(card.status) === toCol) return;

    // Soft vaccination gate on Check-in
    if (toCol === "checked_in" && card.pets.length) {
      const check = await checkVaccinations(card.pets.map((p) => p.id));
      if (!check.ok) {
        const parts: string[] = [];
        if (check.missing.length) parts.push(`Missing: ${check.missing.join(", ")}`);
        if (check.expired.length) parts.push(`Expired: ${check.expired.join(", ")}`);
        if (!(await confirm({ title: "Vaccinations not up to date", description: `${parts.join(" · ")}. Continue and log override?`, confirmLabel: "Continue & override" }))) return;
        try {
          await logVaccinationOverride({
            tenantId: tenantId!,
            bookingId: card.id,
            note: `Override at check-in. ${parts.join(" · ")}`,
          });
        } catch (err: any) {
          toast.error(err?.message ?? "Failed to log override");
        }
      }
    }

    try {
      await updateStatus.mutateAsync({ bookingId: card.id, status: target.targetStatus });
      toast.success(`Moved to ${target.label}`);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to update status");
    }
  }

  return (
    <PaymentFlagsProvider bookingIds={(bookingsQ.data ?? []).map((c) => c.id)}>
    <div className="grid gap-4 lg:grid-cols-4">
      {GROOMING_COLUMNS.map((col) => {
        const cards = cardsByColumn[col.key];
        const isHover = hoverCol === col.key;
        return (
          <div
            key={col.key}
            className={
              "flex min-h-[60vh] flex-col rounded-2xl border bg-sk-surface-muted/60 p-3 transition-colors " +
              (isHover ? "border-sk-coral bg-sk-coral-soft/40" : "border-border")
            }
            onDragOver={(e) => { e.preventDefault(); setHoverCol(col.key); }}
            onDragLeave={() => setHoverCol((c) => (c === col.key ? null : c))}
            onDrop={(e) => {
              e.preventDefault();
              setHoverCol(null);
              const id = e.dataTransfer.getData("text/plain") || dragId;
              const card = (bookingsQ.data ?? []).find((c) => c.id === id);
              setDragId(null);
              if (card) moveCard(card, col.key);
            }}
          >
            <div className="mb-3 flex items-center justify-between px-1">
              <div className="text-sm font-semibold">{col.label}</div>
              <div className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {cards.length}
              </div>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto pr-1">
              {bookingsQ.isLoading && (
                <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                  Loading…
                </div>
              )}
              {!bookingsQ.isLoading && cards.length === 0 && (
                <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                  Drop bookings here
                </div>
              )}
              {cards.map((c) => (
                <GroomingCard
                  key={c.id}
                  card={c}
                  expectedMinutes={c.details?.package_id ? (packagesById.get(c.details.package_id) ?? null) : null}
                  stayPlay={Boolean(stayPlayQ.data?.[c.id]?.length)}
                  draggable
                  onDragStart={(e) => {
                    setDragId(c.id);
                    e.dataTransfer.setData("text/plain", c.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
    </PaymentFlagsProvider>
  );
}