import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import { supabase } from "@/integrations/supabase/client";

type Row = {
  tenant_id: string;
  default_retention_days: number;
  archive_grace_days: number;
  auto_purge_enabled: boolean;
  max_upload_mb: number;
};

export default function DocumentRetentionPage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const qc = useQueryClient();

  const settingsQ = useQuery({
    queryKey: ["document_settings", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_settings")
        .select("*")
        .eq("tenant_id", tenantId!)
        .maybeSingle();
      if (error) throw error;
      return data as Row | null;
    },
  });

  const [form, setForm] = useState({
    default_retention_days: 1095,
    archive_grace_days: 90,
    auto_purge_enabled: true,
    max_upload_mb: 20,
  });

  useEffect(() => {
    const d = settingsQ.data;
    if (d) setForm({
      default_retention_days: Number(d.default_retention_days ?? 1095),
      archive_grace_days: Number(d.archive_grace_days ?? 90),
      auto_purge_enabled: !!d.auto_purge_enabled,
      max_upload_mb: Number(d.max_upload_mb ?? 20),
    });
  }, [settingsQ.data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("No tenant");
      const { error } = await supabase
        .from("document_settings")
        .upsert({ tenant_id: tenantId, ...form }, { onConflict: "tenant_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Document settings saved");
      qc.invalidateQueries({ queryKey: ["document_settings", tenantId] });
    },
    onError: (err: any) => toast.error(err?.message ?? "Failed"),
  });

  return (
    <>
      <AppHeader title="Documents & retention" subtitle="How long we keep customer and pet documents, and when the nightly purge runs." />
      <div className="flex-1 p-6">
        <div className="sk-card max-w-2xl p-6 space-y-5">
          <label className="block">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Default retention (days)</div>
            <input type="number" min={30} value={form.default_retention_days}
              onChange={(e) => setForm({ ...form, default_retention_days: Number(e.target.value) })}
              className="h-10 w-40 rounded-lg border border-border bg-white px-3 text-sm" />
            <div className="mt-1 text-[11px] text-muted-foreground">Vaccination certificates use the vaccine expiry date when known; other docs fall back to this window. Default 1095 (3 years).</div>
          </label>

          <label className="block">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Archive grace period (days)</div>
            <input type="number" min={0} value={form.archive_grace_days}
              onChange={(e) => setForm({ ...form, archive_grace_days: Number(e.target.value) })}
              className="h-10 w-40 rounded-lg border border-border bg-white px-3 text-sm" />
            <div className="mt-1 text-[11px] text-muted-foreground">How long an archived document is kept before it's hard-deleted from S3. Default 90 days.</div>
          </label>

          <label className="block">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Max upload size (MB)</div>
            <input type="number" min={1} max={100} value={form.max_upload_mb}
              onChange={(e) => setForm({ ...form, max_upload_mb: Number(e.target.value) })}
              className="h-10 w-40 rounded-lg border border-border bg-white px-3 text-sm" />
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.auto_purge_enabled}
              onChange={(e) => setForm({ ...form, auto_purge_enabled: e.target.checked })} />
            Automatically purge expired documents each night
          </label>
          <div className="text-[11px] text-muted-foreground -mt-3 pl-6">
            When off, expired documents are still archived but stay in S3 until a staff member deletes them manually.
          </div>

          <div className="flex justify-end">
            <button onClick={() => save.mutate()} disabled={save.isPending || !tenantId}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-sk-coral px-4 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-50">
              <Save className="h-4 w-4" /> Save changes
            </button>
          </div>
        </div>

        <div className="mt-4 max-w-2xl text-xs text-muted-foreground">
          Purge runs nightly at 03:00 SAST. Documents linked to pets marked deceased are archived immediately and purged after the grace period above.
        </div>
      </div>
    </>
  );
}