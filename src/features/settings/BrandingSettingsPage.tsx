import { useEffect, useRef, useState } from "react";
import { Save, Upload, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant, useCurrentUser } from "@/lib/tenant/TenantContext";
import { supabase } from "@/lib/supabase/client";
import { resolveLogoUrl } from "@/lib/branding/BrandingProvider";

const PERMISSION = "settings.branding.manage";
const DEFAULTS = { primary: "#FF5A5A", secondary: "#25B7BA", accent: "#FFA750" };

export default function BrandingSettingsPage() {
  const { tenant } = useCurrentTenant();
  const { hasPermission, refresh } = useCurrentUser();
  const canManage = hasPermission(PERMISSION);

  const [form, setForm] = useState({
    primary_colour: DEFAULTS.primary,
    secondary_colour: DEFAULTS.secondary,
    accent_colour: DEFAULTS.accent,
    logo_url: null as string | null,
    favicon_url: null as string | null,
    app_url: "" as string,
  });
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [faviconPreview, setFaviconPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const logoInput = useRef<HTMLInputElement>(null);
  const favInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!tenant) return;
    setForm({
      primary_colour: tenant.primary_colour ?? DEFAULTS.primary,
      secondary_colour: tenant.secondary_colour ?? DEFAULTS.secondary,
      accent_colour: (tenant as any).accent_colour ?? DEFAULTS.accent,
      logo_url: tenant.logo_url,
      favicon_url: (tenant as any).favicon_url ?? null,
      app_url: (tenant as any).app_url ?? "",
    });
    resolveLogoUrl(tenant.logo_url).then(setLogoPreview);
    resolveLogoUrl((tenant as any).favicon_url).then(setFaviconPreview);
  }, [tenant?.id]);

  async function uploadFile(kind: "logo" | "favicon", file: File) {
    if (!tenant || !supabase) return;
    const ext = file.name.split(".").pop() || "png";
    const path = `${tenant.id}/${kind}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("tenant-branding").upload(path, file, {
      cacheControl: "3600", upsert: true,
    });
    if (error) { toast.error(error.message); return; }
    if (kind === "logo") {
      setForm((f) => ({ ...f, logo_url: path }));
      setLogoPreview(await resolveLogoUrl(path));
    } else {
      setForm((f) => ({ ...f, favicon_url: path }));
      setFaviconPreview(await resolveLogoUrl(path));
    }
  }

  async function save() {
    if (!tenant || !supabase) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("tenants").update({
        primary_colour: form.primary_colour,
        secondary_colour: form.secondary_colour,
        accent_colour: form.accent_colour,
        logo_url: form.logo_url,
        favicon_url: form.favicon_url,
        app_url: form.app_url ? form.app_url.trim().replace(/\/+$/, "") : null,
      } as any).eq("id", tenant.id);
      if (error) throw error;
      toast.success("Branding saved");
      // Bust the tenant cache so BrandingProvider re-reads.
      try { window.sessionStorage.removeItem("sk.currentUserCache.v2"); } catch {}
      await refresh();
    } catch (e: any) { toast.error(e?.message ?? "Failed to save"); }
    finally { setSaving(false); }
  }

  function resetDefaults() {
    setForm((f) => ({ ...f, primary_colour: DEFAULTS.primary, secondary_colour: DEFAULTS.secondary, accent_colour: DEFAULTS.accent }));
  }

  return (
    <>
      <AppHeader title="Branding" subtitle="Logo, favicon and colour scheme." />
      <div className="flex-1 p-6">
        <div className="sk-card max-w-3xl p-6 space-y-6">
          {!canManage && (
            <div className="rounded-lg border border-sk-orange bg-sk-orange-soft px-3 py-2 text-xs text-sk-orange">
              Read-only. You need the "Manage branding" permission to change settings.
            </div>
          )}

          <Section title="Logo">
            <div className="flex items-center gap-6">
              <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-xl border border-border bg-white">
                {logoPreview ? <img src={logoPreview} alt="Logo" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-muted-foreground">No logo</span>}
              </div>
              <div className="space-y-2">
                <input ref={logoInput} type="file" accept="image/png,image/jpeg,image/svg+xml" className="hidden"
                  onChange={(e) => e.target.files?.[0] && uploadFile("logo", e.target.files[0])} />
                <button disabled={!canManage} onClick={() => logoInput.current?.click()}
                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm hover:bg-muted">
                  <Upload className="h-4 w-4" /> Upload logo
                </button>
                <div className="text-xs text-muted-foreground">PNG, JPG or SVG · square or wide, up to ~2 MB.</div>
              </div>
            </div>
          </Section>

          <Section title="Favicon">
            <div className="flex items-center gap-6">
              <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-lg border border-border bg-white">
                {faviconPreview ? <img src={faviconPreview} alt="Favicon" className="max-h-full max-w-full object-contain" /> : <span className="text-[10px] text-muted-foreground">None</span>}
              </div>
              <div className="space-y-2">
                <input ref={favInput} type="file" accept="image/png,image/svg+xml,image/x-icon" className="hidden"
                  onChange={(e) => e.target.files?.[0] && uploadFile("favicon", e.target.files[0])} />
                <button disabled={!canManage} onClick={() => favInput.current?.click()}
                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm hover:bg-muted">
                  <Upload className="h-4 w-4" /> Upload favicon
                </button>
                <div className="text-xs text-muted-foreground">Ideally 32×32 or 64×64 PNG.</div>
              </div>
            </div>
          </Section>

          <Section title="Colours">
            <div className="grid gap-4 sm:grid-cols-3">
              <ColourField label="Primary" value={form.primary_colour} disabled={!canManage}
                onChange={(v) => setForm({ ...form, primary_colour: v })} />
              <ColourField label="Secondary" value={form.secondary_colour} disabled={!canManage}
                onChange={(v) => setForm({ ...form, secondary_colour: v })} />
              <ColourField label="Accent" value={form.accent_colour} disabled={!canManage}
                onChange={(v) => setForm({ ...form, accent_colour: v })} />
            </div>
            <button disabled={!canManage} onClick={resetDefaults}
              className="mt-3 inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
              <RotateCcw className="h-3.5 w-3.5" /> Reset to Sloppy Kisses defaults
            </button>
          </Section>

          <Section title="Public app URL">
            <div className="space-y-2">
              <input
                disabled={!canManage}
                value={form.app_url}
                onChange={(e) => setForm({ ...form, app_url: e.target.value })}
                placeholder="https://document-centre.com"
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Used in invite and password-reset emails so links stay on your own domain instead of exposing Supabase or the Lovable preview URL. Include the scheme (https://) and no trailing slash. Make sure this exact URL is also listed in your Supabase project's Auth → URL Configuration allow-list.
              </p>
            </div>
          </Section>

          <div className="flex justify-end">
            <button disabled={!canManage || saving} onClick={save}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-sk-coral px-4 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-50">
              <Save className="h-4 w-4" /> Save branding
            </button>
          </div>
          <p className="text-xs text-muted-foreground">Changes apply immediately after save. You may need to refresh once for the favicon to update in your browser tab.</p>
        </div>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </div>
  );
}
function ColourField({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <label className="block">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="flex items-center gap-2">
        <input type="color" disabled={disabled} value={value} onChange={(e) => onChange(e.target.value)} className="h-10 w-14 rounded-lg border border-border" />
        <input disabled={disabled} value={value} onChange={(e) => onChange(e.target.value)}
          className="h-10 flex-1 rounded-lg border border-border bg-white px-3 font-mono text-sm" />
      </div>
    </label>
  );
}