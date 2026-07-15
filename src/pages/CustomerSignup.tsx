import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { Logo } from "@/components/layout/Logo";
import loginBg from "@/assets/login-dogs.jpg.asset.json";

export default function CustomerSignup() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const tenantSlug = params.get("tenant") ?? "";
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "", mobile: "", password: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.password.length < 8) { setError("Password must be at least 8 characters."); return; }
    setSubmitting(true);
    const { data, error: err } = await supabase.functions.invoke("customer-signup", {
      body: { ...form, tenant_slug: tenantSlug || undefined },
    });
    setSubmitting(false);
    if (err || (data as any)?.error) {
      const msg = (data as any)?.error ?? err?.message ?? "Signup failed";
      const friendly = msg === "email_already_registered" ? "That email is already registered — try signing in instead."
        : msg === "tenant_not_found" ? "We couldn't find the business you're signing up to."
        : msg === "password_too_short" ? "Password must be at least 8 characters."
        : msg === "invalid_email" ? "That doesn't look like a valid email."
        : msg === "name_required" ? "Please enter your first and last name."
        : msg;
      setError(friendly);
      return;
    }
    setDone(true);
    setTimeout(() => navigate("/login", { replace: true, state: { justSignedUp: true } }), 3500);
  }

  return (
    <div
      className="relative grid min-h-screen place-items-center px-4 bg-sk-bg bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: `url(${loginBg.url})` }}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/10 to-black/40" aria-hidden />
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-white/95 backdrop-blur p-8 shadow-xl">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Logo />
          <div>
            <h1 className="text-lg font-semibold">Create your account</h1>
            <p className="text-xs text-muted-foreground">Sign up to book, view invoices and manage your pets.</p>
          </div>
        </div>

        {done ? (
          <div className="space-y-3 text-center text-sm">
            <div className="rounded-lg bg-sk-turquoise-soft/60 px-3 py-3 text-sk-turquoise-dark">
              Thanks — your account has been created and is awaiting review by our team. You can sign in now, and we'll be in touch shortly.
            </div>
            <Link to="/login" className="inline-block text-xs font-medium text-sk-coral-dark hover:underline">Go to sign in →</Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="First name" value={form.first_name} onChange={(v) => setForm({ ...form, first_name: v })} required />
              <Field label="Last name" value={form.last_name} onChange={(v) => setForm({ ...form, last_name: v })} required />
            </div>
            <Field label="Email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} required autoComplete="email" />
            <Field label="Mobile" value={form.mobile} onChange={(v) => setForm({ ...form, mobile: v })} placeholder="+27…" />
            <Field label="Password" type="password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} required autoComplete="new-password" />

            {error && <div className="rounded-lg bg-sk-red-soft px-3 py-2 text-xs text-sk-coral-dark">{error}</div>}

            <button
              type="submit"
              disabled={submitting}
              className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-sk-coral text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-60"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Create account
            </button>
            <Link to="/login" className="block pt-2 text-center text-xs font-medium text-muted-foreground hover:text-foreground">
              Already have an account? Sign in
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", required, autoComplete, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string;
  required?: boolean; autoComplete?: string; placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      <input
        type={type}
        required={required}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-xl border border-border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-sk-coral/40"
      />
    </label>
  );
}