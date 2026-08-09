import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, CheckCircle2, PawPrint, ArrowRight, Clock, ShieldCheck, X } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/lib/supabase/client";
import AddressField from "@/components/address/AddressField";
import type { ConsentCustomer, ConsentStatus, TermsVersion } from "./consentQueries";

type Props = {
  status: ConsentStatus;
  onDone: () => void;
  onDismiss?: () => void;
  fullPage?: boolean;
};

type FieldMeta = { key: string; label: string; hint?: string };
type FieldSection = { title: string; help?: string; fields: FieldMeta[] };

const FIELD_SECTIONS: FieldSection[] = [
  {
    title: "Contact",
    fields: [{ key: "mobile", label: "Mobile number", hint: "So we can reach you quickly if needed." }],
  },
  {
    title: "Identity",
    help: "Required for our client register. Kept private and only used for identification.",
    fields: [
      { key: "id_number", label: "SA ID / passport number" },
      { key: "employer", label: "Employer / workplace" },
    ],
  },
  {
    title: "Emergency contact",
    help: "Someone we can call if we can't reach you.",
    fields: [
      { key: "emergency_contact_name", label: "Name" },
      { key: "emergency_contact_mobile", label: "Mobile" },
      { key: "emergency_contact_relationship", label: "Relationship" },
    ],
  },
  {
    title: "Your vet",
    help: "Used only if your pet needs urgent care while in our care.",
    fields: [
      { key: "vet_clinic_name", label: "Clinic name" },
      { key: "vet_clinic_contact", label: "Clinic phone" },
      { key: "vet_clinic_address", label: "Clinic address" },
    ],
  },
];

const ADDRESS_KEYS = ["address_line_1", "suburb", "city"];

const KIND_LABEL: Record<string, string> = {
  terms: "Terms & Conditions",
  registration: "Daycare Registration",
};

/** Ultra-light markdown renderer — headings, bold, lists, paragraphs. */
function MarkdownBlock({ source }: { source: string }) {
  const lines = (source || "").split(/\r?\n/);
  const out: React.ReactNode[] = [];
  let listBuf: string[] = [];
  const flushList = (key: string) => {
    if (listBuf.length === 0) return;
    out.push(
      <ul key={`ul-${key}`} className="mb-3 list-disc space-y-1 pl-6">
        {listBuf.map((li, i) => (
          <li key={i} dangerouslySetInnerHTML={{ __html: inline(li) }} />
        ))}
      </ul>,
    );
    listBuf = [];
  };
  const inline = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>");
  lines.forEach((raw, idx) => {
    const line = raw.trimEnd();
    if (/^\s*[-*]\s+/.test(line)) {
      listBuf.push(line.replace(/^\s*[-*]\s+/, ""));
      return;
    }
    flushList(String(idx));
    if (!line.trim()) return;
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const text = h[2];
      if (level === 1)
        out.push(<h3 key={idx} className="mb-2 mt-4 text-lg font-semibold" dangerouslySetInnerHTML={{ __html: inline(text) }} />);
      else if (level === 2)
        out.push(<h4 key={idx} className="mb-2 mt-4 text-base font-semibold" dangerouslySetInnerHTML={{ __html: inline(text) }} />);
      else
        out.push(<h5 key={idx} className="mb-1 mt-3 text-sm font-semibold" dangerouslySetInnerHTML={{ __html: inline(text) }} />);
      return;
    }
    out.push(<p key={idx} className="mb-3 leading-relaxed" dangerouslySetInnerHTML={{ __html: inline(line) }} />);
  });
  flushList("end");
  return <div className="text-sm">{out}</div>;
}

export default function ConsentWizard({ status, onDone, onDismiss, fullPage = false }: Props) {
  const qc = useQueryClient();
  const customer = status.customer!;
  const outstanding = status.currentVersions.filter((v) => !status.acceptedVersionIds.has(v.id));
  const needsFields = status.missingFields.length > 0;
  const canDismiss = !!onDismiss && status.mode === "soft";

  // Steps: [intro, fields?, ...outstanding versions, done]
  const steps = useMemo(() => {
    const s: Array<{ kind: "intro" } | { kind: "fields" } | { kind: "version"; v: TermsVersion } | { kind: "done" }> = [];
    s.push({ kind: "intro" });
    if (needsFields) s.push({ kind: "fields" });
    outstanding.forEach((v) => s.push({ kind: "version", v }));
    s.push({ kind: "done" });
    return s;
  }, [needsFields, outstanding]);

  const [stepIdx, setStepIdx] = useState(0);
  const step = steps[stepIdx];
  const isLastActionable = step?.kind === "version"
    ? !steps.slice(stepIdx + 1).some((s) => s.kind === "version" || s.kind === "fields")
    : false;

  const stepTitle = (i: number) => {
    const s = steps[i];
    if (!s) return "";
    if (s.kind === "intro") return "Welcome";
    if (s.kind === "fields") return "Your details";
    if (s.kind === "version") return KIND_LABEL[s.v.kind] ?? s.v.kind;
    return "All done";
  };

  const [fieldValues, setFieldValues] = useState<Partial<ConsentCustomer>>({
    mobile: customer.mobile ?? "",
    address_line_1: customer.address_line_1 ?? "",
    suburb: customer.suburb ?? "",
    city: customer.city ?? "",
    id_number: customer.id_number ?? "",
    employer: customer.employer ?? "",
    emergency_contact_name: customer.emergency_contact_name ?? "",
    emergency_contact_mobile: customer.emergency_contact_mobile ?? "",
    emergency_contact_relationship: customer.emergency_contact_relationship ?? "",
    vet_clinic_name: customer.vet_clinic_name ?? "",
    vet_clinic_contact: customer.vet_clinic_contact ?? "",
    vet_clinic_address: customer.vet_clinic_address ?? "",
  });

  const [signatureName, setSignatureName] = useState(customer.full_name ?? "");
  const now = new Date();

  const needsAddress = ADDRESS_KEYS.some((k) => status.missingFields.includes(k));
  const [addr, setAddr] = useState<Record<string, any>>({
    address_line_1: customer.address_line_1 ?? "",
    address_line_2: "",
    suburb: customer.suburb ?? "",
    city: customer.city ?? "",
    province: "",
    postcode: "",
    country_code: "ZA",
    formatted_address: "",
    google_place_id: "",
    latitude: null,
    longitude: null,
  });

  const saveFields = useMutation({
    mutationFn: async () => {
      const legacy = needsAddress
        ? {
            address_line_1: addr.address_line_1 || null,
            address_line_2: addr.address_line_2 || null,
            suburb: addr.suburb || null,
            city: addr.city || null,
            province: addr.province || null,
            postcode: addr.postcode || null,
          }
        : {};
      const { error } = await supabase
        .from("customers")
        .update({ ...(fieldValues as any), ...legacy })
        .eq("id", customer.id);
      if (error) throw error;

      if (needsAddress) {
        // Keep the canonical address book in sync so vans/routing use the same record.
        const { error: addrErr } = await supabase.from("customer_addresses").insert({
          tenant_id: customer.tenant_id,
          customer_id: customer.id,
          label: "Home",
          address_type: "home",
          is_primary: true,
          ...addr,
          formatted_address:
            addr.formatted_address ||
            [addr.address_line_1, addr.suburb, addr.city, addr.province, addr.postcode]
              .filter(Boolean)
              .join(", "),
          google_place_id: addr.google_place_id || null,
        } as any);
        if (addrErr) throw addrErr;
      }
    },
    onSuccess: () => setStepIdx((i) => i + 1),
    onError: (e: Error) => toast.error(e.message),
  });

  const acceptVersion = useMutation({
    mutationFn: async (v: TermsVersion) => {
      if (!signatureName.trim()) throw new Error("Please type your full name to sign.");
      const { error } = await supabase.from("customer_consents").insert({
        tenant_id: customer.tenant_id,
        customer_id: customer.id,
        version_id: v.id,
        version_label: `${v.kind} v${v.version}`,
        kind: v.kind,
        signature_name: signatureName.trim(),
        user_agent: navigator.userAgent,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => setStepIdx((i) => i + 1),
    onError: (e: Error) => toast.error(e.message),
  });

  if (!step) return null;

  const advance = () => {
    if (step.kind === "intro") {
      setStepIdx((i) => i + 1);
      return;
    }
    if (step.kind === "fields") {
      const still = status.missingFields.filter((f) =>
        ADDRESS_KEYS.includes(f)
          ? !String(addr[f] ?? "").trim()
          : !String((fieldValues as any)[f] ?? "").trim()
      );
      if (still.length > 0) {
        toast.error("Please complete all required fields.");
        return;
      }
      saveFields.mutate();
      return;
    }
    if (step.kind === "version") {
      if (!signatureName.trim()) {
        toast.error("Please type your full name to sign.");
        return;
      }
      acceptVersion.mutate(step.v);
      return;
    }
    // done
    toast.success("Thank you — you're all set.");
    qc.invalidateQueries({ queryKey: ["consent_status"] });
    onDone();
  };

  const container = fullPage
    ? "min-h-[calc(100vh-4rem)] flex items-start justify-center p-4 md:p-8"
    : "fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-2 sm:p-4";

  const card = fullPage
    ? "w-full max-w-3xl"
    : "flex max-h-[96vh] w-full max-w-3xl flex-col overflow-hidden";

  return (
    <div className={container}>
      <div className={`sk-card ${card} shadow-2xl`}>
        {/* Header */}
        <div className="relative flex items-start gap-4 border-b border-border bg-gradient-to-br from-sk-coral-soft/60 to-white p-5 sm:p-6">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-sk-coral text-white shadow-sm">
            <PawPrint className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-sk-coral-dark">
              Sloppy Kisses · Digital registration
            </div>
            <h2 className="mt-0.5 text-lg font-semibold sm:text-xl">{stepTitle(stepIdx)}</h2>
          </div>
          {canDismiss && step.kind !== "done" && (
            <button
              type="button"
              onClick={onDismiss}
              className="rounded-full p-1.5 text-muted-foreground hover:bg-muted"
              aria-label="Remind me later"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Progress */}
        <div className="border-b border-border px-5 py-3 sm:px-6">
          <div className="flex items-center gap-1.5">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  i < stepIdx ? "bg-sk-coral" : i === stepIdx ? "bg-sk-coral/70" : "bg-muted"
                }`}
              />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-medium text-muted-foreground">
            {steps.map((_, i) => (
              <span key={i} className={i === stepIdx ? "text-sk-coral-dark" : ""}>
                {i + 1}. {stepTitle(i)}
              </span>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className={fullPage ? "p-5 sm:p-6" : "flex-1 overflow-auto p-5 sm:p-6"}>
          {step.kind === "intro" && (
            <div className="space-y-4">
              <p className="text-lg font-medium">
                Welcome{customer.first_name ? `, ${customer.first_name}` : ""} 🐾
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                You've trusted us with your pets for a while — thank you. We're moving off paper and into
                this new portal so bookings, invoices, vaccinations and messages all live in one place.
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Your original signed registration and terms are safely on file — this is simply the
                digital equivalent. Nothing changes about the care your pets receive from us.
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-border bg-sk-surface-muted p-3">
                  <div className="flex items-center gap-2 text-sm font-semibold"><Clock className="h-4 w-4 text-sk-coral" /> 3–4 minutes</div>
                  <div className="mt-1 text-xs text-muted-foreground">Confirm a few details and sign digitally.</div>
                </div>
                <div className="rounded-xl border border-border bg-sk-surface-muted p-3">
                  <div className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-sk-turquoise-dark" /> Kept private</div>
                  <div className="mt-1 text-xs text-muted-foreground">Your information is only used for your pets' care.</div>
                </div>
                <div className="rounded-xl border border-border bg-sk-surface-muted p-3">
                  <div className="flex items-center gap-2 text-sm font-semibold"><CheckCircle2 className="h-4 w-4 text-sk-green" /> Save anytime</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {status.mode === "soft" && status.daysRemaining !== null
                      ? `You have ${status.daysRemaining} day${status.daysRemaining === 1 ? "" : "s"} to finish.`
                      : "Please complete now to keep booking."}
                  </div>
                </div>
              </div>
            </div>
          )}

          {step.kind === "fields" && (
            <div className="space-y-6">
              <p className="text-sm text-muted-foreground">
                Please confirm or complete the details below. Anything you enter here you can edit
                later from your profile.
              </p>
              {FIELD_SECTIONS.map((sec) => {
                const secFields = sec.fields.filter((f) => status.missingFields.includes(f.key));
                if (secFields.length === 0) return null;
                return (
                  <div key={sec.title} className="space-y-2">
                    <div>
                      <h3 className="text-sm font-semibold">{sec.title}</h3>
                      {sec.help && <p className="text-xs text-muted-foreground">{sec.help}</p>}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {secFields.map((f) => (
                        <label key={f.key} className="flex flex-col gap-1 text-sm">
                          <span className="font-medium">
                            {f.label} <span className="text-red-500">*</span>
                          </span>
                          <input
                            value={String((fieldValues as any)[f.key] ?? "")}
                            onChange={(e) =>
                              setFieldValues((s) => ({ ...s, [f.key]: e.target.value } as any))
                            }
                            className="rounded-md border border-border bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sk-coral/40"
                          />
                          {f.hint && <span className="text-[11px] text-muted-foreground">{f.hint}</span>}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {step.kind === "version" && (
            <div className="space-y-4">
              <div>
                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {KIND_LABEL[step.v.kind] ?? step.v.kind} · v{step.v.version}
                </div>
                {step.v.title && <h3 className="mt-1 text-base font-semibold">{step.v.title}</h3>}
              </div>
              <div className="max-h-[45vh] overflow-auto rounded-lg border border-border bg-sk-surface-muted p-4">
                {step.v.body_markdown ? (
                  <MarkdownBlock source={step.v.body_markdown} />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    (No content yet — please contact the office.)
                  </p>
                )}
              </div>
              <div className="rounded-lg border border-dashed border-sk-coral/40 bg-sk-coral-soft/30 p-4">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">
                    Type your full name to sign <span className="text-red-500">*</span>
                  </span>
                  <input
                    value={signatureName}
                    onChange={(e) => setSignatureName(e.target.value)}
                    className="rounded-md border border-border bg-white px-3 py-2 font-serif italic focus:outline-none focus:ring-2 focus:ring-sk-coral/40"
                    placeholder="Your full legal name"
                  />
                </label>
                {signatureName.trim() && (
                  <div className="mt-2 text-[11px] text-muted-foreground">
                    Signed by <span className="font-medium text-foreground">{signatureName.trim()}</span>{" "}
                    on {format(now, "dd MMM yyyy 'at' HH:mm")} · recorded with your device details
                  </div>
                )}
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Typing your name has the same legal effect as a written signature.
                </p>
              </div>
            </div>
          )}

          {step.kind === "done" && (
            <div className="space-y-4 py-6 text-center">
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-sk-green-soft text-sk-green">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <div>
                <h3 className="text-xl font-semibold">All set — thank you!</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Your digital registration is complete. Welcome to the Sloppy Kisses portal.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col-reverse items-stretch justify-between gap-2 border-t border-border p-4 sm:flex-row sm:items-center">
          <div className="text-xs text-muted-foreground">
            Step {stepIdx + 1} of {steps.length}
            {status.mode === "soft" && status.daysRemaining !== null && step.kind !== "done" && (
              <span className="ml-2 hidden sm:inline">
                · {status.daysRemaining} day{status.daysRemaining === 1 ? "" : "s"} to finish
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {canDismiss && step.kind !== "done" && (
              <button type="button" className="sk-btn sk-btn-ghost" onClick={onDismiss}>
                Remind me later
              </button>
            )}
            <button
              type="button"
              className="sk-btn sk-btn-primary"
              disabled={saveFields.isPending || acceptVersion.isPending}
              onClick={advance}
            >
              {(saveFields.isPending || acceptVersion.isPending) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {step.kind === "intro" && (<>Start now <ArrowRight className="ml-2 h-4 w-4" /></>)}
              {step.kind === "fields" && (<>Continue <ArrowRight className="ml-2 h-4 w-4" /></>)}
              {step.kind === "version" && (
                isLastActionable
                  ? (<><CheckCircle2 className="mr-2 h-4 w-4" /> Accept &amp; finish</>)
                  : (<>Accept &amp; continue <ArrowRight className="ml-2 h-4 w-4" /></>)
              )}
              {step.kind === "done" && (<>Go to dashboard <ArrowRight className="ml-2 h-4 w-4" /></>)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}