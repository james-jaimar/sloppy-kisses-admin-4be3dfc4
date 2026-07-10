// Reads the current tenant's brand tokens + logo, injects them as CSS
// custom properties on :root and updates the favicon. All existing components
// use these semantic tokens, so the UI reskins automatically.
import { useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";

function hexToHsl(hex: string): string | null {
  const m = hex.replace("#", "").match(/^([\da-f]{6})$/i);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function setVar(name: string, hex: string | null | undefined) {
  if (!hex) return;
  const hsl = hexToHsl(hex);
  if (hsl) document.documentElement.style.setProperty(name, hsl);
}

async function signedUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  if (!supabase) return null;
  const { data } = await supabase.storage.from("tenant-branding").createSignedUrl(path, 60 * 60 * 24 * 7);
  return data?.signedUrl ?? null;
}

export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const { tenant } = useCurrentTenant();

  useEffect(() => {
    if (!tenant) return;
    setVar("--sk-coral", tenant.primary_colour);
    setVar("--sk-turquoise", tenant.secondary_colour);
    setVar("--sk-accent", (tenant as any).accent_colour);
    // Favicon
    (async () => {
      const fav = await signedUrl((tenant as any).favicon_url);
      if (fav) {
        let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
        if (!link) {
          link = document.createElement("link");
          link.rel = "icon";
          document.head.appendChild(link);
        }
        link.href = fav;
      }
    })();
  }, [tenant?.id, tenant?.primary_colour, tenant?.secondary_colour, (tenant as any)?.accent_colour, (tenant as any)?.favicon_url]);

  return <>{children}</>;
}

// Async helper for components that need to display the logo directly.
export async function resolveLogoUrl(path: string | null | undefined) {
  return signedUrl(path);
}