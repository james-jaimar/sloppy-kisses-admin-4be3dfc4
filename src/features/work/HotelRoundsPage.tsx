import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { toast } from "sonner";
import { ChevronRight, Loader2, LogIn, LogOut } from "lucide-react";
import { WorkTopBar } from "./WorkTopBar";
import { useWorkDepts } from "./useWorkDepts";
import {
  CARE_ROUNDS, isoDay, useCareRounds, useSetJobStatus, useToggleCareRound, useWorkJobs,
  type CareRoundKind,
} from "./queries";

type Tab = "in_house" | "arrivals" | "departures";

export default function HotelRoundsPage() {
  const { tenantId } = useWorkDepts();
  const [day, setDay] = useState(() => new Date());
  const [tab, setTab] = useState<Tab>("in_house");
  const dayIso = isoDay(day);

  const jobsQ = useWorkJobs({ tenantId, depts: ["hotel"], day });
  const roundsQ = useCareRounds(tenantId, day);
  const toggleRound = useToggleCareRound(tenantId ?? "");
  const setStatus = useSetJobStatus(tenantId ?? "");

  const jobs = jobsQ.data ?? [];
  const arrivals = jobs.filter((j) => j.start_at?.slice(0, 10) === dayIso);
  const departures = jobs.filter((j) => j.end_at?.slice(0, 10) === dayIso);
  const inHouse = jobs.filter((j) => ["checked_in", "in_progress", "ready"].includes(j.status));

  const roundKey = (bookingId: string, petId: string | null, kind: CareRoundKind) =>
    `${bookingId}|${petId ?? ""}|${kind}`;
  const roundMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of roundsQ.data ?? []) m.set(roundKey(r.booking_id, r.pet_id, r.round_kind), r.id);
    return m;
  }, [roundsQ.data]);

  const list = tab === "arrivals" ? arrivals : tab === "departures" ? departures : inHouse;

  return (
    <>
      <WorkTopBar title="Hotel & cattery" day={day} onDayChange={setDay} />
      <div className="mx-auto max-w-5xl space-y-3 p-4">
        <div className="grid grid-cols-3 gap-2">
          {([
            ["in_house", `In house (${inHouse.length})`],
            ["arrivals", `Arriving (${arrivals.length})`],
            ["departures", `Leaving (${departures.length})`],
          ] as [Tab, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`min-h-[52px] rounded-2xl border-2 px-2 text-sm font-bold ${
                tab === key ? "border-sk-coral bg-sk-coral-soft text-sk-coral-dark" : "border-border bg-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {jobsQ.isLoading && (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading…
          </div>
        )}
        {!jobsQ.isLoading && list.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            Nothing here for this day.
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2">
        {list.map((job) => {
          const petId = job.pets[0]?.id ?? null;
          return (
            <div key={job.id} className="rounded-2xl border border-border bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-lg font-bold">
                    {job.pets.map((p) => p.name).filter(Boolean).join(", ") || "No pet linked"}
                  </div>
                  <div className="truncate text-sm text-muted-foreground">
                    {job.customer?.full_name ?? "—"} · {job.resource?.name ?? "Unassigned run"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {job.start_at ? format(new Date(job.start_at), "d MMM") : "—"} →{" "}
                    {job.end_at ? format(new Date(job.end_at), "d MMM") : "—"}
                  </div>
                </div>
                <Link
                  to={`/work/job/${job.id}`}
                  className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-border active:bg-muted"
                  aria-label="Open job"
                >
                  <ChevronRight className="h-6 w-6" />
                </Link>
              </div>

              {tab === "arrivals" && job.status !== "checked_in" && (
                <button
                  onClick={async () => {
                    try {
                      await setStatus.mutateAsync({ bookingId: job.id, status: "checked_in", fromStatus: job.status });
                      toast.success("Checked in");
                    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
                  }}
                  className="mt-3 flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl bg-sk-green text-base font-bold text-white"
                >
                  <LogIn className="h-5 w-5" /> Check in
                </button>
              )}
              {tab === "departures" && job.status !== "checked_out" && (
                <button
                  onClick={async () => {
                    try {
                      await setStatus.mutateAsync({ bookingId: job.id, status: "checked_out", fromStatus: job.status });
                      toast.success("Checked out");
                    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
                  }}
                  className="mt-3 flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl bg-sk-turquoise text-base font-bold text-white"
                >
                  <LogOut className="h-5 w-5" /> Check out
                </button>
              )}

              {tab === "in_house" && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {CARE_ROUNDS.map((r) => {
                    const existingId = roundMap.get(roundKey(job.id, petId, r.key));
                    const done = Boolean(existingId);
                    return (
                      <button
                        key={r.key}
                        onClick={() =>
                          toggleRound.mutate({
                            existingId,
                            bookingId: job.id,
                            petId,
                            dayIso,
                            kind: r.key,
                          })
                        }
                        className={`min-h-[48px] rounded-xl border-2 px-4 text-sm font-bold ${
                          done ? "border-sk-green bg-sk-green text-white" : "border-border bg-white"
                        }`}
                      >
                        {r.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        </div>
      </div>
    </>
  );
}