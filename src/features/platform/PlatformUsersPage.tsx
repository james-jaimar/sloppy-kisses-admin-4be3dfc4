import { AppHeader } from "@/components/layout/AppHeader";
import { useAllPlatformProfiles, useSetProfileType } from "./queries";
import { ShieldCheck, User } from "lucide-react";
import { useCurrentUser } from "@/lib/tenant/TenantContext";

export default function PlatformUsersPage() {
  const { data, isLoading, error } = useAllPlatformProfiles();
  const setType = useSetProfileType();
  const { profile: me } = useCurrentUser();

  return (
    <>
      <AppHeader title="Platform users" subtitle="Every profile on the platform. Promote or demote platform owners here." />
      <div className="flex-1 p-6">
        <div className="sk-card overflow-hidden">
          {isLoading && <div className="p-6 text-sm text-muted-foreground">Loading…</div>}
          {error && <div className="p-6 text-sm text-sk-coral-dark">{(error as Error).message}</div>}
          {data && (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Tenants</th>
                  <th className="px-4 py-3">Joined</th>
                  <th className="px-4 py-3 text-right">Platform owner</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.map((p) => {
                  const isPlatform = p.user_type === "platform";
                  const isMe = me?.id === p.id;
                  return (
                    <tr key={p.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="grid h-8 w-8 place-items-center rounded-full bg-muted text-xs font-semibold">
                            {isPlatform ? <ShieldCheck className="h-4 w-4 text-sk-coral-dark" /> : <User className="h-4 w-4 text-muted-foreground" />}
                          </div>
                          <div className="leading-tight">
                            <div className="font-medium">{p.full_name ?? "—"}</div>
                            <div className="text-xs text-muted-foreground">{p.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={
                          "rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider " +
                          (isPlatform ? "bg-sk-coral-soft text-sk-coral-dark" : p.user_type === "customer" ? "bg-muted text-muted-foreground" : "bg-sk-turquoise-soft text-sk-turquoise-dark")
                        }>{p.user_type}</span>
                      </td>
                      <td className="px-4 py-3">
                        {p.memberships.length ? (
                          <div className="flex flex-wrap gap-1">
                            {p.memberships.map((m) => (
                              <span key={m.tenant_id} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                                {m.tenant_name}
                              </span>
                            ))}
                          </div>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3 text-right">
                        <label className={"inline-flex items-center gap-2 " + (isMe ? "opacity-50 cursor-not-allowed" : "cursor-pointer")}>
                          <input
                            type="checkbox"
                            checked={isPlatform}
                            disabled={isMe || setType.isPending}
                            onChange={(e) =>
                              setType.mutate({
                                profileId: p.id,
                                userType: e.target.checked ? "platform" : (p.memberships.some((m) => m.status === "active") ? "staff" : "customer"),
                              })
                            }
                          />
                          <span className="text-xs">{isMe ? "You" : isPlatform ? "On" : "Off"}</span>
                        </label>
                      </td>
                    </tr>
                  );
                })}
                {!data.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">No profiles.</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}