import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Camera, Check, Loader2, ImagePlus } from "lucide-react";
import { supabase } from "@/lib/supabase/client";

interface Info {
  label: string | null;
  doc_type: string;
  expires_at: string;
  max_files: number;
  files_uploaded: number;
  business_name: string | null;
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

/** Public, token-authorised phone page. No login — the link is the credential. */
export default function SnapUpload() {
  const { token = "" } = useParams();
  const [info, setInfo] = useState<Info | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string[]>([]);
  const camRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    call({ action: "info", token })
      .then((d) => setInfo(d as Info))
      .catch((e) => setErr(e.message));
  }, [token]);

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const sign = await call({
        action: "sign",
        token,
        file_name: file.name || `photo-${Date.now()}.jpg`,
        content_type: file.type || "image/jpeg",
        size_bytes: file.size,
      });
      const put = await fetch(sign.upload_url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "image/jpeg" },
      });
      if (!put.ok) throw new Error(`Upload failed (${put.status})`);
      await call({ action: "confirm", token, document_id: sign.document_id, client_size_bytes: file.size });
      setDone((d) => [...d, file.name || "Photo"]);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const friendly: Record<string, string> = {
    not_found: "This link isn't valid.",
    expired: "This link has expired — please start again on the computer.",
    closed: "This link has already been closed.",
    limit_reached: "You've reached the file limit for this link.",
    unsupported_type: "Please upload a photo (JPG, PNG or HEIC) or a PDF.",
  };

  return (
    <div className="min-h-screen bg-muted p-4">
      <div className="mx-auto max-w-md space-y-4">
        <div className="rounded-3xl bg-white p-5 shadow-sm">
          <h1 className="text-lg font-bold text-foreground">
            {info?.business_name ?? "Sloppy Kisses"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {info?.label ?? "Upload from your phone"}
          </p>
        </div>

        {err && (
          <div className="rounded-2xl bg-sk-coral-soft p-4 text-sm font-medium text-sk-coral-dark">
            {friendly[err] ?? err}
          </div>
        )}

        {info && (
          <div className="space-y-3 rounded-3xl bg-white p-5 shadow-sm">
            <button
              onClick={() => camRef.current?.click()}
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-sk-coral px-4 py-5 text-base font-bold text-white active:opacity-90 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
              Take a photo
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border px-4 py-5 text-base font-bold active:bg-muted disabled:opacity-50"
            >
              <ImagePlus className="h-5 w-5" />
              Choose from gallery
            </button>
            <input
              ref={camRef} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }}
            />
            <input
              ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden"
              onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }}
            />
            <p className="text-center text-xs text-muted-foreground">
              Link valid until {new Date(info.expires_at).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
        )}

        {done.length > 0 && (
          <div className="space-y-2 rounded-3xl bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold">Sent to the computer</p>
            {done.map((n, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                <Check className="h-4 w-4 text-sk-green" /> <span className="truncate">{n}</span>
              </div>
            ))}
            <p className="pt-1 text-xs text-muted-foreground">You can close this page when you're finished.</p>
          </div>
        )}
      </div>
    </div>
  );
}
