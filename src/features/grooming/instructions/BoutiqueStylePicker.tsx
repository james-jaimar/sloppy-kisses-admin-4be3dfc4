import { useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Check, ImagePlus, Sparkles, X } from "lucide-react";
import { useBoutiqueStyles, useGroomingRefUrl, uploadGroomingReference, type BoutiqueStyle } from "./styleQueries";
import type { GroomingInstructionsValue } from "./GroomingInstructionsForm";

function StyleThumb({ path, className }: { path: string | null; className?: string }) {
  const url = useGroomingRefUrl(path);
  if (!url) return <span className={"grid place-items-center bg-sk-coral-soft text-sk-coral " + (className ?? "")}><Sparkles className="h-4 w-4" /></span>;
  return <img src={url} alt="" className={"object-cover " + (className ?? "")} />;
}

/** One-tap boutique style buttons. Applying a style switches on its preferences; everything stays editable. */
export function BoutiqueStylePicker({
  tenantId, value, disabled, onApply,
}: {
  tenantId: string | null;
  value: GroomingInstructionsValue;
  disabled?: boolean;
  onApply: (patch: Partial<GroomingInstructionsValue>) => void;
}) {
  const q = useBoutiqueStyles(tenantId);
  const styles = q.data ?? [];
  const current = styles.find((s) => s.id === value.style_id) ?? null;

  if (disabled) {
    if (!current) return null;
    return (
      <div className="flex items-center gap-3 rounded-lg border border-sk-coral/40 bg-sk-coral-soft/40 p-2">
        <StyleThumb path={current.image_path} className="h-14 w-14 rounded-md" />
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Boutique style</div>
          <div className="text-sm font-semibold">{current.name}</div>
        </div>
      </div>
    );
  }
  if (styles.length === 0) return null;

  function apply(s: BoutiqueStyle) {
    if (value.style_id === s.id) { onApply({ style_id: null }); return; }
    onApply({
      style_id: s.id,
      selections: { ...value.selections, ...(s.selections ?? {}) },
      notes: value.notes?.trim() ? value.notes : s.notes ?? value.notes,
    });
    toast.success(`${s.name} applied — tweak anything below`);
  }

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Boutique styles</div>
      <div className="flex flex-wrap gap-2">
        {styles.map((s) => {
          const on = value.style_id === s.id;
          return (
            <button key={s.id} type="button" onClick={() => apply(s)} title={s.description ?? undefined}
              className={`flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-xs font-medium ${on ? "border-sk-coral bg-sk-coral text-white" : "border-border bg-white hover:border-sk-coral"}`}>
              <StyleThumb path={s.image_path} className="h-7 w-7 rounded-full" />
              {s.name}
              {on && <Check className="h-3 w-3" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** "Make it look like this" picture for a pet or a single booking. */
export function CutReferencePhoto({
  tenantId, path, disabled, onChange,
}: {
  tenantId: string | null;
  path: string | null;
  disabled?: boolean;
  onChange: (path: string | null) => void;
}) {
  const url = useGroomingRefUrl(path);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  if (disabled && !path) return null;

  async function pick(file: File | undefined) {
    if (!file || !tenantId) return;
    setBusy(true);
    try {
      onChange(await uploadGroomingReference(tenantId, "pets", file));
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cut reference picture</div>
      <div className="flex items-center gap-3">
        {url ? (
          <a href={url} target="_blank" rel="noreferrer">
            <img src={url} alt="Cut reference" className={disabled ? "h-40 w-40 rounded-lg object-cover" : "h-20 w-20 rounded-lg object-cover"} />
          </a>
        ) : (
          <span className="grid h-20 w-20 place-items-center rounded-lg border border-dashed border-border text-muted-foreground">
            <ImagePlus className="h-5 w-5" />
          </span>
        )}
        {!disabled && (
          <div className="flex flex-col gap-2">
            <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
            <button type="button" disabled={busy} onClick={() => input.current?.click()}
              className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-white px-3 text-xs font-medium">
              <Camera className="h-3.5 w-3.5" /> {busy ? "Uploading…" : path ? "Replace picture" : "Add a picture"}
            </button>
            {path && (
              <button type="button" onClick={() => onChange(null)}
                className="inline-flex h-8 items-center gap-1 rounded-md px-3 text-xs text-muted-foreground hover:text-destructive">
                <X className="h-3.5 w-3.5" /> Remove
              </button>
            )}
            <span className="text-[11px] text-muted-foreground">A photo of the look you want.</span>
          </div>
        )}
      </div>
    </div>
  );
}
