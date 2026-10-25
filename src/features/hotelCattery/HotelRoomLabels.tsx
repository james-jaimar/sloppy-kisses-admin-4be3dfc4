import { useHotelResources } from "./queries";
import { petRoomId } from "./roomAllocation";

export function HotelRoomLabels({ tenantId, booking }: {
  tenantId: string | null;
  booking: { resource_id: string | null; resource: { type: string } | null; pets: { id: string; name: string | null; species: string | null; resource_id?: string | null }[] };
}) {
  const rooms = useHotelResources(tenantId);
  return <span>{booking.pets.map(p => `${p.name ?? "Pet"}: ${rooms.data?.find(r => r.id === petRoomId(p, booking))?.name ?? "Unassigned"}`).join(" · ")}</span>;
}