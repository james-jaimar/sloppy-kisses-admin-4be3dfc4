// Resolves the URL used for the tenant logo *inside emails*.
//
// Why not a signed Storage URL or a CID attachment?
//   * Signed Storage URLs expire and carry a long query string; Outlook's
//     Word rendering engine frequently refuses them ("The linked image cannot
//     be displayed").
//   * CID inline images cannot be produced correctly by denomailer 1.6.0 — it
//     always writes `Content-Disposition: attachment` and a flat
//     multipart/mixed body, so Outlook shows the logo as an attachment.
//
// Email best practice is a plain, permanent, extension-terminated HTTPS URL on
// a normal web host. Preference order:
//   1. tenant.logo_url when it is already an absolute https URL
//   2. the tenant's own app domain: <app_url>/brand/logo.png  (static file)
//   3. the public-brand-logo edge function (works for any tenant)
export function publicBrandLogoUrl(
  supabaseUrl: string,
  tenantId?: string | null,
  logoPath?: string | null,
  appUrl?: string | null,
): string | null {
  if (logoPath && /^https:\/\//i.test(logoPath)) return logoPath;
  if (!tenantId || !logoPath) return null;

  const app = (appUrl ?? "").trim().replace(/\/+$/, "");
  if (/^https:\/\//i.test(app)) return `${app}/brand/logo.png`;

  try {
    const base = new URL(supabaseUrl);
    if (base.protocol !== "https:" && base.hostname !== "localhost") return null;
    // Path-style so the URL ends in .png — Outlook is far happier with that
    // than with a query-string-only image URL.
    return new URL(`/functions/v1/public-brand-logo/${tenantId}/logo.png`, base).toString();
  } catch {
    return null;
  }
}
