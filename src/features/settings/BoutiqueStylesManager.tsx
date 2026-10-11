import { useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { ModalShell } from "@/components/modals/ModalShell";
import { GroomingInstructionsForm, type GroomingInstructionsValue } from "@/features/grooming/instructions/GroomingInstructionsForm";
import {
  useBoutiqueStyles, useUpsertBoutiqueStyle, useDeleteBoutiqueStyle, useGroomingRefUrl,
  uploadGroomingReference, type BoutiqueStyle,
} from "@/features/grooming/instructions/styleQueries";

interface Draft {
  id?: string;
  name: string;
  description: string;
  image_path: string | null;
  active: boolean;
  sort_order: number;
  value: GroomingInstructionsValue;
}

function Thumb({ path, className }: { path: string | null; className: string }) {
  const url = useGroomingRefUrl(path);
  return url
    ? <img src={url} alt="" className={"object-cover " + className} />
    : <span className={"grid place-items-center bg-sk-coral-soft text-sk-coral " + className}><Sparkles className="h-5 w-5" /></span>;
}

export function BoutiqueStylesManager({ tenantId, canManage }: { tenantId: string; canManage: boolean }) {
  const q = useBoutiqueStyles(tenantId, { includeInactive: true });
  const upsert = useUpsertBoutiqueStyle(tenantId);
  const del = useDeleteBoutiqueStyle();
  const confirm = useConfirm();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function openNew() {
    setDraft({ name: "", description: "", image_path: null, active: true, sort_order: ((q.data?.length ?? 0) + 1) * 10,
      value: { selections: {}, medical_flags: [], notes: "" } });
  }
  function openEdit(s: BoutiqueStyle) {
    setDraft({ id: s.id, name: s.name, description: s.description ?? "", image_path: s.image_path, active: s.active,
      sort_order: s.sort_order, value: { selections: s.selections ?? {}, medical_flags: [], notes: s.notes ?? "" } });
  }

  async function pickImage(file?: File) {
    if (!file || !draft) return;
    setUploading(true);
    try {
      const path = await uploadGroomingReference(tenantId, "styles", file);
      setDraft((d) => (d ? { ...d, image_path: path } : d));
    } catch (e: any) { toast.error(e?.message ?? "Upload failed"); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  async function save() {
    if (!draft || !draft.name.trim()) { toast.error("Give the style a name"); return; }
    try {
      await upsert.mutateAsync({
        ...(draft.id ? { id: draft.id } : {}),
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        image_path: draft.image_path,
        active: draft.active,
        sort_order: draft.sort_order,
        selections: draft.value.selections,
        notes: draft.value.notes?.trim() || null,
      });
      toast.success("Style saved");
      setDraft(null);
    } catch (e: any) { toast.error(e?.message ?? "Failed to save"); }
  }

  async function remove(s: BoutiqueStyle) {
    const ok = await confirm({ title: "Delete style?", description: `Remove "${s.name}". Pets and bookings keep their preferences.`, confirmLabel: "Delete" });
    if (!ok) return;
    try { await del.mutateAsync(s.id); toast.success("Deleted"); } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  }

  const styles = q.data ?? [];

  return (
    <section className="sk-card p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Boutique styles</h2>
          <p className="text-xs text-muted-foreground">
            Named cuts (e.g. Teddy bear, Lion cut). One tap on a booking or pet switches on all of the style's preferences — still editable afterwards.
          </p>
        </div>
        <button disabled={!canManage} onClick={openNew}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-sk-coral px-3 text-sm font-semibold text-white disabled:opacity-50">
          <Plus className="h-4 w-4" /> New style
        </button>
      </div>
      {styles.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">No styles yet.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {styles.map((s) => (
            <div key={s.id} className={"flex gap-3 rounded-lg border border-border p-3 " + (s.active ? "" : "opacity-60")}>
              <Thumb path={s.image_path} className="h-16 w-16 shrink-0 rounded-md" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{s.name}</div>
                <div className="line-clamp-2 text-xs text-muted-foreground">{s.description || `${Object.keys(s.selections ?? {}).length} preferences`}</div>
                {!s.active && <div className="text-[11px] font-semibold text-muted-foreground">Hidden</div>}
                <div className="mt-1 flex gap-1">
                  <button disabled={!canManage} onClick={() => openEdit(s)} className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-xs disabled:opacity-50">
                    <Pencil className="h-3 w-3" /> Edit
                  </button>
                  <button disabled={!canManage} onClick={() => remove(s)} className="inline-flex h-7 items-center rounded-md px-2 text-xs text-muted-foreground hover:text-destructive disabled:opacity-50">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {draft && (
        <ModalShell open onClose={() => setDraft(null)} title={draft.id ? `Edit ${draft.name || "style"}` : "New boutique style"}
          footer={
            <div className="flex justify-end gap-2">
              <button onClick={() => setDraft(null)} className="h-9 rounded-lg border border-border px-3 text-sm">Cancel</button>
              <button onClick={save} disabled={upsert.isPending || uploading}
                className="h-9 rounded-lg bg-sk-coral px-4 text-sm font-semibold text-white disabled:opacity-50">
                {upsert.isPending ? "Saving…" : "Save style"}
              </button>
            </div>
          }>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-4">
              <div className="flex flex-col items-center gap-2">
                <Thumb path={draft.image_path} className="h-28 w-28 rounded-lg" />
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickImage(e.target.files?.[0])} />
                <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                  className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2 text-xs">
                  <Camera className="h-3.5 w-3.5" /> {uploading ? "Uploading…" : draft.image_path ? "Replace picture" : "Reference picture"}
                </button>
              </div>
              <div className="min-w-[220px] flex-1 space-y-3">
                <label className="block">
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name</div>
                  <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    placeholder="e.g. Teddy bear" className="h-9 w-full rounded-md border border-border bg-white px-2 text-sm" />
                </label>
                <label className="block">
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</div>
                  <textarea rows={2} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                    className="w-full rounded-md border border-border bg-white p-2 text-sm" />
                </label>
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} /> Show as a button
                  </label>
                  <label className="flex items-center gap-2">
                    Order <input type="number" value={draft.sort_order} onChange={(e) => setDraft({ ...draft, sort_order: Number(e.target.value) || 0 })}
                      className="h-8 w-20 rounded-md border border-border bg-white px-2 text-sm" />
                  </label>
                </div>
              </div>
            </div>
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preferences this style switches on</div>
              <PresetForm tenantId={tenantId} value={draft.value} onChange={(v) => setDraft((d) => (d ? { ...d, value: v } : d))} />
            </div>
          </div>
        </ModalShell>
      )}
    </section>
  );
}

/** Same form as bookings, minus the style buttons/photo (they make no sense when defining a style). */
function PresetForm(props: { tenantId: string; value: GroomingInstructionsValue; onChange: (v: GroomingInstructionsValue) => void }) {
  return <GroomingInstructionsForm {...props} presetMode />;
}
