import { useState } from "react";
import { Camera } from "lucide-react";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import { usePetPhotos } from "./petPhotoQueries";
import { PetPhotoDialog } from "./PetPhotoDialog";

const SIZES = {
  xs: "h-8 w-8 text-[10px]",
  sm: "h-10 w-10 text-xs",
  md: "h-12 w-12 text-sm",
  lg: "h-20 w-20 text-lg",
  xl: "h-28 w-28 text-2xl",
} as const;

export type PetAvatarSize = keyof typeof SIZES;

function initials(name: string | null | undefined) {
  const n = (name ?? "").trim();
  if (!n) return "?";
  const parts = n.split(/\s+/);
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

/**
 * The pet's picture. Tap it (when `editable`) to take a fresh one — camera on
 * phones, QR handover on desktop.
 *
 * Pass `photoUrl` in lists (fetch once with `usePetPhotos`); omit it on single-pet
 * screens and the avatar looks the photo up itself.
 */
export function PetAvatar({
  petId,
  petName,
  photoUrl,
  size = "sm",
  editable = false,
  className = "",
  onUpdated,
}: {
  petId: string | null | undefined;
  petName: string | null | undefined;
  photoUrl?: string | null;
  size?: PetAvatarSize;
  editable?: boolean;
  className?: string;
  onUpdated?: () => void;
}) {
  const { tenant } = useCurrentTenant();
  const [open, setOpen] = useState(false);
  const selfFetch = photoUrl === undefined && Boolean(petId);
  const self = usePetPhotos(selfFetch ? [petId!] : []);
  const url = photoUrl !== undefined ? photoUrl : (petId ? self.data?.[petId]?.url ?? null : null);
  const canEdit = editable && Boolean(petId) && Boolean(tenant?.id);

  const body = (
    <>
      {url ? (
        <img src={url} alt={petName ? `Photo of ${petName}` : "Pet photo"}
          className="h-full w-full rounded-full object-cover" loading="lazy" />
      ) : (
        <span className="font-bold text-sk-turquoise-dark">{initials(petName)}</span>
      )}
      {canEdit && (
        <span className="absolute -bottom-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full border border-white bg-sk-coral text-white">
          <Camera className="h-3 w-3" />
        </span>
      )}
    </>
  );

  const base = `relative grid shrink-0 place-items-center overflow-visible rounded-full bg-sk-turquoise-soft ${SIZES[size]} ${className}`;

  if (!canEdit) return <span className={base}>{body}</span>;

  return (
    <>
      <button
        type="button"
        aria-label={`Take a photo of ${petName ?? "this pet"}`}
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen(true); }}
        className={`${base} transition hover:ring-2 hover:ring-sk-coral`}
      >
        {body}
      </button>
      {open && (
        <PetPhotoDialog
          open={open}
          onOpenChange={setOpen}
          tenantId={tenant!.id}
          petId={petId!}
          petName={petName ?? "this pet"}
          onDone={onUpdated}
        />
      )}
    </>
  );
}
