/** Cats always travel in a secure carrier; a mixed load also needs them kept apart from dogs. */
export function carrierNotice(pets: { species: string | null }[]): "mixed" | "cat" | null {
  const cats = pets.some(p => p.species === "cat");
  if (!cats) return null;
  return pets.some(p => p.species === "dog") ? "mixed" : "cat";
}

export const CARRIER_LABEL = {
  cat: "Cat — secure carrier",
  mixed: "Mixed load — cats in secure carriers, apart from dogs",
} as const;
