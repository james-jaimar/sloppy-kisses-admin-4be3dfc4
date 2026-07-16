// Verifies an invite/recovery/magiclink token_hash coming from a tenant-hosted
// URL like /auth/accept?token_hash=…&type=invite&next=/reset-password.
// Keeps the visible URL on the tenant's own domain — Supabase never appears
// in the email.
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { Logo } from "@/components/layout/Logo";

type OtpType = "invite" | "recovery" | "magiclink" | "signup" | "email_change";

export default function AuthAccept() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    const tokenHash = params.get("token_hash");
    const type = (params.get("type") ?? "invite") as OtpType;
    const next = params.get("next") || "/reset-password";
    if (!tokenHash) {
      setError("This link is missing its verification token.");
      return;
    }
    (async () => {
      // If we're already signed in (e.g. this link was clicked once already
      // and consumed), skip verify entirely and continue to `next`.
      const { data: pre } = await supabase.auth.getSession();
      if (pre.session) {
        navigate(next, { replace: true });
        return;
      }

      const { error: err } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
      if (err) {
        // Race: verifyOtp may fail with "expired / not found" if the token was
        // just consumed by a duplicate mount. If a session now exists, treat
        // as success.
        const { data: post } = await supabase.auth.getSession();
        if (post.session) {
          navigate(next, { replace: true });
          return;
        }
        const msg = err.message || "";
        const isExpired = /expired|not found/i.test(msg);
        setError(
          isExpired
            ? "This link has already been used or has expired. If you've already set your password, sign in below."
            : msg,
        );
        return;
      }
      navigate(next, { replace: true });
    })();
  }, [params, navigate]);

  return (
    <div className="grid min-h-screen place-items-center bg-sk-bg px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-white p-8 text-center shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-3">
          <Logo />
          <h1 className="text-lg font-semibold">
            {error ? "Link problem" : "Verifying your link…"}
          </h1>
        </div>
        {error ? (
          <>
            <div className="mb-4 rounded-lg bg-sk-red-soft px-3 py-3 text-sm text-sk-coral-dark">{error}</div>
            <div className="flex flex-col gap-2">
              <Link to="/login" className="text-xs font-medium text-sk-coral hover:underline">
                Go to sign in
              </Link>
              <Link to="/forgot-password" className="text-xs text-muted-foreground hover:underline">
                Request a new link
              </Link>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Just a moment
          </div>
        )}
      </div>
    </div>
  );
}