export function hotelResourceType(species: string | null | undefined) {
  return species === "cat" ? "cattery_area" : "hotel_area";
}

export function petRoomId(
  pet: { species: string | null; resource_id?: string | null },
  booking: { resource_id: string | null; resource: { type: string } | null },
) {
  if (pet.resource_id) return pet.resource_id;
  return booking.resource?.type === hotelResourceType(pet.species) ? booking.resource_id : null;
}

export function petsInRoom<T extends { species: string | null; resource_id?: string | null }>(
  pets: T[], booking: { resource_id: string | null; resource: { type: string } | null }, roomId: string | null,
) {
  return pets.filter(p => petRoomId(p, booking) === roomId);
}