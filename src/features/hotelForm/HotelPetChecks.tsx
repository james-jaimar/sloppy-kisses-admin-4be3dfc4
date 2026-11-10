import { useCurrentUser } from "@/lib/tenant/TenantContext";
import { PetAttachments } from "@/features/uploads/PetAttachments";
import { PetVaccinationsPanel } from "@/features/pets/PetVaccinationsPanel";
import { PetHealthPanel } from "@/features/pets/PetHealthPanel";
import { PhotoWaiverQuickAction } from "@/features/pets/PhotoWaiverQuickAction";
import { useBookingPhotoGate } from "@/features/pets/photoGateQueries";

export function HotelPetChecks({ bookingId, tenantId, petId, petName, portal, species }: {
  bookingId: string; tenantId: string; petId: string; petName: string; portal: boolean; species?: string;
}) {
  const { hasPermission } = useCurrentUser();
  const photos = useBookingPhotoGate(bookingId);
  const photo = photos.data?.find(row => row.pet_id === petId);
  return <div className="space-y-4 border-t border-border pt-4">
    <h3 className="font-semibold">Vaccinations & preventative treatments</h3>
    <div id={`intake-vaccinations-${petId}`} className="scroll-mt-24 space-y-4">
    <PetAttachments tenantId={tenantId} petId={petId} petName={petName} uploadedVia={portal ? "portal" : "admin"}
      compactPhoto
      photoAction={<div className="flex flex-wrap items-center justify-between gap-2 text-xs"><span>{photos.isLoading ? "Checking photo…" : photos.error ? "Could not check photo" : photo?.status === "waived" ? "Photo requirement waived" : photo?.status === "ok" ? "Photo on file" : "Photo outstanding"}</span>{!portal && hasPermission("pets.manage") && <PhotoWaiverQuickAction petId={petId} petName={petName} />}</div>}
    />
    <PetVaccinationsPanel bookingId={bookingId} tenantId={tenantId} petId={petId} species={species} uploadedVia={portal ? "portal" : "admin"} canManage={portal ? true : hasPermission("pets.manage_vaccinations")} />
    </div>
    <div id={`intake-treatments-${petId}`} className="scroll-mt-24"><PetHealthPanel tenantId={tenantId} petId={petId} portal={portal} /></div>
  </div>;
}