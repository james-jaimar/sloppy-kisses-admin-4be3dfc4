import { AlertTriangle, Pin } from "lucide-react";
import { useCustomerPinnedNotes } from "./notesQueries";

/**
 * Surface pinned staff notes for a customer. Alert-flagged notes render red,
 * regular pinned notes render amber. Used on CustomerDetail, PetDetail, and
 * BookingDetail so staff can't miss "aggressive dog" / "always pays late" etc.
 */
export function PinnedNotesBanner({
  customerId,
  tenantId,
  className,
}: {
  customerId: string | null | undefined;
  tenantId: string | null | undefined;
  className?: string;
}) {
  const { data } = useCustomerPinnedNotes(customerId, tenantId);
  if (!data || data.length === 0) return null;
  return (
    <div className={"flex flex-col gap-2 " + (className ?? "")}>
      {data.map((n) => {
        const isAlert = n.alert;
        const border = isAlert ? "border-sk-coral/40" : "border-amber-400/50";
        const bg = isAlert ? "bg-sk-coral/10" : "bg-amber-50";
        const text = isAlert ? "text-sk-coral-dark" : "text-amber-900";
        return (
          <div
            key={n.id}
            className={`flex items-start gap-2.5 rounded-xl border ${border} ${bg} px-3 py-2.5 text-sm ${text}`}
          >
            {isAlert ? (
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            ) : (
              <Pin className="mt-0.5 h-4 w-4 flex-shrink-0" />
            )}
            <div className="min-w-0 flex-1 whitespace-pre-wrap break-words">{n.body}</div>
          </div>
        );
      })}
    </div>
  );
}