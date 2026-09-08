import { useState } from "react";
import { Camera } from "lucide-react";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import { PetPhotoDialog } from "./PetPhotoDialog";

/** Plain "Take photo" button for toolbars and detail screens. */
export function PetPhotoButton({
  petId,
  petName,
  label = "Take photo",
  className,
  onUpdated,
}: {
  petId: string;
  petName: string | null | undefined;
  label?: string;
  className?: string;
  onUpdated?: () => void;
}) {
  const { tenant } = useCurrentTenant();
  const [open, setOpen] = useState(false);
  if (!tenant?.id) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          "inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted"
        }
      >
        <Camera className="h-3.5 w-3.5" />
        {label}
      </button>
      {open && (
        <PetPhotoDialog
          open={open}
          onOpenChange={setOpen}
          tenantId={tenant.id}
          petId={petId}
          petName={petName ?? "this pet"}
          onDone={onUpdated}
        />
      )}
    </>
  );
}
