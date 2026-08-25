import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, ImageIcon, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import { StudioSnapDialog } from "@/features/uploads/StudioSnapDialog";
import { useCategoryTree, useProducts, useSetProductImage, type Product } from "./queries";
import { deleteProductImage, forgetProductImage, uploadProductImage, useProductImageUrls } from "./productImages";


const PAGE = 60;

/** Tablet-friendly bulk photo capture: tap a tile, snap or pick, done. */
export default function ProductPhotosPage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;

  const [search, setSearch] = useState("");
  const [parentId, setParentId] = useState("");
  const [mode, setMode] = useState<"missing" | "all">("missing");
  const [visible, setVisible] = useState(PAGE);
  const [busyId, setBusyId] = useState<string | null>(null);
  const target = useRef<Product | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const listQ = useProducts(tenantId, { search, activeOnly: true });
  const tree = useCategoryTree(tenantId);
  const setImage = useSetProductImage(tenantId ?? "");

  const catIds = parentId ? tree.familyIds(parentId) : null;
  const rows = (listQ.data ?? [])
    .filter((p) => (mode === "missing" ? !p.image_url : true))
    .filter((p) => (catIds ? p.category_id && catIds.includes(p.category_id) : true));
  const page = rows.slice(0, visible);
  const resolve = useProductImageUrls(page.map((p) => p.image_url));

  const missingCount = useMemo(
    () => (listQ.data ?? []).filter((p) => !p.image_url).length,
    [listQ.data],
  );

  async function handleFile(file: File) {
    const p = target.current;
    if (!p || !tenantId) return;
    setBusyId(p.id);
    try {
      const path = await uploadProductImage(tenantId, p.id, file);
      if (p.image_url) await deleteProductImage(p.image_url);
      forgetProductImage(p.image_url);
      await setImage.mutateAsync({ id: p.id, image_url: path });
      toast.success(`Photo saved — ${p.name}`);
    } catch (err: any) {
      toast.error(err?.message ?? "Upload failed");
    } finally {
      setBusyId(null);
      target.current = null;
    }
  }

  return (
    <>
      <AppHeader title="Photo studio" subtitle="Snap product photos straight onto the tablet — they appear on the till instantly." />
      <div className="flex-1 p-4 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={(e) => { setSearch(e.target.value); setVisible(PAGE); }}
              placeholder="Search products…"
              className="h-11 w-full rounded-lg border border-border bg-white pl-9 pr-3 text-sm" />
          </div>
          <select value={parentId} onChange={(e) => { setParentId(e.target.value); setVisible(PAGE); }}
            className="h-11 rounded-lg border border-border bg-white px-3 text-sm">
            <option value="">All categories</option>
            {tree.parents.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="inline-flex overflow-hidden rounded-lg border border-border bg-white">
            {(["missing", "all"] as const).map((m) => (
              <button key={m} onClick={() => { setMode(m); setVisible(PAGE); }}
                className={`h-11 px-4 text-sm font-semibold ${mode === m ? "bg-sk-coral text-white" : "text-muted-foreground"}`}>
                {m === "missing" ? `Needs a photo (${missingCount})` : "All products"}
              </button>
            ))}
          </div>
          {tenantId && (
            <StudioSnapDialog tenantId={tenantId} label="Shop photo studio" onProgress={refreshPhotos} />
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {page.map((p) => {
            const img = resolve(p.image_url);
            const busy = busyId === p.id;
            return (
              <div key={p.id}
                className="sk-card group relative flex flex-col overflow-hidden p-0 text-left transition-colors hover:border-sk-coral">
                <button type="button" disabled={busy}
                  onClick={() => { target.current = p; fileRef.current?.click(); }}
                  className="flex flex-col text-left disabled:opacity-60">
                  <div className="relative grid aspect-square w-full place-items-center overflow-hidden bg-sk-surface-muted">
                    {img
                      ? <img src={img} alt={p.name} className="absolute inset-0 h-full w-full object-contain p-2" loading="lazy" />
                      : <ImageIcon className="h-8 w-8 text-muted-foreground" />}
                    <span className="absolute bottom-2 right-2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-sk-coral text-white shadow">
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                    </span>
                  </div>
                  <div className="p-3">
                    <div className="line-clamp-2 text-sm font-semibold">{p.name}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {[p.variant_label, p.size_pack].filter(Boolean).join(" · ") || tree.labelFor(p.category_id) || "—"}
                    </div>
                  </div>
                </button>
                {tenantId && (
                  <StudioSnapDialog
                    tenantId={tenantId}
                    productId={p.id}
                    label={p.name}
                    buttonLabel=""
                    onProgress={refreshPhotos}
                    className="absolute left-2 top-2 inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-white/95 text-sk-coral-dark shadow"
                  />
                )}
              </div>
            );
          })}

          {page.length === 0 && (
            <div className="col-span-full py-16 text-center text-muted-foreground">
              {listQ.isLoading ? "Loading…" : "Nothing here — every product in this view has a photo."}
            </div>
          )}
        </div>

        {rows.length > page.length && (
          <div className="flex justify-center">
            <button onClick={() => setVisible((v) => v + PAGE)}
              className="h-11 rounded-lg border border-border bg-white px-4 text-sm font-semibold">
              Show more ({rows.length - page.length} left)
            </button>
          </div>
        )}
      </div>

      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
    </>
  );
}
