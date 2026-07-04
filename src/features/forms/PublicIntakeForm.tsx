import { useState } from "react";
import { Check, Upload } from "lucide-react";

const steps = ["Your details", "Pet details", "Documents", "Request", "Review"];

export default function PublicIntakeForm({ title, subtitle }: { title: string; subtitle?: string }) {
  const [step, setStep] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const inputCls = "h-11 w-full rounded-xl border border-border bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-sk-coral/40";

  if (submitted) {
    return (
      <div className="sk-card p-10 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-sk-green-soft text-sk-green">
          <Check className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-2xl font-semibold">Request received</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Thanks! The Sloppy Kisses team will review and reply by email within one business day.
        </p>
      </div>
    );
  }

  return (
    <div className="sk-card">
      <div className="border-b border-border px-6 py-5">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        <ol className="mt-5 flex flex-wrap gap-2">
          {steps.map((s, i) => (
            <li key={s} className={"flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium " + (i === step ? "border-sk-coral bg-sk-coral-soft text-sk-coral-dark" : "border-border text-muted-foreground")}>
              <span className="grid h-5 w-5 place-items-center rounded-full bg-white text-[10px] font-semibold">{i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
      </div>

      <div className="space-y-4 p-6">
        {step === 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block"><span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">First name</span><input className={inputCls} /></label>
            <label className="block"><span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">Last name</span><input className={inputCls} /></label>
            <label className="block"><span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">Email</span><input type="email" className={inputCls} /></label>
            <label className="block"><span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">Phone</span><input className={inputCls} /></label>
          </div>
        )}
        {step === 1 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block"><span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">Pet name</span><input className={inputCls} /></label>
            <label className="block"><span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">Breed</span><input className={inputCls} /></label>
            <label className="block"><span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">Age</span><input className={inputCls} /></label>
            <label className="block"><span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">Sex</span><select className={inputCls}><option>Male</option><option>Female</option></select></label>
          </div>
        )}
        {step === 2 && (
          <div className="rounded-xl border border-dashed border-border p-8 text-center">
            <Upload className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">Upload vaccination records</p>
            <p className="text-xs text-muted-foreground">PDF or image, up to 10 MB</p>
          </div>
        )}
        {step === 3 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block sm:col-span-2"><span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">Preferred dates / times</span><input className={inputCls} placeholder="e.g. Thu 10 Jul, 09:00" /></label>
            <label className="block sm:col-span-2"><span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">Additional notes</span><textarea rows={4} className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sk-coral/40" /></label>
          </div>
        )}
        {step === 4 && (
          <label className="flex items-start gap-3 rounded-xl border border-border bg-sk-surface-muted p-4 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-border text-sk-coral focus:ring-sk-coral" />
            <span>I acknowledge the Sloppy Kisses terms and confirm my pet's vaccinations are up to date.</span>
          </label>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-border bg-sk-surface-muted px-6 py-4">
        <button
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className="h-10 rounded-xl border border-border bg-white px-4 text-sm font-medium disabled:opacity-40 hover:bg-muted"
        >
          Back
        </button>
        {step < steps.length - 1 ? (
          <button onClick={() => setStep((s) => s + 1)} className="h-10 rounded-xl bg-sk-coral px-5 text-sm font-semibold text-white hover:bg-sk-coral-dark">
            Continue
          </button>
        ) : (
          <button onClick={() => setSubmitted(true)} className="h-10 rounded-xl bg-sk-coral px-5 text-sm font-semibold text-white hover:bg-sk-coral-dark">
            Submit request
          </button>
        )}
      </div>
    </div>
  );
}