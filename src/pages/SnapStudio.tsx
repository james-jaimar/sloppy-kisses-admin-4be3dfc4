import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { AlertTriangle, Camera, Check, Loader2, ScanLine, Search, X } from "lucide-react";

interface StudioProduct {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  size_pack: string | null;
  variant_label: string | null;
  image_url: string | null;
  image_public_url: string | null;
}

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/snap-upload`;
const ANON = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) as string;

async function call(body: Record<string, unknown>) {
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON, Authorization: `Bearer ${ANON}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `Request failed (${res.status})`);
  return json;
}

async function uploadPhoto(token: string, productId: string, file: File) {
  const form = new FormData();
  form.append("token", token);
  form.append("product_id", productId);
  form.append("file", file, file.name || `photo-${Date.now()}.jpg`);
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
    body: form,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `Upload failed (${res.status})`);
  return json as { product_id: string; image_path: string };
}

/** Live barcode scan using the browser's BarcodeDetector, where available. */
function BarcodeScanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stop = false;
    const Detector = (window as any).BarcodeDetector;

    async function run() {
      if (!Detector) {
        setError("This phone's browser can't scan barcodes — use the search box instead.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        const detector = new Detector();
        const tick = async () => {
          if (stop || !videoRef.current) return;
          try {
            const found = await detector.detect(videoRef.current);
            if (found?.length && found[0].rawValue) {
              onCode(String(found[0].rawValue));
              return;
            }
          } catch { /* frame not ready */ }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      } catch {
        setError("We couldn't open the camera. Check the permission and try again.");
      }
    }
    run();
    return () => {
      stop = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onCode]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between p-3 text-white">
        <span className="text-sm font-semibold">Point at the barcode</span>
        <button onClick={onClose} className="rounded-full bg-white/15 p-2"><X className="h-5 w-5" /></button>
      </div>
      {error ? (
        <div className="m-4 rounded-2xl bg-white p-4 text-sm">{error}</div>
      ) : (
        <video ref={videoRef} playsInline muted className="min-h-0 flex-1 object-cover" />
      )}
    </div>
  );
}

/** Public, token-authorised phone page: photograph the shop catalogue. */
export default function SnapStudio() {
  const { token = "" } = useParams();
  const [info, setInfo] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [missingOnly, setMissingOnly] = useState(true);
  const [rows, setRows] = useState<StudioProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [doneIds, setDoneIds] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);
  const target = useRef<StudioProduct | null>(null);
  const camRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (q: string, missing: boolean) => {
    setLoading(true);
    try {
      const d = await call({ action: "products", token, search: q, missing_only: missing });
      setRows((d as any).products ?? []);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    call({ action: "info", token }).then(setInfo).catch((e) => setErr(e.message));
  }, [token]);

  useEffect(() => {
    const t = setTimeout(() => { load(search, missingOnly); }, 250);
    return () => clearTimeout(t);
  }, [search, missingOnly, load]);

  // Keep the link alive while it's being used.
  useEffect(() => {
    if (!info) return;
    const id = setInterval(() => { call({ action: "extend", token }).catch(() => undefined); }, 4 * 60_000);
    return () => clearInterval(id);
  }, [info, token]);

  async function handleFile(file: File | undefined) {
    const p = target.current;
    if (!p || !file) return;
    setBusyId(p.id);
    try {
      await uploadPhoto(token, p.id, file);
      setDoneIds((d) => [...d, p.id]);
      setRows((rs) => rs.map((r) => (r.id === p.id
        ? { ...r, image_public_url: URL.createObjectURL(file), image_url: "pending" }
        : r)));
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusyId(null);
      target.current = null;
    }
  }

  if (err && !info) {
    return (
      <div className="grid min-h-dvh place-items-center bg-sk-surface-muted p-6">
        <div className="sk-card max-w-sm p-6 text-center">
          <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-sk-coral" />
          <p className="text-sm">{err === "expired" || err === "closed"
            ? "This link has expired. Ask the front desk for a fresh QR code."
            : err}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-sk-surface-muted pb-10">
      <header className="sticky top-0 z-20 space-y-2 border-b border-border bg-white p-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-base font-bold">Photo studio</div>
            <div className="text-xs text-muted-foreground">
              {info?.business_name ?? "Shop"} · {doneIds.length} photo{doneIds.length === 1 ? "" : "s"} sent
            </div>
          </div>
          <button onClick={() => setScanning(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-sk-coral px-3 py-2 text-xs font-bold text-white">
            <ScanLine className="h-4 w-4" /> Scan
          </button>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products…"
            className="h-11 w-full rounded-xl border border-border bg-white pl-9 pr-3 text-sm" />
        </div>
        <div className="inline-flex overflow-hidden rounded-xl border border-border">
          {([true, false] as const).map((m) => (
            <button key={String(m)} onClick={() => setMissingOnly(m)}
              className={`h-9 px-3 text-xs font-semibold ${missingOnly === m ? "bg-sk-coral text-white" : "bg-white text-muted-foreground"}`}>
              {m ? "Needs a photo" : "All products"}
            </button>
          ))}
        </div>
      </header>

      {err && info && (
        <div className="m-3 rounded-xl border border-sk-coral bg-sk-coral-soft p-3 text-sm text-sk-coral-dark">{err}</div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 p-3">
          {rows.map((p) => {
            const busy = busyId === p.id;
            const done = doneIds.includes(p.id);
            return (
              <button key={p.id} disabled={busy}
                onClick={() => { target.current = p; camRef.current?.click(); }}
                className={`overflow-hidden rounded-2xl border bg-white text-left disabled:opacity-60 ${done ? "border-emerald-500" : "border-border"}`}>
                <div className="relative grid aspect-square w-full place-items-center overflow-hidden bg-sk-surface-muted">
                  {p.image_public_url
                    ? <img src={p.image_public_url} alt={p.name} className="absolute inset-0 h-full w-full object-contain p-2" />
                    : <Camera className="h-7 w-7 text-muted-foreground" />}
                  <span className={`absolute bottom-2 right-2 inline-flex h-9 w-9 items-center justify-center rounded-full text-white shadow ${done ? "bg-emerald-600" : "bg-sk-coral"}`}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : done ? <Check className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
                  </span>
                </div>
                <div className="p-2">
                  <div className="line-clamp-2 text-xs font-semibold">{p.name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {[p.variant_label, p.size_pack].filter(Boolean).join(" · ") || p.sku || "—"}
                  </div>
                </div>
              </button>
            );
          })}
          {rows.length === 0 && (
            <div className="col-span-2 py-16 text-center text-sm text-muted-foreground">No products match.</div>
          )}
        </div>
      )}

      <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ""; }} />

      {scanning && (
        <BarcodeScanner
          onClose={() => setScanning(false)}
          onCode={(code) => { setScanning(false); setMissingOnly(false); setSearch(code); }}
        />
      )}
    </div>
  );
}
