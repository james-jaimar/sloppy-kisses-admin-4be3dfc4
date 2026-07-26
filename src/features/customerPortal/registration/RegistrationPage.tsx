import { useNavigate } from "react-router-dom";
import { Loader2, CheckCircle2 } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { useConsentStatus } from "@/features/consent/consentQueries";
import ConsentWizard from "@/features/consent/ConsentWizard";

export default function RegistrationPage() {
  const q = useConsentStatus();
  const navigate = useNavigate();

  if (q.isLoading) {
    return (
      <div className="grid flex-1 place-items-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const status = q.data;

  if (!status?.customer) {
    return (
      <>
        <AppHeader title="Registration" />
        <div className="p-6 text-sm text-muted-foreground">No customer profile linked to your account.</div>
      </>
    );
  }

  if (!status.needsWizard) {
    return (
      <>
        <AppHeader title="Registration" subtitle="Your digital registration is complete." />
        <div className="flex-1 p-6">
          <div className="sk-card mx-auto max-w-lg p-8 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-sk-green-soft text-sk-green">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <h2 className="mt-4 text-lg font-semibold">You're all set</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Thanks for completing your registration — nothing more to do here.
            </p>
            <button
              type="button"
              className="sk-btn sk-btn-primary mt-5"
              onClick={() => navigate("/customer/dashboard")}
            >
              Back to dashboard
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <AppHeader
        title="Digital registration"
        subtitle="A one-off setup — takes just a few minutes."
      />
      <div className="flex-1 p-4 md:p-6">
        <ConsentWizard
          status={status}
          fullPage
          onDone={async () => {
            await q.refetch();
            navigate("/customer/dashboard");
          }}
        />
      </div>
    </>
  );
}