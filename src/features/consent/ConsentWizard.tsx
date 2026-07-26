import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import type { ConsentCustomer, ConsentStatus, TermsVersion } from "./consentQueries";

type Props = {
  status: ConsentStatus;
  onDone: () => void;
};

const FIELD_LABELS: Record<string, string> = {
  mobile: "Mobile number",
  address_line_1: "Street address",
  suburb: "Suburb",
  city: "City",
  id_number: "SA ID / passport number",
  employer: "Employer / workplace",
  emergency_contact_name: "Emergency contact — name",
  emergency_contact_mobile: "Emergency contact — mobile",
  emergency_contact_relationship: "Emergency contact — relationship",
  vet_clinic_name: "Vet — clinic name",
  vet_clinic_contact: "Vet — clinic phone",
  vet_clinic_address: "Vet — clinic address",
};

const KIND_LABEL: Record<string, string> = {
  terms: "Terms & Conditions",
  registration: "Daycare Registration",
};

export default function ConsentWizard({ status, onDone }: Props) {
  const qc = useQueryClient();
  const customer = status.customer!;
  const outstanding = status.currentVersions.filter((v) => !status.acceptedVersionIds.has(v.id));
  const needsFields = status.missingFields.length > 0;

  // Steps: [fields?, ...outstanding versions]
  const steps = useMemo(() => {
    const s: Array<{ kind: "fields" } | { kind: "version"; v: TermsVersion }> = [];
    if (needsFields) s.push({ kind: "fields" });
    outstanding.forEach((v) => s.push({ kind: "version", v }));
    return s;
  }, [needsFields, outstanding]);

  const [stepIdx, setStepIdx] = useState(0);
  const step = steps[stepIdx];

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

  const saveFields = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("customers")
        .update(fieldValues as any)
        .eq("id", customer.id);
      if (error) throw error;
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
    onSuccess: () => {
      if (stepIdx + 1 >= steps.length) {
        toast.success("Thank you — your account is now active.");
        qc.invalidateQueries({ queryKey: ["consent_status"] });
        onDone();
      } else {
        setStepIdx((i) => i + 1);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!step) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="sk-card flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden">
        <div className="border-b p-5">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Welcome {customer.first_name ?? ""} — one-off setup
          </div>
          <div className="mt-1 text-lg font-semibold">
            {step.kind === "fields" ? "A few details we still need" : KIND_LABEL[step.v.kind] ?? step.v.kind}
            {step.kind === "version" && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">v{step.v.version}</span>
            )}
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full ${
                  i < stepIdx ? "bg-sk-coral" : i === stepIdx ? "bg-sk-coral/60" : "bg-muted"
                }`}
              />
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {step.kind === "fields" ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                We're moving from paper forms to a new online system. Please confirm or complete the
                details below — this is a one-off. You can edit anything later in your profile.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {status.missingFields.map((f) => (
                  <label key={f} className="flex flex-col gap-1 text-sm">
                    <span className="font-medium">
                      {FIELD_LABELS[f] ?? f} <span className="text-red-500">*</span>
                    </span>
                    <input
                      value={String((fieldValues as any)[f] ?? "")}
                      onChange={(e) =>
                        setFieldValues((s) => ({ ...s, [f]: e.target.value } as any))
                      }
                      className="rounded-md border px-3 py-2"
                    />
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {step.v.title && (
                <h3 className="text-base font-semibold">{step.v.title}</h3>
              )}
              <div className="max-h-[45vh] overflow-auto rounded-md border bg-muted/30 p-4 text-sm whitespace-pre-wrap">
                {step.v.body_markdown || "(No content yet — please contact the office.)"}
              </div>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">
                  Type your full name to accept <span className="text-red-500">*</span>
                </span>
                <input
                  value={signatureName}
                  onChange={(e) => setSignatureName(e.target.value)}
                  className="rounded-md border px-3 py-2"
                  placeholder="Your full legal name"
                />
                <span className="text-xs text-muted-foreground">
                  By typing your name you accept these terms. We record your name, the date and time,
                  and your device — the equivalent of a signature.
                </span>
              </label>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t p-4">
          <div className="text-xs text-muted-foreground">
            Step {stepIdx + 1} of {steps.length}
          </div>
          <button
            type="button"
            className="sk-btn sk-btn-primary"
            disabled={saveFields.isPending || acceptVersion.isPending}
            onClick={() => {
              if (step.kind === "fields") {
                // Validate required
                const still = status.missingFields.filter(
                  (f) => !String((fieldValues as any)[f] ?? "").trim(),
                );
                if (still.length > 0) {
                  toast.error("Please complete all required fields.");
                  return;
                }
                saveFields.mutate();
              } else {
                if (!signatureName.trim()) {
                  toast.error("Please type your full name to sign.");
                  return;
                }
                acceptVersion.mutate(step.v);
              }
            }}
          >
            {(saveFields.isPending || acceptVersion.isPending) && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {stepIdx + 1 >= steps.length ? (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Accept & finish
              </>
            ) : (
              "Continue"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}