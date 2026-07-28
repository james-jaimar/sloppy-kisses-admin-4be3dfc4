import type { GroomingSizeBand } from "@/features/settings/groomingRateCardQueries";

export type PetSize = "xsmall" | "small" | "medium" | "large" | "xlarge" | "xxlarge";

/** Map the pet size enum onto the 5 grooming size bands used by rate cards. */
export function petSizeToBand(size: string | null | undefined): GroomingSizeBand | null {
  switch (size) {
    case "xsmall":
    case "small":
      return "small";
    case "medium":
      return "medium";
    case "large":
      return "large";
    case "xlarge":
      return "xl";
    case "xxlarge":
      return "xxl";
    default:
      return null;
  }
}

export const PET_SIZE_LABEL: Record<PetSize, string> = {
  xsmall: "X-Small",
  small: "Small",
  medium: "Medium",
  large: "Large",
  xlarge: "X-Large",
  xxlarge: "XX-Large",
};

/** Read the effective grooming size from a pet row, honouring staff override. */
export function effectivePetSize(pet: { size?: string | null; size_override?: string | null } | null | undefined): PetSize | null {
  if (!pet) return null;
  return (pet.size_override as PetSize) || (pet.size as PetSize) || null;
}

export function hasSizeOverride(pet: { size_override?: string | null } | null | undefined): boolean {
  return Boolean(pet?.size_override);
}