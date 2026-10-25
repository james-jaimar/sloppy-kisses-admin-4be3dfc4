import { useCurrentUser } from "@/lib/tenant/TenantContext";
import { PetAttachments } from "@/features/uploads/PetAttachments";
import { PetVaccinationsPanel } from "@/features/pets/PetVaccinationsPanel";
import { PetHealthPanel } from "@/features/pets/PetHealthPanel";
import { PhotoWaiverQuickAction } from "@/features/pets/PhotoWaiverQuickAction";
import { VaxWaiverQuickAction } from "@/features/pets/VaxWaiverQuickAction";
import { useBookingPhotoGate } from "@/features/pets/photoGateQueries";
import { useBookingVaccinationGate, VAX_STATUS_LABEL } from "@/features/pets/vaccinationGate";

export function HotelPetChecks({ bookingId, tenantId, petId, petName, portal, species }: {
  bookingId: string; tenantId: string; petId: string; petName: string; portal: boolean; species?: string;
}) {
  const { hasPermission } = useCurrentUser();
  const photos = useBookingPhotoGate(bookingId);
  const vaccines = useBookingVaccinationGate(bookingId);
  const photo = photos.data?.find(row => row.pet_id === petId);
  const rows = vaccines.data?.filter(row => row.pet_id === petId) ?? [];
  return <div className="space-y-4 border-t border-border pt-4">
    <h3 className="font-semibold">Photos, vaccination cards & health</h3>
    <PetAttachments tenantId={tenantId} petId={petId} petName={petName} uploadedVia={portal ? "portal" : "admin"}
      photoAction={<div className="flex flex-wrap items-center justify-between gap-2 text-xs"><span>{photos.isLoading ? "Checking photo…" : photos.error ? "Could not check photo" : photo?.status === "waived" ? "Photo requirement waived" : photo?.status === "ok" ? "Photo on file" : "Photo outstanding"}</span>{!portal && hasPermission("pets.manage") && <PhotoWaiverQuickAction petId={petId} petName={petName} />}</div>}
      vaccinationAction={<div className="space-y-2 text-xs">{vaccines.isLoading ? "Checking vaccinations…" : vaccines.error ? "Could not check vaccinations" : rows.map(row => <div key={row.vaccine_type} className="flex flex-wrap justify-between gap-2"><span>{row.label || row.vaccine_type}</span><span className={row.status === "ok" || row.status === "waived" ? "text-sk-green" : "text-sk-orange"}>{VAX_STATUS_LABEL[row.status]}</span></div>)}{!portal && hasPermission("pets.manage") && <div className="flex justify-end"><VaxWaiverQuickAction petId={petId} petName={petName} /></div>}</div>}
    />
    <PetVaccinationsPanel tenantId={tenantId} petId={petId} species={species} uploadedVia={portal ? "portal" : "admin"} canManage={portal ? true : hasPermission("pets.manage_vaccinations")} />
    <PetHealthPanel tenantId={tenantId} petId={petId} readOnly={portal} />
  </div>;
}