import { useMemo, useRef, useState } from "react";
import { Plus, Trash2, Syringe, CheckCircle2, AlertTriangle, Upload, FileText, Loader2, Download } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCurrentUser } from "@/lib/tenant/TenantContext";
import { usePetVaccinations, useUpsertPetVaccination, useDeletePetVaccination, useVaccinationRules, type PetVaccination } from "@/features/comms/queries";
import { useVaccineTypes, type VaccineType } from "./vaccineTypeQueries";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { supabase } from "@/lib/supabase/client";
import { uploadDocumentToS3, getDocumentDownloadUrl } from "@/features/documents/uploadDocument";
import { VaxWaiverBanner } from "./VaxWaiverBanner";

interface Props {
  tenantId: string;
  petId: string;
  species?: string | null;
  canManage?: boolean;
  uploadedVia?: "portal" | "admin";
}

type Tone = "green" | "orange" | "coral" | "grey";

export type VaxRowState = {
  key: string;
  label: string;
  help?: string | null;
  required: boolean;
  record: PetVaccination | null;
  hasCert: boolean;
  label_status: string;
  tone: Tone;
};

function recordTone(v: PetVaccination, hasCert: boolean): { label: string; tone: Tone } {
  if (!v.expiry_date) return { label: "No expiry", tone: "orange" };
  const today = new Date().toISOString().slice(0, 10);
  if (v.expiry_date < today) return { label: "Expired", tone: "coral" };
  if (!hasCert) return { label: "Awaiting certificate", tone: "orange" };
  const in30 = new Date(); in30.setDate(in30.getDate() + 30);
  if (v.expiry_date < in30.toISOString().slice(0, 10)) return { label: "Expiring soon", tone: "orange" };
  return { label: "Valid", tone: "green" };
}

const TONE_CLASS: Record<Tone, string> = {
  green: "bg-sk-turquoise-soft text-sk-turquoise-dark",
  orange: "bg-sk-orange-soft text-sk-orange",
  coral: "bg-sk-coral-soft text-sk-coral-dark",
  grey: "bg-muted text-muted-foreground",
};

function norm(s: string | null | undefined) {
  return (s ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

/** Shared row model — also used by the pet page header chip. */
export function useVaccinationChecklist(tenantId: string, petId: string, species?: string | null) {
  const vaxQ = usePetVaccinations(tenantId, petId);
  const typesQ = useVaccineTypes(tenantId, { activeOnly: true, species: species ?? null });
  const rulesQ = useVaccinationRules(tenantId);

  const docsQ = useQuery({
    queryKey: ["pet_vax_docs", tenantId, petId],
    enabled: Boolean(tenantId && petId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("id, file_name, type, created_at")
        .eq("tenant_id", tenantId)
        .eq("pet_id", petId)
        .eq("type", "vaccination")
        .is("archived_at", null);
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows: VaxRowState[] = useMemo(() => {
    const records = vaxQ.data ?? [];
    const types = typesQ.data ?? [];
    const requiredCodes = new Set(
      (rulesQ.data ?? [])
        .filter((r: any) => r.required !== false && (!species || !r.species || r.species === species))
        .map((r: any) => norm(r.vaccine_type)),
    );
    const docIds = new Set((docsQ.data ?? []).map((d: any) => d.id));
    const used = new Set<string>();

    const fromCatalog = types.map((t) => {
      const rec = records.find((r) => norm(r.vaccination_type) === norm(t.code) || norm(r.vaccination_type) === norm(t.name)) ?? null;
      if (rec) used.add(rec.id);
      const hasCert = Boolean(rec?.document_id && docIds.has(rec.document_id));
      const s = rec ? recordTone(rec, hasCert) : { label: requiredCodes.has(norm(t.code)) ? "Required — not provided" : "Not provided", tone: (requiredCodes.has(norm(t.code)) ? "coral" : "grey") as Tone };
      return {
        key: t.id,
        label: t.name,
        help: t.help_text,
        required: requiredCodes.has(norm(t.code)),
        record: rec,
        hasCert,
        label_status: s.label,
        tone: s.tone,
      } as VaxRowState;
    });

    const extras = records.filter((r) => !used.has(r.id)).map((r) => {
      const hasCert = Boolean(r.document_id && docIds.has(r.document_id));
      const s = recordTone(r, hasCert);
      return { key: r.id, label: r.vaccination_type, required: false, record: r, hasCert, label_status: s.label, tone: s.tone } as VaxRowState;
    });

    return [...fromCatalog, ...extras];
  }, [vaxQ.data, typesQ.data, rulesQ.data, docsQ.data, species]);

  const outstanding = rows.filter((r) => r.required && r.tone !== "green").length;
  return { rows, outstanding, isLoading: vaxQ.isLoading || typesQ.isLoading, types: typesQ.data ?? [], docs: docsQ.data ?? [] };
}

export function PetVaccinationsPanel({ tenantId, petId, species = null, canManage: canManageOverride, uploadedVia = "admin" }: Props) {
  const { hasPermission } = useCurrentUser();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const canManage = canManageOverride ?? hasPermission("pets.manage_vaccinations");
  const { rows, isLoading, types } = useVaccinationChecklist(tenantId, petId, species);
  const upsert = useUpsertPetVaccination(tenantId, petId);
  const del = useDeletePetVaccination(tenantId);
  const [editing, setEditing] = useState<{ row?: VaxRowState; type?: VaccineType } | null>(null);

  async function handleDownload(id: string) {
    try {
      const { download_url } = await getDocumentDownloadUrl(id);
      window.open(download_url, "_blank", "noopener,noreferrer");
    } catch (err) { toast.error((err as Error).message); }
  }

  return (
    <div className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="inline-flex items-center gap-2 text-sm font-semibold"><Syringe className="h-4 w-4" /> Vaccinations</h3>
        {canManage && (
          <button onClick={() => setEditing({})}
            className="inline-flex items-center gap-1 rounded-lg bg-sk-coral px-3 py-1.5 text-xs font-semibold text-white hover:bg-sk-coral-dark">
            <Plus className="h-3.5 w-3.5" /> Add other
          </button>
        )}
      </div>

      <VaxWaiverBanner petId={petId} canManage={canManage && uploadedVia === "admin"} />

      {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {!isLoading && !rows.length && <div className="text-sm text-muted-foreground">No vaccine types configured yet.</div>}

      <ul className="divide-y divide-border">
        {rows.map((r) => (
          <li key={r.key} className="flex flex-wrap items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                {r.label}
                {r.required && <span className="rounded-full bg-sk-coral-soft px-2 py-0.5 text-[10px] font-semibold uppercase text-sk-coral-dark">Required</span>}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {r.record
                  ? <>Administered {r.record.administered_date ?? "—"} · expires {r.record.expiry_date ?? "—"}{r.hasCert ? " · certificate on file" : " · no certificate"}</>
                  : (r.help || "Give us the date, expiry and a copy of the certificate.")}
              </div>
            </div>
            <span className={"inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium " + TONE_CLASS[r.tone]}>
              {r.tone === "green" ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}{r.label_status}
            </span>
            {r.record?.document_id && r.hasCert && (
              <button onClick={() => handleDownload(r.record!.document_id!)} title="Download certificate"
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><Download className="h-4 w-4" /></button>
            )}
            {canManage && (
              <>
                <button onClick={() => setEditing({ row: r, type: types.find((t) => t.id === r.key) })}
                  className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted">
                  {r.record ? "Edit" : "Provide details"}
                </button>
                {r.record && (
                  <button onClick={async () => { if (await confirm({ title: "Delete vaccination record?", confirmLabel: "Delete", tone: "destructive" })) del.mutate(r.record!.id); }}
                    className="rounded px-2 py-1 text-xs text-sk-coral-dark hover:bg-sk-coral-soft"><Trash2 className="h-3.5 w-3.5" /></button>
                )}
              </>
            )}
          </li>
        ))}
      </ul>

      {editing && (
        <VaccinationModal
          tenantId={tenantId}
          petId={petId}
          types={types}
          initialRecord={editing.row?.record ?? null}
          initialType={editing.type ?? null}
          uploadedVia={uploadedVia}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["pet_vaccinations"] });
            qc.invalidateQueries({ queryKey: ["pet_vax_docs"] });
            qc.invalidateQueries({ queryKey: ["documents_panel"] });
          }}
          upsert={upsert}
        />
      )}
    </div>
  );
}

function addMonths(dateStr: string, months: number) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function VaccinationModal({
  tenantId, petId, types, initialRecord, initialType, uploadedVia, onClose, onSaved, upsert,
}: {
  tenantId: string; petId: string; types: VaccineType[];
  initialRecord: PetVaccination | null; initialType: VaccineType | null;
  uploadedVia: "portal" | "admin";
  onClose: () => void; onSaved: () => void;
  upsert: ReturnType<typeof useUpsertPetVaccination>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [typeId, setTypeId] = useState<string>(initialType?.id ?? types.find((t) => norm(t.code) === norm(initialRecord?.vaccination_type))?.id ?? "__other");
  const [otherName, setOtherName] = useState(initialType ? "" : initialRecord?.vaccination_type ?? "");
  const [productName, setProductName] = useState(initialRecord?.product_name ?? "");
  const [administered, setAdministered] = useState(initialRecord?.administered_date ?? "");
  const [expiry, setExpiry] = useState(initialRecord?.expiry_date ?? "");
  const [notes, setNotes] = useState(initialRecord?.notes ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [phoneDoc, setPhoneDoc] = useState<{ id: string; file_name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedType = types.find((t) => t.id === typeId) ?? null;

  function onAdministered(v: string) {
    setAdministered(v);
    if (v && selectedType?.default_validity_months) setExpiry(addMonths(v, selectedType.default_validity_months));
  }

  async function save() {
    const vaccineName = selectedType ? selectedType.code : otherName.trim();
    if (!vaccineName) return toast.error("Pick a vaccine");
    setBusy(true);
    try {
      let documentId = initialRecord?.document_id ?? null;
      if (phoneDoc) documentId = phoneDoc.id;
      if (file) {
        const res = await uploadDocumentToS3({ tenantId, petId, type: "vaccination", file, uploadedVia });
        documentId = res.document_id;
      }
      await upsert.mutateAsync({
        id: initialRecord?.id,
        vaccination_type: vaccineName,
        product_name: productName.trim() || null,
        administered_date: administered || null,
        expiry_date: expiry || null,
        notes: notes.trim() || null,
        document_id: documentId,
      } as any);
      toast.success(file ? "Vaccination saved and certificate uploaded" : "Vaccination saved");
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 text-base font-semibold">{initialRecord ? "Edit vaccination" : "Add vaccination"}</div>
        <p className="mb-3 text-xs text-muted-foreground">Record the dates and attach the certificate — all in one step.</p>
        <div className="space-y-3 text-sm">
          <label className="block"><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Vaccine</div>
            <select value={typeId} onChange={(e) => setTypeId(e.target.value)} className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm">
              {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              <option value="__other">Other…</option>
            </select>
          </label>
          {!selectedType && (
            <label className="block"><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Vaccine name</div>
              <input value={otherName} onChange={(e) => setOtherName(e.target.value)} placeholder="e.g. kennel cough" className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
            </label>
          )}
          {selectedType?.help_text && <div className="rounded-lg bg-muted p-2 text-xs text-muted-foreground">{selectedType.help_text}</div>}
          <label className="block"><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Product name</div>
            <input value={productName} onChange={(e) => setProductName(e.target.value)} className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Administered</div>
              <input type="date" value={administered} onChange={(e) => onAdministered(e.target.value)} className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
            </label>
            <label className="block"><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Expires</div>
              <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
            </label>
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Certificate</div>
            <input ref={fileRef} type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <button type="button" onClick={() => fileRef.current?.click()}
              className="inline-flex w-full items-center gap-2 rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground hover:bg-muted">
              {file ? <FileText className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
              {file ? file.name : phoneDoc ? phoneDoc.file_name : initialRecord?.document_id ? "Replace certificate" : "Choose a photo or PDF of the certificate"}
            </button>
            <div className="mt-2 flex justify-end">
              <SnapUploadButton
                target={{ tenantId, petId, docType: "vaccination", label: "Vaccination certificate" }}
                onUploaded={(docs) => { if (docs?.[0]) { setPhoneDoc(docs[0]); setFile(null); } }}
              />
            </div>
          </div>
          <label className="block"><div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Notes</div>
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" />
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-border px-3 py-2 text-sm">Cancel</button>
          <button onClick={save} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-sk-coral px-3 py-2 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-50">
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
