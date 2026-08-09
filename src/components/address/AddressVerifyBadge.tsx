import { BadgeCheck, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useVerifyAddress } from "@/features/customers/addressSync";

interface Props {
  addressId: string;
  verified: boolean;
  tenantId?: string | null;
  customerId?: string | null;
  /** Staff can trigger a Google lookup; customers only see the status. */
  allowVerify?: boolean;
}

export default function AddressVerifyBadge({ addressId, verified, tenantId, customerId, allowVerify = true }: Props) {
  const verify = useVerifyAddress(tenantId, customerId);

  if (verified)
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-green-50 px-2 py-0.5 text-[10px] font-medium uppercase text-green-700">
        <BadgeCheck className="h-3 w-3" /> Verified
      </span>
    );

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-medium uppercase text-amber-700">
        <AlertTriangle className="h-3 w-3" /> Unverified address
      </span>
      {allowVerify && (
        <button
          type="button"
          disabled={verify.isPending}
          onClick={async () => {
            try {
              await verify.mutateAsync(addressId);
              toast.success("Address verified with Google");
            } catch (e: any) {
              toast.error(e?.message ?? "Could not verify this address");
            }
          }}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[10px] font-semibold hover:bg-muted disabled:opacity-50"
        >
          {verify.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
          Verify with Google
        </button>
      )}
    </span>
  );
}