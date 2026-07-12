import { supabase } from "@/lib/supabase/client";

export async function downloadCreditNotePdf(creditNoteId: string, filename: string) {
  if (!supabase) throw new Error("Supabase client not configured");
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) throw new Error("Not signed in");
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-credit-note-pdf`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
    },
    body: JSON.stringify({ credit_note_id: creditNoteId }),
  });
  if (!res.ok) {
    let msg = `Failed (${res.status})`;
    try { const j = await res.json(); msg = j.error || msg; } catch {}
    throw new Error(msg);
  }
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}