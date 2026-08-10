import { useState, type FormEvent } from "react";
import { Loader2, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/AuthContext";
import { toast } from "@/hooks/use-toast";

export default function ChangePasswordPage() {
  const { authUser } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!authUser?.email) return setError("No signed-in user.");
    if (next.length < 8) return setError("New password must be at least 8 characters.");
    if (next !== confirm) return setError("New passwords do not match.");

    setSubmitting(true);
    // Re-verify current password.
    const { error: verifyErr } = await supabase.auth.signInWithPassword({
      email: authUser.email,
      password: current,
    });
    if (verifyErr) {
      setSubmitting(false);
      setError("Current password is incorrect.");
      return;
    }
    const { error: updateErr } = await supabase.auth.updateUser({ password: next });
    setSubmitting(false);
    if (updateErr) {
      setError(updateErr.message);
      return;
    }
    setCurrent("");
    setNext("");
    setConfirm("");
    toast({ title: "Password updated", description: "Your password has been changed." });
  }

  return (
    <div className="mx-auto max-w-lg p-6">
      <div className="mb-6">
        <Link to="/admin/settings" className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to settings
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Change password</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Update the password for {authUser?.email}.</p>
      </div>
      <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-border bg-white p-6 shadow-sm">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Current password</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className="h-10 w-full rounded-xl border border-border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-sk-coral/40"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">New password</span>
          <input
            type="password"
            required
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            className="h-10 w-full rounded-xl border border-border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-sk-coral/40"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Confirm new password</span>
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
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-sk-coral px-5 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-60"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          Update password
        </button>
      </form>
    </div>
  );
}