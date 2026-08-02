import { LogOut, User } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/tenant/TenantContext";
import { WorkTopBar } from "./WorkTopBar";
import { BigButton } from "./WorkSheet";
import { DEPT_LABEL } from "./queries";
import { useWorkDepts } from "./useWorkDepts";

export default function MePage() {
  const { profile, roles, currentTenant } = useCurrentUser();
  const { depts } = useWorkDepts();
  const navigate = useNavigate();

  return (
    <>
      <WorkTopBar title="Me" subtitle={currentTenant?.name ?? ""} />
      <div className="mx-auto max-w-3xl space-y-4 p-4">
        <div className="rounded-2xl border border-border bg-white p-5">
          <div className="flex items-center gap-3">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-sk-coral-soft text-sk-coral-dark">
              <User className="h-7 w-7" />
            </span>
            <div className="min-w-0">
              <div className="truncate text-lg font-bold">{profile?.full_name ?? "—"}</div>
              <div className="truncate text-sm text-muted-foreground">{profile?.email}</div>
            </div>
          </div>
          <dl className="mt-4 space-y-2 text-sm">
            <div>
              <dt className="font-semibold uppercase tracking-wide text-muted-foreground">Roles</dt>
              <dd>{roles.map((r) => r.label).join(", ") || "—"}</dd>
            </div>
            <div>
              <dt className="font-semibold uppercase tracking-wide text-muted-foreground">Departments</dt>
              <dd>{depts.map((d) => DEPT_LABEL[d]).join(", ") || "—"}</dd>
            </div>
          </dl>
        </div>

        <BigButton tone="neutral" onClick={() => navigate("/admin/home")}>
          Open full admin app
        </BigButton>
        <BigButton
          tone="danger"
          onClick={async () => {
            await supabase.auth.signOut();
            navigate("/login");
          }}
        >
          <LogOut className="h-5 w-5" /> Sign out
        </BigButton>
      </div>
    </>
  );
}