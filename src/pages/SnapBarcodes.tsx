import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { AlertTriangle, Barcode, Check, Loader2, ScanLine, Search, X } from "lucide-react";

interface SnapProduct {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  size_pack: string | null;
  variant_label: string | null;
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

/** Live barcode scan using the browser's BarcodeDetector, where available. */
function CameraScanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stop = false;
    const Detector = (window as any).BarcodeDetector;

    async function run() {
      if (!Detector) {
        setError("This phone's browser can't scan barcodes — type the digits in instead.");
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

/** Public, token-authorised phone page: scan a barcode, then say what it is. */
export default function SnapBarcodes() {
  const { token = "" } = useParams();
  const [info, setInfo] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [scanning, setScanning] = useState(false);
  const [search, setSearch] = useState("");
  const [missingOnly, setMissingOnly] = useState(true);
  const [rows, setRows] = useState<SnapProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ code: string; name: string }[]>([]);

  const load = useCallback(async (q: string, missing: boolean) => {
    setLoading(true);
    try {
      const d = await call({ action: "products", token, search: q, missing_barcode_only: missing });
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

  async function link(p: SnapProduct) {
    if (!code.trim()) { setErr("Scan or type a barcode first."); return; }
    setSavingId(p.id);
    setErr(null);
    try {
      await call({ action: "link_barcode", token, code: code.trim(), product_id: p.id });
      setSaved((s) => [{ code: code.trim(), name: p.name }, ...s].slice(0, 20));
      setCode("");
      setSearch("");
      load("", missingOnly);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSavingId(null);
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
            <div className="text-base font-bold">Barcode capture</div>
            <div className="text-xs text-muted-foreground">
              {info?.business_name ?? "Shop"} · {saved.length} code{saved.length === 1 ? "" : "s"} saved
            </div>
          </div>
          <button onClick={() => setScanning(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-sk-coral px-3 py-2 text-xs font-bold text-white">
            <ScanLine className="h-4 w-4" /> Scan
          </button>
        </div>

        <div className="rounded-xl border border-border bg-sk-surface-muted p-2">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Barcode</div>
          <div className="flex items-center gap-2">
            <Barcode className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric"
              placeholder="Scan or type the code"
              className="h-10 w-full rounded-lg border border-border bg-white px-3 font-mono text-base tabular-nums" />
            {code && (
              <button onClick={() => setCode("")} className="rounded-lg border border-border bg-white p-2">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Find the product…"
            className="h-11 w-full rounded-xl border border-border bg-white pl-9 pr-3 text-sm" />
        </div>
        <div className="inline-flex overflow-hidden rounded-xl border border-border">
          {([true, false] as const).map((m) => (
            <button key={String(m)} onClick={() => setMissingOnly(m)}
              className={`h-9 px-3 text-xs font-semibold ${missingOnly === m ? "bg-sk-coral text-white" : "bg-white text-muted-foreground"}`}>
              {m ? "Needs a code" : "All products"}
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
        <div className="space-y-2 p-3">
          {rows.map((p) => (
            <button key={p.id} disabled={savingId === p.id || !code.trim()}
              onClick={() => link(p)}
              className="flex w-full items-center gap-3 rounded-2xl border border-border bg-white p-3 text-left disabled:opacity-50">
              <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-sk-surface-muted">
                {p.image_public_url
                  ? <img src={p.image_public_url} alt={p.name} className="h-full w-full object-contain p-1" />
                  : <Barcode className="h-5 w-5 text-muted-foreground" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="line-clamp-2 text-sm font-semibold">{p.name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {[p.variant_label, p.size_pack].filter(Boolean).join(" · ") || p.sku || "—"}
                  {p.barcode ? ` · ${p.barcode}` : ""}
                </div>
              </div>
              {savingId === p.id
                ? <Loader2 className="h-5 w-5 animate-spin text-sk-coral" />
                : <span className="rounded-lg bg-sk-coral px-3 py-2 text-xs font-bold text-white">Save</span>}
            </button>
          ))}
          {rows.length === 0 && (
            <div className="py-14 text-center text-sm text-muted-foreground">No products match.</div>
          )}
        </div>
      )}

      {saved.length > 0 && (
        <div className="mx-3 rounded-2xl border border-border bg-white p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Just saved</div>
          <ul className="space-y-1 text-xs">
            {saved.map((s, i) => (
              <li key={`${s.code}-${i}`} className="flex items-center gap-2">
                <Check className="h-3.5 w-3.5 text-emerald-600" />
                <span className="font-mono">{s.code}</span>
                <span className="truncate text-muted-foreground">{s.name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {scanning && (
        <CameraScanner
          onClose={() => setScanning(false)}
          onCode={(c) => { setScanning(false); setCode(c); }}
        />
      )}
    </div>
  );
}
