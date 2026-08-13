import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Save, Plus, Trash2, ChevronUp, ChevronDown, Eye, Pencil, Send, RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant, useCurrentUser } from "@/lib/tenant/TenantContext";
import { supabase } from "@/lib/supabase/client";
import { RichTextEditor } from "@/features/comms/RichTextEditor";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  DEFAULT_QUOTE_EMAIL_SETTINGS,
  type QuoteEmailCard,
} from "./quoteEmailDefaults";
import {
  useQuoteEmailSettings, useSaveQuoteEmailSettings, type QuoteEmailSettings,
} from "./quoteEmailQueries";

const PERMISSION = "settings.hotel.manage";

const VARIABLES = [
  "customer.first_name", "customer.full_name", "tenant.name", "pet.names",
  "quote.number", "quote.dates", "quote.nights", "quote.accommodation",
  "quote.total", "quote.deposit", "quote.valid_until",
];

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

const inputCls = "h-10 w-full rounded-lg border border-border bg-white px-3 text-sm";

export default function HotelQuoteEmailPage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const { hasPermission } = useCurrentUser();
  const canManage = hasPermission(PERMISSION);
  const confirm = useConfirm();

  const settingsQ = useQuoteEmailSettings(tenantId);
  const save = useSaveQuoteEmailSettings(tenantId ?? "");

  const [form, setForm] = useState<QuoteEmailSettings>(DEFAULT_QUOTE_EMAIL_SETTINGS);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const insertRef = useRef<((text: string) => void) | null>(null);
  const registerInsert = useCallback((fn: (text: string) => void) => { insertRef.current = fn; }, []);

  useEffect(() => { if (settingsQ.data) setForm(settingsQ.data); }, [settingsQ.data]);

  const cards = useMemo(() => form.cards ?? [], [form.cards]);
  const set = <K extends keyof QuoteEmailSettings>(k: K, v: QuoteEmailSettings[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  function patchCard(idx: number, patch: Partial<QuoteEmailCard>) {
    setForm((f) => ({ ...f, cards: (f.cards ?? []).map((c, i) => (i === idx ? { ...c, ...patch } : c)) }));
  }
  function moveCard(idx: number, dir: -1 | 1) {
    setForm((f) => {
      const next = [...(f.cards ?? [])];
      const to = idx + dir;
      if (to < 0 || to >= next.length) return f;
      [next[idx], next[to]] = [next[to], next[idx]];
      return { ...f, cards: next };
    });
  }
  async function removeCard(idx: number) {
    const card = cards[idx];
    if (!(await confirm({ title: `Remove "${card?.title || "this section"}"?`, confirmLabel: "Remove", tone: "destructive" }))) return;
    setForm((f) => ({ ...f, cards: (f.cards ?? []).filter((_, i) => i !== idx) }));
  }
  function addCard() {
    setForm((f) => ({
      ...f,
      cards: [...(f.cards ?? []), {
        id: `card-${Date.now()}`, title: "New section", body_html: "<p></p>", enabled: true,
      }],
    }));
  }

  async function onSave() {
    try {
      await save.mutateAsync(form);
      toast.success("Quote email saved");
    } catch (e: any) { toast.error(e?.message ?? "Failed to save"); }
  }

  async function loadPreview(sendTest = false) {
    if (!tenantId) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("quote-email-preview", {
        body: { tenant_id: tenantId, settings: form, send_test: sendTest },
      });
      if (error) throw error;
      if (data?.html) setPreviewHtml(data.html);
      if (sendTest) {
        if (data?.ok) toast.success(`Test sent to ${data.recipient}`);
        else toast.error(data?.error ?? "Test send failed");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Preview failed");
    } finally { setBusy(false); }
  }

  async function resetAll() {
    if (!(await confirm({ title: "Reset the whole email to the default wording?", confirmLabel: "Reset", tone: "destructive" }))) return;
    setForm(DEFAULT_QUOTE_EMAIL_SETTINGS);
    toast.success("Reset — remember to save");
  }

  return (
    <>
      <AppHeader
        title="Hotel quote email"
        subtitle="Every part of the quote email — hero, price labels, information sections and sign-off."
      />
      <div className="flex-1 p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-border bg-white p-1">
            <button
              type="button"
              onClick={() => setMode("edit")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm ${mode === "edit" ? "bg-sk-coral-soft text-sk-coral-dark" : "text-muted-foreground"}`}
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
            <button
              type="button"
              onClick={() => { setMode("preview"); void loadPreview(false); }}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm ${mode === "preview" ? "bg-sk-coral-soft text-sk-coral-dark" : "text-muted-foreground"}`}
            >
              <Eye className="h-3.5 w-3.5" /> Preview
            </button>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button type="button" onClick={resetAll} disabled={!canManage}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 text-sm text-muted-foreground disabled:opacity-50">
              <RotateCcw className="h-3.5 w-3.5" /> Reset to default
            </button>
            <button type="button" onClick={() => void loadPreview(true)} disabled={busy || !canManage}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 text-sm disabled:opacity-50">
              <Send className="h-3.5 w-3.5" /> Send test
            </button>
            <button type="button" onClick={onSave} disabled={!canManage || save.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sk-coral px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              <Save className="h-4 w-4" /> Save
            </button>
          </div>
        </div>

        {!canManage && (
          <div className="mb-4 rounded-lg border border-sk-orange bg-sk-orange-soft px-3 py-2 text-xs text-sk-orange">
            You have read-only access. Only staff with the "Manage hotel &amp; cattery settings" permission can change this email.
          </div>
        )}

        {mode === "preview" ? (
          <div className="sk-card overflow-hidden p-0">
            {previewHtml
              ? <iframe title="Quote email preview" srcDoc={previewHtml} className="h-[80vh] w-full border-0" />
              : <div className="p-6 text-sm text-muted-foreground">{busy ? "Building preview…" : "No preview yet."}</div>}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="sk-card space-y-4 p-5">
              <h2 className="text-sm font-bold">Header</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Small label" hint="Sits above the headline in the coloured banner.">
                  <input className={inputCls} disabled={!canManage} value={form.hero_label}
                    onChange={(e) => set("hero_label", e.target.value)} />
                </Field>
                <Field label="Headline">
                  <input className={inputCls} disabled={!canManage} value={form.hero_headline}
                    onChange={(e) => set("hero_headline", e.target.value)} />
                </Field>
              </div>
            </div>

            <div className="sk-card space-y-4 p-5">
              <h2 className="text-sm font-bold">Price card &amp; button</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Total label"><input className={inputCls} disabled={!canManage} value={form.total_label} onChange={(e) => set("total_label", e.target.value)} /></Field>
                <Field label="Deposit label"><input className={inputCls} disabled={!canManage} value={form.deposit_label} onChange={(e) => set("deposit_label", e.target.value)} /></Field>
                <Field label="Dates-held line"><input className={inputCls} disabled={!canManage} value={form.hold_line} onChange={(e) => set("hold_line", e.target.value)} /></Field>
                <Field label="Button text"><input className={inputCls} disabled={!canManage} value={form.cta_label} onChange={(e) => set("cta_label", e.target.value)} /></Field>
                <Field label="Text under the button"><input className={inputCls} disabled={!canManage} value={form.cta_subtext} onChange={(e) => set("cta_subtext", e.target.value)} /></Field>
                <Field label="Heading above the sections"><input className={inputCls} disabled={!canManage} value={form.section_heading} onChange={(e) => set("section_heading", e.target.value)} /></Field>
              </div>
            </div>

            <div className="sk-card space-y-4 p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold">Information sections</h2>
                <button type="button" onClick={addCard} disabled={!canManage}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-sm disabled:opacity-50">
                  <Plus className="h-3.5 w-3.5" /> Add section
                </button>
              </div>
              {cards.map((c, idx) => (
                <div key={c.id ?? idx} className="rounded-xl border border-border p-4">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <input
                      className={inputCls + " flex-1 min-w-[180px]"}
                      disabled={!canManage}
                      value={c.title ?? ""}
                      placeholder="Section title"
                      onChange={(e) => patchCard(idx, { title: e.target.value })}
                    />
                    <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <input type="checkbox" disabled={!canManage} checked={c.enabled !== false}
                        onChange={(e) => patchCard(idx, { enabled: e.target.checked })} />
                      Show
                    </label>
                    <button type="button" title="Move up" disabled={!canManage || idx === 0} onClick={() => moveCard(idx, -1)}
                      className="rounded-md border border-border p-1.5 disabled:opacity-40"><ChevronUp className="h-3.5 w-3.5" /></button>
                    <button type="button" title="Move down" disabled={!canManage || idx === cards.length - 1} onClick={() => moveCard(idx, 1)}
                      className="rounded-md border border-border p-1.5 disabled:opacity-40"><ChevronDown className="h-3.5 w-3.5" /></button>
                    <button type="button" title="Remove" disabled={!canManage} onClick={() => void removeCard(idx)}
                      className="rounded-md border border-border p-1.5 text-destructive disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                  <div className="overflow-hidden rounded-lg border border-border">
                    <RichTextEditor
                      value={c.body_html ?? ""}
                      disabled={!canManage}
                      onChange={(html) => patchCard(idx, { body_html: html })}
                      registerInsert={registerInsert}
                    />
                  </div>
                </div>
              ))}
              {!cards.length && (
                <p className="text-sm text-muted-foreground">No sections — the email will show just the intro, price card and sign-off.</p>
              )}
            </div>

            <div className="sk-card space-y-4 p-5">
              <h2 className="text-sm font-bold">Sign-off</h2>
              <div className="overflow-hidden rounded-lg border border-border">
                <RichTextEditor
                  value={form.signoff_html}
                  disabled={!canManage}
                  onChange={(html) => set("signoff_html", html)}
                  registerInsert={registerInsert}
                />
              </div>
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" disabled={!canManage} checked={form.show_guidelines}
                  onChange={(e) => set("show_guidelines", e.target.checked)} />
                Include the house guidelines from Hotel &amp; Cattery workflow settings
              </label>
            </div>

            <div className="sk-card p-5">
              <h2 className="mb-2 text-sm font-bold">Variables</h2>
              <div className="flex flex-wrap gap-1.5">
                {VARIABLES.map((v) => (
                  <button
                    key={v}
                    type="button"
                    disabled={!canManage}
                    onClick={() => insertRef.current?.(`{{${v}}}`)}
                    className="rounded-full border border-border px-2.5 py-1 font-mono text-[11px] text-muted-foreground hover:bg-muted disabled:opacity-50"
                  >
                    {v}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Click a chip to drop it into the section you last typed in, or type it by hand into any field. Real sends fill in the customer's details.
              </p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
