import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Car, CheckCircle2, Loader2, Scissors } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase/client";
import { usePublicTenant } from "./publicBookingQueries";
import { PET_SIZE_LABEL, petSizeToBand, type PetSize } from "@/features/pets/sizeUtils";

type Kind = "inhouse" | "mobile";

interface PubPackage { code: string; name: string; species: string; size_band: string | null; price_zar: number; expected_minutes: number }
interface PubAddon { code: string; name: string; price_zar: number; kind: string; duration_minutes: number; bookable_standalone: boolean }

const inputCls = "h-10 w-full rounded-xl border border-border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-sk-coral/40";
const fmtZar = (n: number) => new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", minimumFractionDigits: 2 }).format(n);
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const SIZES = Object.keys(PET_SIZE_LABEL) as PetSize[];

interface PetDraft { name: string; species: "dog" | "cat"; size: PetSize | ""; breed: string; pkg: string; addons: string[] }
const emptyPet = (): PetDraft => ({ name: "", species: "dog", size: "", breed: "", pkg: "", addons: [] });

export default function PublicGroomingPage({ kind }: { kind: Kind }) {
  const [params] = useSearchParams();
  const tenantSlug = params.get("tenant");
  const tenant = usePublicTenant(tenantSlug);
  const tenantId = tenant.data?.id;

  const catalog = useQuery({
    queryKey: ["public_grooming_catalog", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("public_grooming_catalog" as any, { p_tenant_id: tenantId } as any);
      if (error) throw error;
      const row = (data ?? {}) as any;
      return {
        packages: (row.packages ?? []) as PubPackage[],
        addons: ((row.addons ?? []) as PubAddon[]).filter((a) => a.kind !== "travel" && !a.code.startsWith("stay_play")),
      };
    },
  });

  const [pets, setPets] = useState<PetDraft[]>([emptyPet()]);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [contact, setContact] = useState({ first_name: "", last_name: "", email: "", mobile: "" });
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const setPet = (i: number, patch: Partial<PetDraft>) => {
    setPets((prev) => prev.map((p, j) => (j === i ? { ...p, ...patch } : p)));
    setTime("");
  };

  const lines = useMemo(() => pets.map((p) => {
    const pkg = catalog.data?.packages.find((x) => x.code === p.pkg) ?? null;
    const extras = p.addons.map((c) => catalog.data?.addons.find((a) => a.code === c)).filter(Boolean) as PubAddon[];
    const mins = Number(pkg?.expected_minutes ?? 0) + extras.reduce((s, a) => s + Number(a.duration_minutes ?? 0), 0);
    const price = Number(pkg?.price_zar ?? 0) + extras.reduce((s, a) => s + Number(a.price_zar), 0);
    return { pkg, extras, mins, price, ok: Boolean(pkg || extras.length) };
  }), [pets, catalog.data]);
  const longest = Math.max(30, ...lines.map((l) => l.mins));
  const total = lines.reduce((s, l) => s + l.price, 0);
  const servicesReady = pets.every((p, i) => p.name.trim() && p.size && lines[i].ok);
  const needed = kind === "mobile" ? 1 : pets.length;

  const slotsQ = useQuery({
    queryKey: ["public_grooming_slots", tenantId, date, kind, longest],
    enabled: Boolean(tenantId && date && servicesReady),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("public_grooming_slots" as any, {
        p_tenant_id: tenantId, p_day: date, p_kind: kind, p_minutes: longest,
      } as any);
      if (error) throw error;
      return data as { closed: string | null; slots: { time: string; free: number }[] };
    },
  });
  const slots = (slotsQ.data?.slots ?? []).filter((s) => s.free >= needed);

  const contactReady = contact.first_name.trim() && contact.last_name.trim() && /.+@.+\..+/.test(contact.email);
  const canSubmit = servicesReady && date && time && contactReady && (kind !== "mobile" || address.trim().length > 5) && !submitting;

  function packagesFor(p: PetDraft) {
    const band = petSizeToBand(p.size || null);
    return (catalog.data?.packages ?? []).filter((x) => x.species === p.species && (!x.size_band || x.size_band === band));
  }

  async function onSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("public-grooming-booking", {
        body: {
          kind, tenant_slug: tenantSlug || undefined, ...contact, date, time,
          address_text: kind === "mobile" ? address.trim() : undefined,
          notes: notes.trim() || undefined,
          pets: pets.map((p) => ({ name: p.name.trim(), species: p.species, size: p.size, breed: p.breed.trim() || undefined, package_code: p.pkg || undefined, addon_codes: p.addons })),
        },
      });
      const err = (data as any)?.error ?? (error ? "failed" : null);
      if (err === "slot_taken" || (error as any)?.context?.status === 409) {
        toast.error("Sorry — that time has just been taken. Please pick another.");
        setTime(""); slotsQ.refetch(); return;
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

  const Icon = kind === "mobile" ? Car : Scissors;
  const title = kind === "mobile" ? "Mobile Grooming" : "In-house Grooming";

  if (done) {
    return (
      <div className="mx-auto max-w-lg space-y-4 rounded-2xl border border-border bg-sk-surface p-8 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-sk-turquoise" />
        <h1 className="text-xl font-bold">Request received!</h1>
        <p className="text-sm text-muted-foreground">
          Thanks {contact.first_name} — we've got your {title.toLowerCase()} request for{" "}
          {new Date(`${date}T00:00:00`).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" })} at {time}.
          Our team will confirm by email shortly.
        </p>
        <p className="text-xs text-muted-foreground">
          Already have an account? <Link to="/login" className="font-semibold text-sk-coral hover:text-sk-coral-dark">Sign in</Link> to track your bookings.
        </p>
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
          {kind === "mobile" ? "Our grooming van comes to you." : "Groomed at our parlour."} Choose the treatment, then pick a live time slot.
        </p>
      </div>

      <section className="space-y-3 rounded-2xl border border-border bg-sk-surface p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Who's being groomed?</h2>
          {pets.length < 4 && (
            <button type="button" onClick={() => { setPets((p) => [...p, emptyPet()]); setTime(""); }} className="text-xs font-semibold text-sk-coral hover:text-sk-coral-dark">+ Add another pet</button>
          )}
        </div>
        {pets.map((p, i) => {
          const pkgs = packagesFor(p);
          const extrasAllowed = (catalog.data?.addons ?? []).filter((a) => p.pkg || a.bookable_standalone);
          return (
            <div key={i} className="space-y-3 rounded-xl border border-border bg-white p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">Pet {i + 1}</span>
                {pets.length > 1 && <button type="button" onClick={() => { setPets((prev) => prev.filter((_, j) => j !== i)); setTime(""); }} className="text-xs text-muted-foreground hover:text-destructive">Remove</button>}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block"><span className="mb-1 block text-xs font-medium text-muted-foreground">Name</span>
                  <input value={p.name} onChange={(e) => setPet(i, { name: e.target.value })} className={inputCls} placeholder="Bella" /></label>
                <label className="block"><span className="mb-1 block text-xs font-medium text-muted-foreground">Species</span>
                  <select value={p.species} onChange={(e) => setPet(i, { species: e.target.value as "dog" | "cat", pkg: "" })} className={inputCls}>
                    <option value="dog">Dog</option><option value="cat">Cat</option>
                  </select></label>
                <label className="block"><span className="mb-1 block text-xs font-medium text-muted-foreground">Size</span>
                  <select value={p.size} onChange={(e) => setPet(i, { size: e.target.value as PetSize, pkg: "" })} className={inputCls}>
                    <option value="">— Select size —</option>
                    {SIZES.map((s) => <option key={s} value={s}>{PET_SIZE_LABEL[s]}</option>)}
                  </select></label>
                <label className="block"><span className="mb-1 block text-xs font-medium text-muted-foreground">Breed (optional)</span>
                  <input value={p.breed} onChange={(e) => setPet(i, { breed: e.target.value })} className={inputCls} placeholder="Maltese" /></label>
              </div>
              <label className="block"><span className="mb-1 block text-xs font-medium text-muted-foreground">Groom</span>
                <select value={p.pkg} disabled={!p.size} onChange={(e) => setPet(i, { pkg: e.target.value, addons: e.target.value ? p.addons : p.addons.filter((c) => catalog.data?.addons.find((a) => a.code === c)?.bookable_standalone) })} className={inputCls}>
                  <option value="">{p.size ? "Extras only (no groom)" : "Select a size first"}</option>
                  {pkgs.map((x) => <option key={x.code} value={x.code}>{x.name} · {fmtZar(Number(x.price_zar))}</option>)}
                </select></label>
              {p.size && extrasAllowed.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {extrasAllowed.map((a) => {
                    const on = p.addons.includes(a.code);
                    return (
                      <button key={a.code} type="button"
                        onClick={() => setPet(i, { addons: on ? p.addons.filter((c) => c !== a.code) : [...p.addons, a.code] })}
                        className={"rounded-full border px-3 py-1 text-xs " + (on ? "border-sk-coral bg-sk-coral-soft font-semibold" : "border-border hover:bg-muted")}>
                        {a.name} · {fmtZar(Number(a.price_zar))}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-sk-surface p-5">
        <h2 className="text-sm font-semibold">Pick a day and time</h2>
        <input type="date" value={date} min={todayKey()} onChange={(e) => { setDate(e.target.value); setTime(""); }} className={inputCls + " sm:w-60"} />
        {!servicesReady ? (
          <p className="text-xs text-muted-foreground">Fill in each pet's name, size and treatment to see free times.</p>
        ) : !date ? null : slotsQ.isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : slotsQ.data?.closed ? (
          <p className="text-sm text-sk-coral-dark">We're closed that day ({slotsQ.data.closed}). Please choose another date.</p>
        ) : slots.length === 0 ? (
          <p className="text-sm text-sk-coral-dark">No free times that day{pets.length > 1 && kind === "inhouse" ? ` for ${pets.length} pets together` : ""}. Please try another date.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {slots.map((s) => (
              <button key={s.time} type="button" onClick={() => setTime(s.time)}
                className={"rounded-lg border px-3 py-1.5 text-sm " + (time === s.time ? "border-sk-coral bg-sk-coral font-semibold text-primary-foreground" : "border-border bg-white hover:bg-muted")}>
                {s.time}
              </button>
            ))}
          </div>
        )}
        {servicesReady && <p className="text-xs text-muted-foreground">Allow about {longest} minutes{pets.length > 1 && kind === "inhouse" ? " — your pets are groomed side by side" : ""}.</p>}
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-sk-surface p-5">
        <h2 className="text-sm font-semibold">Your details</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <input value={contact.first_name} onChange={(e) => setContact((c) => ({ ...c, first_name: e.target.value }))} className={inputCls} placeholder="First name" autoComplete="given-name" />
          <input value={contact.last_name} onChange={(e) => setContact((c) => ({ ...c, last_name: e.target.value }))} className={inputCls} placeholder="Last name" autoComplete="family-name" />
          <input type="email" value={contact.email} onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))} className={inputCls} placeholder="Email" autoComplete="email" />
          <input value={contact.mobile} onChange={(e) => setContact((c) => ({ ...c, mobile: e.target.value }))} className={inputCls} placeholder="Mobile (+27…)" autoComplete="tel" />
        </div>
        {kind === "mobile" && (
          <label className="block"><span className="mb-1 block text-xs font-medium text-muted-foreground">Where should the van come?</span>
            <input value={address} onChange={(e) => setAddress(e.target.value)} className={inputCls} placeholder="Street address, suburb, city" /></label>
        )}
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sk-coral/40" placeholder="Style preferences, sensitivities, anything else (optional)" />
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-sk-surface p-5">
        <h2 className="text-sm font-semibold">Estimated total</h2>
        {servicesReady ? (
          <div className="space-y-1 text-sm">
            {lines.map((l, i) => (
              <div key={i} className="flex justify-between gap-4">
                <span className="text-muted-foreground">{pets[i].name || `Pet ${i + 1}`} · {[l.pkg?.name, ...l.extras.map((a) => a.name)].filter(Boolean).join(" + ")}</span>
                <span className="font-medium">{fmtZar(l.price)}</span>
              </div>
            ))}
            <div className="mt-2 flex justify-between border-t border-border pt-2 text-base font-bold"><span>Total (incl. VAT)</span><span>{fmtZar(total)}</span></div>
            <p className="text-xs text-muted-foreground">
              Final price is confirmed by our team{kind === "mobile" ? " — the van travel fee is added on confirmation" : ""}. Puppy and other discounts are applied where eligible.
            </p>
          </div>
        ) : <p className="text-xs text-muted-foreground">Choose a treatment for each pet to see your price.</p>}
        <button type="button" onClick={onSubmit} disabled={!canSubmit}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-sk-coral text-sm font-semibold text-primary-foreground hover:bg-sk-coral-dark disabled:opacity-50">
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />} Request booking
        </button>
        <p className="text-center text-xs text-muted-foreground">
          Already a customer? <Link to="/login" className="font-semibold text-sk-coral hover:text-sk-coral-dark">Sign in</Link> to book from your account.
        </p>
      </section>
    </div>
  );
}
