export interface StayRate {
  species: string;
  accommodation_type: string;
  min_size_band?: string | null;
  max_size_band?: string | null;
}

const sizes = ["xsmall", "small", "medium", "large", "xlarge", "xxlarge"];
export function accommodationForPet(pet: { species: string | null; size?: string | null }, rates: StayRate[], preferred?: string | null) {
  const compatible = rates.filter(r => r.species === pet.species && (!r.min_size_band && !r.max_size_band || Boolean(pet.size) &&
    sizes.indexOf(pet.size ?? "") >= (r.min_size_band ? sizes.indexOf(r.min_size_band) : 0) &&
    sizes.indexOf(pet.size ?? "") <= (r.max_size_band ? sizes.indexOf(r.max_size_band) : sizes.length - 1)));
  return compatible.find(r => r.accommodation_type === preferred)?.accommodation_type ?? compatible[0]?.accommodation_type ?? "";
}

export function rescaleHotelExtras<T extends { surcharge_id: string; quantity: number }>(
  selection: T[], catalog: { id: string; code: string }[], before: { pets: number; dogs: number }, after: { pets: number; dogs: number },
) {
  return selection.flatMap(row => {
    const rate = catalog.find(r => r.id === row.surcharge_id);
    if (!rate) return [row];
    const walk = /walk/i.test(rate.code);
    const oldCount = walk ? before.dogs : before.pets;
    const newCount = walk ? after.dogs : after.pets;
    if (!newCount) return [];
    if (!oldCount || oldCount === newCount) return [row];
    return [{ ...row, quantity: Math.max(1, Math.round(row.quantity * newCount / oldCount)) }];
  });
}