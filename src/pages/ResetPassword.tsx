import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { Logo } from "@/components/layout/Logo";

function homeFor(userType: string | null | undefined): string {
  if (userType === "customer") return "/customer/dashboard";
  if (userType === "platform") return "/platform";
  return "/admin/dashboard";
}

export default function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [validLink, setValidLink] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Supabase parses the recovery hash and fires PASSWORD_RECOVERY.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setValidLink(true);
        setReady(true);
      }
    });
    // Fallback: if a session already exists (e.g. after hash was parsed before listener attached).
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setValidLink(true);
      setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("Passwords do not match.");
    setSubmitting(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) {
      setSubmitting(false);
      setError(err.message);
      return;
    }
    // Keep the session — the user is already authenticated via the invite/
    // recovery link and forcing sign-out here bounces invitees back to /login
    // and makes the flow feel broken. Route them straight to their area.
    const { data: userRes } = await supabase.auth.getUser();
    let userType: string | null = null;
    if (userRes?.user?.id) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("user_type")
        .eq("auth_user_id", userRes.user.id)
        .maybeSingle();
      userType = (prof?.user_type as string | null) ?? null;
    }
    navigate(homeFor(userType), { replace: true });
  }

  return (
    <div className="grid min-h-screen place-items-center bg-sk-bg px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-white p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Logo />
          <div>
            <h1 className="text-lg font-semibold">Choose a new password</h1>
            <p className="text-xs text-muted-foreground">At least 8 characters.</p>
          </div>
        </div>
        {!ready ? (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Verifying link…
          </div>
        ) : !validLink ? (
          <div className="space-y-4 text-sm">
            <div className="rounded-lg bg-sk-red-soft px-3 py-3 text-sk-coral-dark">
              This reset link is invalid or has expired.
            </div>
            <Link to="/forgot-password" className="block text-center text-xs font-medium text-sk-coral hover:underline">
              Request a new link
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">New password</span>
              <input
                type="password"
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-10 w-full rounded-xl border border-border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-sk-coral/40"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Confirm password</span>
              <input
                type="password"
                required
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
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
              Update password
            </button>
          </form>
        )}
      </div>
    </div>
  );
}