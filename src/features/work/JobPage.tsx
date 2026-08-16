import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  AlertTriangle, ArrowLeft, Check, CheckCheck, Loader2, LogIn, NotebookPen,
  Pause, Phone, Play, BellRing, RefreshCw, ShieldCheck,
} from "lucide-react";
import { useCurrentUser } from "@/lib/tenant/TenantContext";
import { BOOKING_STATUS_META } from "@/features/bookings/statusMeta";
import { BookingStayPlayBadge } from "@/features/daycare/StayPlayBadge";
import type { BookingStatus } from "@/features/bookings/queries";
import { BigButton, WorkSheet } from "./WorkSheet";
import { IncidentSheet } from "./IncidentSheet";
import { JobPhotos } from "./JobPhotos";
import { useWorkDepts } from "./useWorkDepts";
import {
  useAddJobNote, useJobChecklist, useJobEvents, useJobSignoff,
  useSetJobStatus, useSignOffJob, useToggleChecklistItem, useWorkJob,
} from "./queries";
import { groomingNextAction, isGroomingService } from "./workflowActions";
import { JobAlerts, JobAddress, JobGroomingBrief, JobService } from "./JobBrief";
import { PET_SIZE_LABEL, type PetSize } from "@/features/pets/sizeUtils";
import { Button } from "@/components/ui/button";

/** Next status in the simple worker flow, per department. */
function nextStep(status: BookingStatus, serviceType: Parameters<typeof isGroomingService>[0]): { label: string; status: BookingStatus; icon: any; tone: "primary" | "green" | "orange" } | null {
  if (isGroomingService(serviceType)) {
    const action = groomingNextAction(status);
    if (!action) return null;
    const icon = action.status === "checked_in" ? LogIn : action.status === "grooming" ? Play : BellRing;
    return { label: action.label, status: action.status, icon, tone: action.tone };
  }
  const beforeStart: BookingStatus[] = ["draft", "requested", "approved", "confirmed", "needs_info"];
  if (beforeStart.includes(status)) return { label: "Check in", status: "checked_in", icon: LogIn, tone: "green" };
  if (status === "checked_in") {
    return { label: "Start", status: "in_progress", icon: Play, tone: "primary" };
  }
  if (status === "grooming" || status === "in_progress")
    return { label: "Ready for collection", status: "ready", icon: BellRing, tone: "orange" };
  return null;
}

export default function JobPage() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const navigate = useNavigate();
  const { profile } = useCurrentUser();
  const { tenantId, canSignoff, canRaiseIncident } = useWorkDepts();

  const jobQ = useWorkJob(bookingId, tenantId);
  const job = jobQ.data;

  const setStatus = useSetJobStatus(tenantId ?? "");
  const signOff = useSignOffJob(tenantId ?? "");
  const addNote = useAddJobNote(tenantId ?? "");
  const toggleItem = useToggleChecklistItem();

  const checklistQ = useJobChecklist({ tenantId, bookingId, serviceType: job?.service_type });
  const eventsQ = useJobEvents(bookingId);
  const signoffQ = useJobSignoff(bookingId);

  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [incidentOpen, setIncidentOpen] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const [signName, setSignName] = useState("");
  const [signSummary, setSignSummary] = useState("");

  const notes = useMemo(
    () => (eventsQ.data ?? []).filter((e) => e.note && e.event_kind !== "work_status"),
    [eventsQ.data],
  );

  if (jobQ.isLoading) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (jobQ.isError) {
    return (
      <div className="grid min-h-[60vh] place-items-center px-6 text-center">
        <div className="max-w-sm">
          <AlertTriangle className="mx-auto h-9 w-9 text-sk-orange" />
          <h1 className="mt-3 text-lg font-bold">Couldn’t load this job</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The appointment still exists, but its details could not be loaded. Please try again.
          </p>
          <Button className="mt-4 min-h-12" onClick={() => jobQ.refetch()} disabled={jobQ.isFetching}>
            {jobQ.isFetching ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            Try again
          </Button>
        </div>
      </div>
    );
  }
  if (!tenantId) {
    return <div className="p-6 text-center text-muted-foreground">Work mode is not available for this account.</div>;
  }
  if (!job) {
    return <div className="p-6 text-center text-muted-foreground">Job not found.</div>;
  }

  const meta = BOOKING_STATUS_META[job.status];
  const step = nextStep(job.status, job.service_type);
  const items = checklistQ.data ?? [];
  const doneCount = items.filter((i) => i.done).length;
  const signedOff = Boolean(signoffQ.data);
  const petNames = job.pets.map((p) => p.name).filter(Boolean).join(", ") || "No pet linked";
  const primaryPet = job.pets[0];
  const petSize = (primaryPet?.size_override || primaryPet?.size) as PetSize | undefined;
  const subLine = [
    primaryPet?.breed ?? primaryPet?.species ?? null,
    petSize ? PET_SIZE_LABEL[petSize] ?? petSize : null,
    job.customer?.full_name ?? null,
  ]
    .filter(Boolean)
    .join(" · ");
  const isGrooming = isGroomingService(job.service_type);
  const isMobile = job.service_type === "grooming_mobile" || job.service_type === "pickup_dropoff";
  const dayIso = job.start_at ? job.start_at.slice(0, 10) : undefined;

  async function move(status: BookingStatus, label: string) {
    try {
      await setStatus.mutateAsync({ bookingId: job.id, status, fromStatus: job.status });
      toast.success(label);
    } catch (err: any) {
      toast.error(err?.message ?? "Couldn't update the job");
    }
  }

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-border bg-white px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-start gap-3">
          <button
            onClick={() => navigate(-1)}
            aria-label="Back"
            className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-border active:bg-muted"
          >
            <ArrowLeft className="h-6 w-6" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-bold">{petNames}</h1>
            <p className="truncate text-sm text-muted-foreground">{subLine || "—"}</p>
            <div className="mt-1">
              <BookingStayPlayBadge tenantId={tenantId} bookingId={job.id} size="sm" />
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${meta.dot}`}>{meta.label}</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">
                {job.start_at ? format(new Date(job.start_at), "EEE d MMM · HH:mm") : "—"}
              </span>
              {job.resource?.name && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">{job.resource.name}</span>
              )}
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
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-4 p-4">
        <JobAlerts bookingId={job.id} pets={job.pets} onDate={dayIso} />

        {isMobile && <JobAddress address={job.address} fallbackText={job.service_address_text} />}

        {isGrooming && (
          <JobGroomingBrief tenantId={tenantId} bookingId={job.id} primaryPetId={primaryPet?.id ?? null} />
        )}

        {isGrooming && <JobService details={job.details} addons={job.addons} pet={primaryPet} />}

        {(job.notes_internal || job.notes_customer) && (
          <div className="rounded-2xl border border-sk-orange bg-sk-orange-soft p-4 text-sm text-sk-orange">
            <div className="flex items-center gap-2 font-bold">
              <AlertTriangle className="h-5 w-5" /> Read before you start
            </div>
            {job.notes_internal && <p className="mt-1 whitespace-pre-wrap">{job.notes_internal}</p>}
            {job.notes_customer && <p className="mt-1 whitespace-pre-wrap">{job.notes_customer}</p>}
          </div>
        )}

        {/* Primary action */}
        <div className="space-y-3">
          {step && !signedOff && (
            <BigButton tone={step.tone} onClick={() => move(step.status, step.label)} disabled={setStatus.isPending}>
              <step.icon className="h-6 w-6" /> {step.label}
            </BigButton>
          )}
          {(job.status === "grooming" || job.status === "in_progress") && (
            <BigButton tone="neutral" onClick={() => move("checked_in", "Paused")} disabled={setStatus.isPending}>
              <Pause className="h-5 w-5" /> Pause
            </BigButton>
          )}
          {!signedOff && canSignoff && (job.status === "ready" || job.status === "grooming" || job.status === "in_progress" || job.status === "checked_in") && (
            <BigButton
              tone="green"
              onClick={() => { setSignName(profile?.full_name ?? ""); setSignOpen(true); }}
            >
              <CheckCheck className="h-6 w-6" /> Complete &amp; sign off
            </BigButton>
          )}
          {signedOff && (
            <div className="flex items-center gap-2 rounded-2xl border border-sk-green bg-sk-green-soft p-4 text-sm font-semibold text-sk-green">
              <ShieldCheck className="h-5 w-5" />
              Signed off by {signoffQ.data?.signed_name} ·{" "}
              {signoffQ.data?.signed_at ? format(new Date(signoffQ.data.signed_at), "d MMM HH:mm") : ""}
            </div>
          )}
        </div>

        {/* Checklist */}
        <section className="rounded-2xl border border-border bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold">Checklist</h2>
            <span className="text-sm font-semibold text-muted-foreground">{doneCount}/{items.length}</span>
          </div>
          {checklistQ.isLoading ? (
            <div className="py-4 text-center text-sm text-muted-foreground">Loading…</div>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No checklist set up for this service yet. An admin can add one in Settings → Job checklists.
            </p>
          ) : (
            <ul className="space-y-2">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    onClick={() => toggleItem.mutate({ id: item.id, done: !item.done })}
                    className={`flex min-h-[60px] w-full items-center gap-3 rounded-2xl border-2 px-4 text-left text-base font-semibold ${
                      item.done ? "border-sk-green bg-sk-green-soft text-sk-green" : "border-border bg-white"
                    }`}
                  >
                    <span
                      className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border-2 ${
                        item.done ? "border-sk-green bg-sk-green text-white" : "border-border"
                      }`}
                    >
                      {item.done && <Check className="h-5 w-5" />}
                    </span>
                    <span className="flex-1">{item.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Photos */}
        <section className="rounded-2xl border border-border bg-white p-4">
          <h2 className="mb-3 text-base font-bold">Photos</h2>
          <JobPhotos
            tenantId={tenantId}
            bookingId={job.id}
            petId={job.pets[0]?.id ?? null}
            customerId={job.customer_id}
          />
        </section>

        {/* Notes */}
        <section className="rounded-2xl border border-border bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold">Notes</h2>
            <button
              onClick={() => { setNoteText(""); setNoteOpen(true); }}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-border px-3 text-sm font-semibold active:bg-muted"
            >
              <NotebookPen className="h-4 w-4" /> Add note
            </button>
          </div>
          {notes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No notes yet.</p>
          ) : (
            <ul className="space-y-3">
              {notes.map((n) => (
                <li key={n.id} className="rounded-xl bg-muted/60 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {format(new Date(n.created_at), "d MMM HH:mm")}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{n.note}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {canRaiseIncident && (
          <BigButton tone="danger" onClick={() => setIncidentOpen(true)}>
            <AlertTriangle className="h-5 w-5" /> Report an incident
          </BigButton>
        )}
      </div>

      {noteOpen && (
        <WorkSheet
          title="Add a note"
          onClose={() => setNoteOpen(false)}
          footer={
            <BigButton
              onClick={async () => {
                if (!noteText.trim()) return;
                try {
                  await addNote.mutateAsync({ bookingId: job.id, note: noteText.trim(), status: job.status });
                  toast.success("Note saved");
                  setNoteOpen(false);
                } catch (err: any) {
                  toast.error(err?.message ?? "Couldn't save the note");
                }
              }}
              disabled={addNote.isPending}
            >
              Save note
            </BigButton>
          }
        >
          <textarea
            autoFocus
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            rows={10}
            placeholder="What should the team know?"
            className="w-full rounded-2xl border border-border p-4 text-base"
          />
        </WorkSheet>
      )}

      {incidentOpen && (
        <IncidentSheet
          tenantId={tenantId}
          bookingId={job.id}
          petId={job.pets[0]?.id ?? null}
          customerId={job.customer_id}
          onClose={() => setIncidentOpen(false)}
        />
      )}

      {signOpen && (
        <WorkSheet
          title="Complete & sign off"
          onClose={() => setSignOpen(false)}
          footer={
            <BigButton
              tone="green"
              disabled={signOff.isPending || !signName.trim()}
              onClick={async () => {
                try {
                  await signOff.mutateAsync({
                    bookingId: job.id,
                    profileId: profile?.id ?? null,
                    signedName: signName.trim(),
                    summaryNote: signSummary.trim() || null,
                    status: job.status,
                  });
                  toast.success("Job signed off");
                  setSignOpen(false);
                  navigate("/work");
                } catch (err: any) {
                  toast.error(err?.message ?? "Couldn't sign off");
                }
              }}
            >
              <CheckCheck className="h-6 w-6" /> {signOff.isPending ? "Saving…" : "Confirm & complete"}
            </BigButton>
          }
        >
          <div className="space-y-5">
            {items.length > 0 && doneCount < items.length && (
              <div className="flex items-start gap-2 rounded-2xl border border-sk-orange bg-sk-orange-soft p-4 text-sm text-sk-orange">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                <span>{items.length - doneCount} checklist item(s) not ticked. You can still sign off.</span>
              </div>
            )}
            <div>
              <label className="mb-2 block text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Your name
              </label>
              <input
                value={signName}
                onChange={(e) => setSignName(e.target.value)}
                className="h-14 w-full rounded-2xl border border-border px-4 text-base"
                placeholder="Full name"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Anything to add? (optional)
              </label>
              <textarea
                value={signSummary}
                onChange={(e) => setSignSummary(e.target.value)}
                rows={5}
                className="w-full rounded-2xl border border-border p-4 text-base"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Signing records your name and the date and time.
            </p>
          </div>
        </WorkSheet>
      )}
    </>
  );
}