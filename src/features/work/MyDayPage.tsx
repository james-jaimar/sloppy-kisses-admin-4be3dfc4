import { useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { CheckCheck, ChevronRight, Loader2, PawPrint } from "lucide-react";
import { WorkTopBar } from "./WorkTopBar";
import { useWorkDepts } from "./useWorkDepts";
import { DEPT_LABEL, useWorkJobs, type WorkJob } from "./queries";
import { BOOKING_STATUS_META } from "@/features/bookings/statusMeta";
import { StayPlayChip, StayPlayFlagsProvider } from "@/features/daycare/StayPlayBadge";

const SERVICE_LABELS: Record<string, string> = {
  daycare: "Daycare",
  daycare_assessment: "Daycare assessment",
  hotel_dog: "Hotel — dog",
  hotel_cat: "Cattery",
  grooming_inhouse: "Grooming",
  grooming_mobile: "Mobile grooming",
  pickup_dropoff: "Pick up / drop-off",
};

export function JobRowCard({ job }: { job: WorkJob }) {
  const meta = BOOKING_STATUS_META[job.status];
  const pets = job.pets.map((p) => p.name).filter(Boolean).join(", ") || "No pet linked";
  return (
    <Link
      to={`/work/job/${job.id}`}
      className="flex items-stretch gap-0 overflow-hidden rounded-2xl border border-border bg-white shadow-sm active:bg-muted"
    >
      <span className={`w-2 shrink-0 ${meta.dot.split(" ")[0]}`} />
      <span className="flex min-w-0 flex-1 items-center gap-3 p-4">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-sk-coral-soft text-lg font-bold text-sk-coral-dark">
          {(job.pets[0]?.name ?? "?").slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-lg font-bold">{pets}</span>
            {job.signed_off && <CheckCheck className="h-5 w-5 shrink-0 text-sk-green" />}
          </span>
          <span className="block truncate text-sm text-muted-foreground">
            {job.customer?.full_name ?? "—"} · {SERVICE_LABELS[job.service_type] ?? job.service_type}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">
              {job.start_at ? format(new Date(job.start_at), "HH:mm") : "—"}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${meta.dot}`}>{meta.label}</span>
            <StayPlayChip bookingId={job.id} size="sm" />
          </span>
        </span>
        <ChevronRight className="h-6 w-6 shrink-0 text-muted-foreground" />
      </span>
    </Link>
  );
}

export default function MyDayPage() {
  const { depts, tenantId, profile } = useWorkDepts();
  const [day, setDay] = useState(() => new Date());
  const jobsQ = useWorkJobs({ tenantId, depts, day });
  const jobs = jobsQ.data ?? [];
  const outstanding = jobs.filter((j) => !["completed", "checked_out"].includes(j.status));
  const done = jobs.filter((j) => ["completed", "checked_out"].includes(j.status));

  return (
    <>
      <WorkTopBar
        title={`Hi ${(profile?.full_name ?? "there").split(" ")[0]}`}
        subtitle={depts.map((d) => DEPT_LABEL[d]).join(" · ") || "No department assigned"}
        day={day}
        onDayChange={setDay}
      />
      <div className="mx-auto max-w-3xl space-y-3 p-4">
        {jobsQ.isLoading && (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading your day…
          </div>
        )}
        {!jobsQ.isLoading && jobs.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center">
            <PawPrint className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-3 text-base font-semibold">Nothing booked</p>
            <p className="text-sm text-muted-foreground">No jobs for this day.</p>
          </div>
        )}
        {outstanding.map((j) => <JobRowCard key={j.id} job={j} />)}
        {done.length > 0 && (
          <>
            <div className="pt-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Finished ({done.length})
            </div>
            <div className="space-y-3 opacity-70">
              {done.map((j) => <JobRowCard key={j.id} job={j} />)}
            </div>
          </>
        )}
      </div>
    </>
  );
}