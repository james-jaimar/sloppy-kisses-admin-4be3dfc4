import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { Logo } from "@/components/layout/Logo";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSubmitting(false);
    // Show generic success regardless of whether the email exists (avoid account enumeration).
    if (err && err.message.toLowerCase().includes("rate")) {
      setError(err.message);
      return;
    }
    setSent(true);
  }

  return (
    <div className="grid min-h-screen place-items-center bg-sk-bg px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-white p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Logo />
          <div>
            <h1 className="text-lg font-semibold">Reset your password</h1>
            <p className="text-xs text-muted-foreground">We'll email you a secure link.</p>
          </div>
        </div>
        {sent ? (
          <div className="space-y-4 text-sm">
            <div className="rounded-lg bg-sk-turquoise-soft/60 px-3 py-3 text-sk-turquoise-dark">
              If an account exists for <span className="font-medium">{email}</span>, a reset link is on its way. Check your inbox (and spam).
            </div>
            <Link to="/login" className="block text-center text-xs font-medium text-sk-coral hover:underline">
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Email</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-10 w-full rounded-xl border border-border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-sk-coral/40"
              />
            </label>
            {error && (
              <div className="rounded-lg bg-sk-red-soft px-3 py-2 text-xs text-sk-coral-dark">{error}</div>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-sk-coral text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-60"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Send reset link
            </button>
            <Link to="/login" className="block pt-2 text-center text-xs font-medium text-muted-foreground hover:text-foreground">
              Back to sign in
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}