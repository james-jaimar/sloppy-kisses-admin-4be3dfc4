import { useHotelResources } from "./queries";
import { hotelResourceType } from "./roomAllocation";
import { HotelCapacityNotice, type CapacityIssue } from "./HotelCapacityNotice";

export function HotelPetRooms({ tenantId, pets, assignments, onChange, startAt, endAt, bookingId, onIssueChange }: {
  tenantId: string;
  pets: { id: string; name: string | null; species: string | null }[];
  assignments: Record<string, string>;
  onChange: (petId: string, roomId: string) => void;
  startAt: string | null;
  endAt: string | null;
  bookingId: string | null;
  onIssueChange: (roomId: string, issue: CapacityIssue | null) => void;
}) {
  const rooms = useHotelResources(tenantId);
  const selected = [...new Set(pets.map(p => assignments[p.id]).filter(Boolean))];
  return <section className="space-y-3">
    <h3 className="text-sm font-semibold">Rooms per pet</h3>
    {pets.map(p => <label key={p.id} className="grid gap-1 text-sm">
      <span>{p.name} · {p.species === "cat" ? "Cat Hotel" : "Dog Hotel"}</span>
      <select className="h-10 w-full rounded-md border border-border bg-background px-3" value={assignments[p.id] ?? ""} onChange={e => onChange(p.id, e.target.value)}>
        <option value="">Auto-assign an available area</option>
        {(rooms.data ?? []).filter(r => r.type === hotelResourceType(p.species)).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select>
    </label>)}
    {selected.map(roomId => <HotelCapacityNotice key={roomId} tenantId={tenantId} resourceId={roomId} startAt={startAt} endAt={endAt} petCount={pets.filter(p => assignments[p.id] === roomId).length} excludeBookingId={bookingId} onIssueChange={issue => onIssueChange(roomId, issue)} />)}
  </section>;
}