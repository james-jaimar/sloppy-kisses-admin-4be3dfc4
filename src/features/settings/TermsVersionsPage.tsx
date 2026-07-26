import { useState } from "react";
import { CheckCircle2, FileText, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import { supabase } from "@/integrations/supabase/client";
import { useConfirm } from "@/components/ui/confirm-dialog";

type Row = {
  id: string;
  tenant_id: string;
  kind: string;
  version: string;
  title: string | null;
  body_markdown: string | null;
  effective_from: string;
  is_current: boolean;
  created_at: string;
};

const KINDS = [
  { code: "terms", label: "Terms & Conditions" },
  { code: "registration", label: "Daycare Registration" },
];

export default function TermsVersionsPage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [tab, setTab] = useState<string>("terms");
  const [editing, setEditing] = useState<Row | null>(null);
  const [creating, setCreating] = useState(false);

  const q = useQuery({
    queryKey: ["tenant_terms_versions", tenantId, tab],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_terms_versions")
        .select("*")
        .eq("tenant_id", tenantId!)
        .eq("kind", tab)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (row: Partial<Row> & { kind: string; version: string }) => {
      if (!tenantId) throw new Error("No tenant");
      const payload = {
        ...row,
        tenant_id: tenantId,
      };
      const { error } = await supabase.from("tenant_terms_versions").upsert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["tenant_terms_versions", tenantId, tab] });
      setEditing(null);
      setCreating(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setCurrent = useMutation({
    mutationFn: async (row: Row) => {
      // Clear existing current for kind
      const { error: e1 } = await supabase
        .from("tenant_terms_versions")
        .update({ is_current: false })
        .eq("tenant_id", tenantId!)
        .eq("kind", row.kind)
        .neq("id", row.id);
      if (e1) throw e1;
      const { error: e2 } = await supabase
        .from("tenant_terms_versions")
        .update({ is_current: true })
        .eq("id", row.id);
      if (e2) throw e2;
    },
    onSuccess: () => {
      toast.success("Marked current — customers will be prompted to re-accept on next login");
      qc.invalidateQueries({ queryKey: ["tenant_terms_versions", tenantId, tab] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (row: Row) => {
      const { error } = await supabase.from("tenant_terms_versions").delete().eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["tenant_terms_versions", tenantId, tab] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = q.data ?? [];

  return (
    <>
      <AppHeader
        title="Terms & Registration"
        subtitle="Versioned copies of your legal terms and daycare registration. Customers re-accept on next login when a new version is marked current."
      />
      <div className="flex-1 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            {KINDS.map((k) => (
              <button
                key={k.code}
                type="button"
                onClick={() => setTab(k.code)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  tab === k.code
                    ? "bg-sk-coral text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted/70"
                }`}
              >
                {k.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="sk-btn sk-btn-primary"
            onClick={() => {
              setEditing(null);
              setCreating(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            New version
          </button>
        </div>

        <div className="sk-card divide-y">
          {q.isLoading && <div className="p-6 text-sm text-muted-foreground">Loading…</div>}
          {!q.isLoading && rows.length === 0 && (
            <div className="p-6 text-sm text-muted-foreground">
              No versions yet. Click <b>New version</b> to add your first.
            </div>
          )}
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-4 p-4">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="font-semibold">v{r.version}</div>
                  {r.title && <div className="text-sm text-muted-foreground truncate">— {r.title}</div>}
                  {r.is_current && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                      <CheckCircle2 className="h-3 w-3" /> Current
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  Effective {format(new Date(r.effective_from), "dd MMM yyyy")}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!r.is_current && (
                  <button
                    type="button"
                    className="sk-btn sk-btn-ghost"
                    onClick={() => setCurrent.mutate(r)}
                    disabled={setCurrent.isPending}
                  >
                    Mark current
                  </button>
                )}
                <button
                  type="button"
                  className="sk-btn sk-btn-ghost"
                  onClick={() => {
                    setCreating(false);
                    setEditing(r);
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="sk-btn sk-btn-ghost text-red-600"
                  onClick={async () => {
                    const ok = await confirm({
                      title: `Delete v${r.version}?`,
                      description:
                        "Deleting a version does not revoke customer signatures — those are preserved by version label.",
                      confirmLabel: "Delete",
                      tone: "destructive",
                    });
                    if (ok) del.mutate(r);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {(editing || creating) && (
        <VersionEditor
          kind={tab}
          initial={editing}
          onCancel={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSave={(v) => upsert.mutate(v)}
          saving={upsert.isPending}
        />
      )}
    </>
  );
}

function VersionEditor({
  kind,
  initial,
  onCancel,
  onSave,
  saving,
}: {
  kind: string;
  initial: Row | null;
  onCancel: () => void;
  onSave: (v: Partial<Row> & { kind: string; version: string }) => void;
  saving: boolean;
}) {
  const [version, setVersion] = useState(initial?.version ?? "1.0");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body_markdown ?? "");
  const [effectiveFrom, setEffectiveFrom] = useState(
    initial?.effective_from ?? format(new Date(), "yyyy-MM-dd"),
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="sk-card flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden">
        <div className="border-b p-4 font-semibold">
          {initial ? `Edit v${initial.version}` : "New version"}
        </div>
        <div className="flex-1 space-y-4 overflow-auto p-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-sm sm:col-span-1">
              <span className="font-medium">Version</span>
              <input
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="e.g. 2026.1"
                className="rounded-md border px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              <span className="font-medium">Title (optional)</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. 2026 Refresh"
                className="rounded-md border px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Effective from</span>
              <input
                type="date"
                value={effectiveFrom.slice(0, 10)}
                onChange={(e) => setEffectiveFrom(e.target.value)}
                className="rounded-md border px-3 py-2"
              />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Body (Markdown supported)</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={16}
              className="rounded-md border px-3 py-2 font-mono text-xs"
              placeholder="Paste or type your terms here. Basic Markdown headings, lists and bold are supported when shown to customers."
            />
          </label>
        </div>
        <div className="flex items-center justify-end gap-2 border-t p-4">
          <button type="button" className="sk-btn sk-btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="sk-btn sk-btn-primary"
            disabled={saving || !version.trim()}
            onClick={() =>
              onSave({
                id: initial?.id,
                kind,
                version: version.trim(),
                title: title.trim() || null,
                body_markdown: body,
                effective_from: effectiveFrom,
                is_current: initial?.is_current ?? false,
              })
            }
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}