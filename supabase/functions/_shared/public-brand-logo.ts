export function publicBrandLogoUrl(
  supabaseUrl: string,
  tenantId?: string | null,
  logoPath?: string | null,
): string | null {
  if (!tenantId || !logoPath) return null;

  try {
    const base = new URL(supabaseUrl);
    if (base.protocol !== "https:" && base.hostname !== "localhost") return null;

    const url = new URL("/functions/v1/public-brand-logo", base);
    url.searchParams.set("tenant", tenantId);
    return url.toString();
  } catch {
    return null;
  }
}