import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth/AuthContext";
import { Logo } from "@/components/layout/Logo";
import { Loader2 } from "lucide-react";

export default function Login() {
  const { authUser, loading, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { from?: string; justReset?: boolean } | null;
  const from = state?.from ?? "/admin/dashboard";
  const justReset = state?.justReset ?? false;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && authUser) navigate(from, { replace: true });
  }, [loading, authUser, from, navigate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error: err } = await signIn(email.trim(), password);
    setSubmitting(false);
    if (err) setError(err);
  }

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-sk-bg text-sm text-muted-foreground">
        <div className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading session…</div>
      </div>
    );
  }

  if (authUser) return <Navigate to={from} replace />;

  return (
    <div className="grid min-h-screen place-items-center bg-sk-bg px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-white p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Logo />
          <div>
            <h1 className="text-lg font-semibold">Sign in</h1>
            <p className="text-xs text-muted-foreground">Sloppy Kisses operations</p>
          </div>
        </div>
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
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Password</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-10 w-full rounded-xl border border-border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-sk-coral/40"
            />
          </label>
          {error && (
            <div className="rounded-lg bg-sk-red-soft px-3 py-2 text-xs text-sk-coral-dark">{error}</div>
          )}
          {justReset && !error && (
            <div className="rounded-lg bg-sk-turquoise-soft/60 px-3 py-2 text-xs text-sk-turquoise-dark">
              Password updated. Please sign in with your new password.
            </div>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-sk-coral text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-60"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Sign in
          </button>
          <Link
            to="/forgot-password"
            className="block pt-2 text-center text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Forgot your password?
          </Link>
        </form>
      </div>
    </div>
  );
}