// Verifies an invite/recovery/magiclink token_hash coming from a tenant-hosted
// URL like /auth/accept?token_hash=…&type=invite&next=/reset-password.
// Keeps the visible URL on the tenant's own domain — Supabase never appears
// in the email.
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { Logo } from "@/components/layout/Logo";

type OtpType = "invite" | "recovery" | "magiclink" | "signup" | "email_change";

export default function AuthAccept() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const tokenHash = params.get("token_hash");
    const type = (params.get("type") ?? "invite") as OtpType;
    const next = params.get("next") || "/reset-password";
    if (!tokenHash) {
      setError("This link is missing its verification token.");
      return;
    }
    (async () => {
      const { error: err } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
      if (err) {
        setError(err.message.includes("expired") ? "This link has expired. Please request a new one." : err.message);
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
            <Link to="/forgot-password" className="text-xs font-medium text-sk-coral hover:underline">
              Request a new link
            </Link>
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