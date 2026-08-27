import { useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { toast } from "sonner";
import { CheckCircle2, ChevronRight, Loader2, LogIn, LogOut, Phone, Play, BellRing } from "lucide-react";
import { WorkTopBar } from "./WorkTopBar";
import { useWorkDepts } from "./useWorkDepts";
import { useSetJobStatus, useWorkJobs } from "./queries";
import { groomingNextAction, mobileGroomingStateLabel } from "./workflowActions";
import { useCustomerContactVisibility } from "@/lib/privacy/useCustomerContactVisibility";

const ACTION_TONES = {
  primary: "bg-sk-coral text-white",
  green: "bg-sk-green text-white",
  orange: "bg-sk-orange text-white",
};

const ACTION_ICONS = {
  checked_in: LogIn,
  grooming: Play,
  ready: BellRing,
};

export default function VansWorkPage() {
  const { tenantId, depts, myResourceIds } = useWorkDepts();
  const [day, setDay] = useState(() => new Date());
  const routeDepts = depts.filter((d) => d === "transport" || d === "grooming_mobile");
  const jobsQ = useWorkJobs({
    tenantId,
    depts: routeDepts.length ? routeDepts : ["transport"],
    day,
    resourceIds: myResourceIds,
  });
  const setStatus = useSetJobStatus(tenantId ?? "");
  const jobs = jobsQ.data ?? [];

  return (
    <>
      <WorkTopBar title="My route" subtitle={`${jobs.length} stop(s)`} day={day} onDayChange={setDay} />
      <div className="mx-auto max-w-3xl space-y-3 p-4">
        {jobsQ.isLoading && (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading route…
          </div>
        )}
        {!jobsQ.isLoading && jobs.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            No stops for this day.
          </div>
        )}
        {jobs.map((job, i) => {
          const isMobileGrooming = job.service_type === "grooming_mobile";
          const groomingAction = isMobileGrooming ? groomingNextAction(job.status) : null;
          const GroomingActionIcon = groomingAction ? ACTION_ICONS[groomingAction.status as keyof typeof ACTION_ICONS] : null;
          return (
          <div key={job.id} className="rounded-2xl border border-border bg-white p-4">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sk-turquoise-soft text-base font-bold text-sk-turquoise-dark">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-lg font-bold">
                  {job.pets.map((p) => p.name).filter(Boolean).join(", ") || "No pet linked"}
                </div>
                <div className="truncate text-sm text-muted-foreground">{job.customer?.full_name ?? "—"}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{job.start_at ? format(new Date(job.start_at), "HH:mm") : "—"}</span>
                  <span className={isMobileGrooming
                    ? "rounded-full bg-sk-turquoise-soft px-2 py-0.5 font-semibold text-sk-turquoise-dark"
                    : "rounded-full bg-muted px-2 py-0.5 font-semibold text-muted-foreground"
                  }>
                    {isMobileGrooming ? "Mobile grooming" : "Pick up / drop-off"}
                  </span>
                </div>
              </div>
              {job.customer?.mobile && (
                <a
                  href={`tel:${job.customer.mobile}`}
                  aria-label="Call owner"
                  className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-sk-turquoise text-white"
                >
                  <Phone className="h-6 w-6" />
                </a>
              )}
              <Link
                to={`/work/job/${job.id}`}
                className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-border active:bg-muted"
                aria-label="Open job"
              >
                <ChevronRight className="h-6 w-6" />
              </Link>
            </div>
            {isMobileGrooming ? (
              <div className="mt-3 space-y-2">
                {groomingAction && GroomingActionIcon ? (
                  <button
                    onClick={async () => {
                      try {
                        await setStatus.mutateAsync({ bookingId: job.id, status: groomingAction.status, fromStatus: job.status });
                        toast.success(groomingAction.successLabel);
                      } catch (e: any) { toast.error(e?.message ?? "Failed"); }
                    }}
                    disabled={setStatus.isPending}
                    className={`flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl text-base font-bold disabled:opacity-50 ${ACTION_TONES[groomingAction.tone]}`}
                  >
                    <GroomingActionIcon className="h-5 w-5" /> {groomingAction.label}
                  </button>
                ) : (
                  <div className="flex min-h-[56px] items-center justify-center gap-2 rounded-2xl bg-sk-green-soft px-4 text-base font-bold text-sk-green">
                    <CheckCircle2 className="h-5 w-5" /> {mobileGroomingStateLabel(job.status)}
                  </div>
                )}
              </div>
            ) : (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                onClick={async () => {
                  try {
                    await setStatus.mutateAsync({ bookingId: job.id, status: "checked_in", fromStatus: job.status });
                    toast.success("Collected");
                  } catch (e: any) { toast.error(e?.message ?? "Failed"); }
                }}
                className={`flex min-h-[56px] items-center justify-center gap-2 rounded-2xl text-base font-bold ${
                  ["checked_in", "in_progress", "ready", "checked_out", "completed"].includes(job.status)
                    ? "bg-sk-green-soft text-sk-green"
                    : "bg-sk-green text-white"
                }`}
              >
                <LogIn className="h-5 w-5" /> Collected
              </button>
              <button
                onClick={async () => {
                  try {
                    await setStatus.mutateAsync({ bookingId: job.id, status: "completed", fromStatus: job.status });
                    toast.success("Dropped off");
                  } catch (e: any) { toast.error(e?.message ?? "Failed"); }
                }}
                className={`flex min-h-[56px] items-center justify-center gap-2 rounded-2xl text-base font-bold ${
                  job.status === "completed" ? "bg-muted text-muted-foreground" : "bg-sk-coral text-white"
                }`}
              >
                <LogOut className="h-5 w-5" /> Dropped
              </button>
            </div>
            )}
          </div>
          );
        })}
      </div>
    </>
  );
}