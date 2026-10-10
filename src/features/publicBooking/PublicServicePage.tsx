import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2, Sun, Truck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase/client";
import { AccountBar, DoneHandoff } from "./AccountHandoff";
import { usePublicTenant } from "./publicBookingQueries";
import { PET_SIZE_LABEL, type PetSize } from "@/features/pets/sizeUtils";

type Service = "daycare" | "transport";
type Direction = "pickup" | "dropoff" | "round_trip";

const inputCls = "h-10 w-full rounded-xl border border-border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-sk-coral/40";
const fmtZar = (n: number) => new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", minimumFractionDigits: 2 }).format(n);
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const fmtDay = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });
const SIZES = Object.keys(PET_SIZE_LABEL) as PetSize[];
const WEEKDAYS = [["mon", "Mon"], ["tue", "Tue"], ["wed", "Wed"], ["thu", "Thu"], ["fri", "Fri"]] as const;
const DIR_LABEL: Record<Direction, string> = { pickup: "Collect from home", dropoff: "Deliver home", round_trip: "Both ways" };

interface PetDraft { name: string; species: "dog" | "cat"; size: PetSize | ""; breed: string }
const emptyPet = (): PetDraft => ({ name: "", species: "dog", size: "", breed: "" });

export default function PublicServicePage({ service }: { service: Service }) {
  const [params] = useSearchParams();
  const tenantSlug = params.get("tenant");
  const tenant = usePublicTenant(tenantSlug);
  const tenantId = tenant.data?.id;
  const isDaycare = service === "daycare";

  const [pets, setPets] = useState<PetDraft[]>([emptyPet()]);
  const [contact, setContact] = useState({ first_name: "", last_name: "", email: "", mobile: "" });
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  // Daycare
  const [assessment, setAssessment] = useState(true);
  const [startDate, setStartDate] = useState("");
  const [planId, setPlanId] = useState("");
  const [days, setDays] = useState<string[]>([]);

  // Transport
  const [direction, setDirection] = useState<Direction>("round_trip");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("08:00");
  const [returnDate, setReturnDate] = useState("");
  const [returnTime, setReturnTime] = useState("16:00");
  const [address, setAddress] = useState("");
  const [suburb, setSuburb] = useState("");
  const [destination, setDestination] = useState("");

  const day = isDaycare ? startDate : date;
  const info = useQuery({
    queryKey: ["public_service_info", service, tenantId, day],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      const fn = isDaycare ? "public_daycare_info" : "public_transport_info";
      const { data, error } = await supabase.rpc(fn as any, { p_tenant_id: tenantId, p_day: day || null } as any);
      if (error) throw error;
      return (data ?? {}) as any;
    },
  });

  const plans = (info.data?.plans ?? []) as { id: string; name: string; days_per_week: number | null; price: number; billing_period: string }[];
  const plan = plans.find((p) => p.id === planId);
  const dayBlocked = Boolean(day && (info.data?.day_full || info.data?.closed || (isDaycare && assessment && info.data?.weekend) || (!isDaycare && info.data?.no_vans)));

  const estimate = useMemo(() => {
    if (isDaycare) return plan ? Number(plan.price) * pets.length : null;
    const fees = (info.data?.suburb_fees ?? {}) as Record<string, number>;
    const key = Object.keys(fees).find((k) => k.toLowerCase() === suburb.trim().toLowerCase());
    const leg = Number(key ? fees[key] : info.data?.default_fee_zar) || 0;
    if (!leg) return null;
    return direction === "round_trip" ? leg * Number(info.data?.round_trip_multiplier || 2) : leg;
  }, [isDaycare, plan, pets.length, info.data, suburb, direction]);

  const petsReady = pets.every((p) => p.name.trim() && p.size);
  const contactReady = contact.first_name.trim() && contact.last_name.trim() && /.+@.+\..+/.test(contact.email);
  const serviceReady = isDaycare
    ? Boolean(startDate && (assessment || planId))
    : Boolean(date && time && address.trim().length > 5);
  const canSubmit = petsReady && contactReady && serviceReady && !dayBlocked && !submitting;

  const setPet = (i: number, patch: Partial<PetDraft>) => setPets((prev) => prev.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  async function onSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("public-service-request", {
        body: {
          service, tenant_slug: tenantSlug || undefined, ...contact, notes: notes.trim() || undefined,
          pets: pets.map((p) => ({ name: p.name.trim(), species: p.species, size: p.size, breed: p.breed.trim() || undefined })),
          ...(isDaycare
            ? { assessment, assessment_date: startDate, start_date: startDate, plan_id: planId || undefined, days }
            : { date, time, direction, address_text: address.trim(), suburb: suburb.trim(), destination: destination.trim(),
                return_date: direction === "round_trip" ? returnDate || undefined : undefined,
                return_time: direction === "round_trip" ? returnTime : undefined }),
        },
      });
      const err = (data as any)?.error ?? (error ? "failed" : null);
      if (err === "day_unavailable" || (error as any)?.context?.status === 409) {
        toast.error("Sorry — that day has just filled up. Please pick another.");
        info.refetch(); return;
      }
      if (err) throw new Error("Something went wrong — please check your details and try again.");
      setDone(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e: any) {
      toast.error(e?.message ?? "Something went wrong — please try again.");
    } finally { setSubmitting(false); }
  }

  if (tenant.isLoading) return <div className="grid place-items-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!tenant.data) return <div className="rounded-2xl border border-border bg-sk-surface p-8 text-center text-sm text-muted-foreground">We couldn't find that business. Please check the link and try again.</div>;

  const Icon = isDaycare ? Sun : Truck;
  const title = isDaycare ? "Doggy Daycare" : "Pick up & Drop off";

  if (done) {
    return (
      <div className="mx-auto max-w-lg space-y-4 rounded-2xl border border-border bg-sk-surface p-8 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-sk-turquoise" />
        <h1 className="text-xl font-bold">Request received!</h1>
        <p className="text-sm text-muted-foreground">
          Thanks {contact.first_name} — we've got your {isDaycare ? (assessment ? "daycare assessment" : "daycare") : "pet taxi"} request for {fmtDay(day)}.
          Our team will confirm by email shortly.
        </p>
        <DoneHandoff contact={contact} tenantSlug={tenantSlug} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to={`/book${tenantSlug ? `?tenant=${tenantSlug}` : ""}`} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> All services
        </Link>
        <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold"><Icon className="h-6 w-6 text-sk-coral" /> {title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isDaycare ? "New dogs start with an assessment day so we can make sure they settle in happily." : "Our pet taxi collects and delivers your pet. Live van space is checked for the day you pick."}
        </p>
      </div>

      <AccountBar service={service} />

      <section className="space-y-3 rounded-2xl border border-border bg-sk-surface p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Your pets</h2>
          {pets.length < 6 && <button type="button" onClick={() => setPets((p) => [...p, emptyPet()])} className="text-xs font-semibold text-sk-coral hover:text-sk-coral-dark">+ Add another pet</button>}
        </div>
        {pets.map((p, i) => (
          <div key={i} className="space-y-3 rounded-xl border border-border bg-white p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">Pet {i + 1}</span>
              {pets.length > 1 && <button type="button" onClick={() => setPets((prev) => prev.filter((_, j) => j !== i))} className="text-xs text-muted-foreground hover:text-destructive">Remove</button>}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Lbl t="Name"><input value={p.name} onChange={(e) => setPet(i, { name: e.target.value })} className={inputCls} placeholder="Bella" /></Lbl>
              {!isDaycare && (
                <Lbl t="Species"><select value={p.species} onChange={(e) => setPet(i, { species: e.target.value as "dog" | "cat" })} className={inputCls}>
                  <option value="dog">Dog</option><option value="cat">Cat</option></select></Lbl>
              )}
              <Lbl t="Size"><select value={p.size} onChange={(e) => setPet(i, { size: e.target.value as PetSize })} className={inputCls}>
                <option value="">— Select size —</option>
                {SIZES.map((s) => <option key={s} value={s}>{PET_SIZE_LABEL[s]}</option>)}</select></Lbl>
              <Lbl t="Breed (optional)"><input value={p.breed} onChange={(e) => setPet(i, { breed: e.target.value })} className={inputCls} placeholder="Labrador" /></Lbl>
            </div>
          </div>
        ))}
      </section>

      {isDaycare ? (
        <section className="space-y-4 rounded-2xl border border-border bg-sk-surface p-5">
          <h2 className="text-sm font-semibold">What would you like?</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {[[true, "Assessment day", "A first trial day — the usual starting point."], [false, "Monthly plan", "Already assessed? Choose a plan and start date."]].map(([v, t, d]) => (
              <button key={String(v)} type="button" onClick={() => setAssessment(v as boolean)}
                className={"rounded-xl border p-3 text-left " + (assessment === v ? "border-sk-coral bg-sk-coral-soft" : "border-border bg-white hover:bg-muted")}>
                <div className="text-sm font-semibold">{t as string}</div><div className="text-xs text-muted-foreground">{d as string}</div>
              </button>
            ))}
          </div>
          <Lbl t={assessment ? "Assessment date" : "Start date"}>
            <input type="date" min={todayKey()} value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputCls + " sm:w-60"} />
          </Lbl>
          {!assessment && (
            <>
              <Lbl t="Plan">
                <select value={planId} onChange={(e) => setPlanId(e.target.value)} className={inputCls}>
                  <option value="">— Select a plan —</option>
                  {plans.map((p) => <option key={p.id} value={p.id}>{p.name} · {fmtZar(Number(p.price))}{p.billing_period ? ` / ${p.billing_period}` : ""}</option>)}
                </select>
              </Lbl>
              <div>
                <span className="mb-1 block text-xs font-medium text-muted-foreground">Preferred days</span>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAYS.map(([c, l]) => {
                    const on = days.includes(c);
                    return <button key={c} type="button" onClick={() => setDays((d) => on ? d.filter((x) => x !== c) : [...d, c])}
                      className={"rounded-full border px-3 py-1 text-xs " + (on ? "border-sk-coral bg-sk-coral-soft font-semibold" : "border-border hover:bg-muted")}>{l}</button>;
                  })}
                </div>
              </div>
            </>
          )}
        </section>
      ) : (
        <section className="space-y-4 rounded-2xl border border-border bg-sk-surface p-5">
          <h2 className="text-sm font-semibold">Trip details</h2>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(DIR_LABEL) as Direction[]).map((d) => (
              <button key={d} type="button" onClick={() => setDirection(d)}
                className={"rounded-full border px-3 py-1 text-xs " + (direction === d ? "border-sk-coral bg-sk-coral-soft font-semibold" : "border-border hover:bg-muted")}>{DIR_LABEL[d]}</button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Lbl t={direction === "dropoff" ? "Delivery date" : "Collection date"}><input type="date" min={todayKey()} value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} /></Lbl>
            <Lbl t="Preferred time"><input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputCls} /></Lbl>
            {direction === "round_trip" && (<>
              <Lbl t="Return date"><input type="date" min={date || todayKey()} value={returnDate} onChange={(e) => setReturnDate(e.target.value)} className={inputCls} /></Lbl>
              <Lbl t="Return time"><input type="time" value={returnTime} onChange={(e) => setReturnTime(e.target.value)} className={inputCls} /></Lbl>
            </>)}
            <div className="sm:col-span-2"><Lbl t="Home address"><input value={address} onChange={(e) => setAddress(e.target.value)} className={inputCls} placeholder="12 Main Road, Bryanston" /></Lbl></div>
            <Lbl t="Suburb"><input value={suburb} onChange={(e) => setSuburb(e.target.value)} className={inputCls} placeholder="Bryanston" /></Lbl>
            <Lbl t="Going to (optional)"><input value={destination} onChange={(e) => setDestination(e.target.value)} className={inputCls} placeholder="Daycare, grooming, hotel…" /></Lbl>
          </div>
          <p className="text-[11px] text-muted-foreground">Our team will confirm your exact address on a map before the trip.</p>
        </section>
      )}

      {day && info.data && (
        dayBlocked ? (
          <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{info.data.closed ? `We're closed on this day (${info.data.closed}).` : info.data.weekend ? "Assessments run Monday to Friday — please pick a weekday." : info.data.no_vans ? "The pet taxi isn't available online right now — please contact us." : "This day is fully booked — please choose another."}</span>
          </div>
        ) : (
          <div className="rounded-xl border border-sk-turquoise/40 bg-sk-turquoise/5 p-3 text-xs">Good news — there's space on {fmtDay(day)}.</div>
        )
      )}

      <section className="space-y-3 rounded-2xl border border-border bg-sk-surface p-5">
        <h2 className="text-sm font-semibold">Your details</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Lbl t="First name"><input value={contact.first_name} onChange={(e) => setContact({ ...contact, first_name: e.target.value })} className={inputCls} /></Lbl>
          <Lbl t="Last name"><input value={contact.last_name} onChange={(e) => setContact({ ...contact, last_name: e.target.value })} className={inputCls} /></Lbl>
          <Lbl t="Email"><input type="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} className={inputCls} /></Lbl>
          <Lbl t="Mobile"><input value={contact.mobile} onChange={(e) => setContact({ ...contact, mobile: e.target.value })} className={inputCls} placeholder="+27 82 123 4567" /></Lbl>
        </div>
        <Lbl t="Anything we should know? (optional)">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sk-coral/40" />
        </Lbl>
      </section>

      <div className="sticky bottom-0 flex flex-col gap-3 rounded-2xl border border-border bg-sk-surface p-4 shadow-lg sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm">
          {estimate != null ? <>Estimate <span className="font-bold">{fmtZar(estimate)}</span>{isDaycare && plan?.billing_period ? ` / ${plan.billing_period}` : ""}</>
            : <span className="text-muted-foreground">{isDaycare && assessment ? "Assessment price confirmed by our team." : "Price confirmed by our team."}</span>}
          <div className="text-[11px] text-muted-foreground">This is a request — nothing is charged until we confirm.</div>
        </div>
        <button type="button" disabled={!canSubmit} onClick={onSubmit}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-sk-coral px-6 text-sm font-semibold text-primary-foreground hover:bg-sk-coral-dark disabled:opacity-50">
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />} Send request
        </button>
      </div>
    </div>
  );
}

function Lbl({ t, children }: { t: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-xs font-medium text-muted-foreground">{t}</span>{children}</label>;
}
