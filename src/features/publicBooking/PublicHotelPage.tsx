import { usePublicAddress, addressPayload, PublicAddressField } from "./publicAddress";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { AwardPlaceholder, BookingPhotos, bookingPhotos } from "./BookingPhotos";
import { ArrowLeft, BedDouble, CheckCircle2, Loader2, Minus, Plus, Check, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase/client";
import { usePublicTenant, usePublicHotelRates, type PublicRate } from "./publicBookingQueries";
import { AccountBar, DoneHandoff } from "./AccountHandoff";
import { useHotelHouseAvailability, fullNights, HouseCapacityNotice } from "@/features/hotelCattery/HouseCapacityNotice";
import { SIZE_BAND_ORDER, SIZE_BAND_LABEL, type PetSizeBand } from "@/features/settings/hotelRateCardQueries";

const inputCls =
  "h-11 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-sk-coral/40";
const selectCls = inputCls;

const fmtZar = (n: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", minimumFractionDigits: 2 }).format(n);

function addDays(date: string, days: number): string {
  if (!date) return "";
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function nightsBetween(a: string, b: string): number {
  if (!a || !b) return 1;
  return Math.max(1, Math.round((Date.parse(b) - Date.parse(a)) / 86400000));
}

function rateAllowsSize(r: PublicRate, size: PetSizeBand | "") {
  if (!r.min_size_band && !r.max_size_band) return true;
  if (!size) return false;
  const idx = SIZE_BAND_ORDER.indexOf(size);
  const lo = r.min_size_band ? SIZE_BAND_ORDER.indexOf(r.min_size_band) : 0;
  const hi = r.max_size_band ? SIZE_BAND_ORDER.indexOf(r.max_size_band) : SIZE_BAND_ORDER.length - 1;
  return idx >= lo && idx <= hi;
}

interface PetDraft {
  name: string;
  species: "dog" | "cat";
  size: PetSizeBand | "";
  breed: string;
  accommodation: string;
}

const emptyPet = (): PetDraft => ({ name: "", species: "dog", size: "", breed: "", accommodation: "" });

export default function PublicHotelPage() {
  const [params] = useSearchParams();
  const tenantSlug = params.get("tenant");
  const tenant = usePublicTenant(tenantSlug);
  const rates = usePublicHotelRates(tenant.data?.id);

  const [checkIn, setCheckIn] = useState("");
  const [nights, setNights] = useState(1);
  const [pets, setPets] = useState<PetDraft[]>([emptyPet()]);
  const [addons, setAddons] = useState<Record<string, number>>({});
  const [contact, setContact] = useState({ first_name: "", last_name: "", email: "", mobile: "" });
  const [transport, setTransport] = useState({ pickup: false, dropoff: false });
  const addr = usePublicAddress();
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const checkOut = useMemo(() => (checkIn ? addDays(checkIn, nights) : ""), [checkIn, nights]);
  const allCats = pets.length > 0 && pets.every((p) => p.species === "cat");
  const species = allCats ? "cat" : "dog";

  const houseQ = useHotelHouseAvailability({
    tenantId: tenant.data?.id,
    start: checkIn ? new Date(`${checkIn}T00:00:00`) : null,
    end: checkOut ? new Date(`${checkOut}T00:00:00`) : null,
    species,
    enabled: Boolean(tenant.data?.id && checkIn && checkOut),
  });
  const overNights = fullNights(houseQ.data, pets.length);

  const speciesRates = useMemo(
    () => (rates.data?.rates ?? []).filter((r) => r.species === species),
    [rates.data, species],
  );

  const setPet = (i: number, patch: Partial<PetDraft>) =>
    setPets((prev) => prev.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  /** One line per accommodation group; extra pets in the same area use the extra-pet rate. */
  const estimate = useMemo(() => {
    if (pets.some((p) => !p.accommodation)) return null;
    const groups = new Map<string, PetDraft[]>();
    for (const p of pets) groups.set(p.accommodation, [...(groups.get(p.accommodation) ?? []), p]);
    const lines: { label: string; amount: number }[] = [];
    for (const [acc, group] of groups) {
      const rate = speciesRates.find((r) => r.accommodation_type === acc);
      if (!rate) return null;
      lines.push({
        label: `${rate.display_name} (${group[0].name || "Pet 1"}) · ${fmtZar(Number(rate.nightly_rate_zar))} × ${nights} night${nights === 1 ? "" : "s"}`,
        amount: Number(rate.nightly_rate_zar) * nights,
      });
      const extras = group.length - 1;
      if (extras > 0 && Number(rate.extra_pet_rate_zar) > 0) {
        lines.push({
          label: `Extra pet${extras === 1 ? "" : "s"} sharing × ${nights} night${nights === 1 ? "" : "s"}`,
          amount: Number(rate.extra_pet_rate_zar) * extras * nights,
        });
      }
    }
    for (const s of rates.data?.surcharges ?? []) {
      const qty = addons[s.code] ?? 0;
      if (qty <= 0) continue;
      const total = s.per_night ? Number(s.price_zar) * qty * nights : Number(s.price_zar) * qty;
      lines.push({
        label: `${s.name}${s.per_night ? ` · ${qty}/day × ${nights} nights` : qty > 1 ? ` × ${qty}` : ""}`,
        amount: total,
      });
    }
    return { lines, grand: lines.reduce((s, l) => s + l.amount, 0) };
  }, [pets, speciesRates, addons, nights, rates.data]);

  const petsReady = pets.every((p) => p.name.trim() && p.accommodation);
  const transportReady = !transport.pickup && !transport.dropoff ? true : addr.ready;
  const contactReady =
    contact.first_name.trim() && contact.last_name.trim() && /.+@.+\..+/.test(contact.email);
  const canSubmit =
    Boolean(tenant.data) && checkIn && nights >= 1 && petsReady && contactReady && transportReady &&
    overNights.length === 0 && !submitting;

  async function onSubmit() {
    if (!tenant.data || !canSubmit) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("public-hotel-booking", {
        body: {
          tenant_slug: tenantSlug || undefined,
          ...contact,
          check_in: checkIn,
          check_out: checkOut,
          pets: pets.map((p) => ({
            name: p.name.trim(),
            species: p.species,
            size: p.size || undefined,
            breed: p.breed.trim() || undefined,
            accommodation: p.accommodation,
          })),
          addons: Object.entries(addons)
            .filter(([, q]) => q > 0)
            .map(([code, quantity]) => ({ code, quantity })),
          pickup_required: transport.pickup,
          dropoff_required: transport.dropoff,
          ...((transport.pickup || transport.dropoff) ? addressPayload(addr) : {}),
          notes: notes.trim() || undefined,
          estimate_zar: estimate?.grand,
        },
      });
      if (error) throw new Error(error.message);
      const err = (data as any)?.error;
      if (err === "fully_booked") {
        toast.error("Sorry — those nights have just filled up. Please pick different dates.");
        houseQ.refetch();
        return;
      }
      if (err) throw new Error(err);
      setDone(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e: any) {
      toast.error(e?.message ?? "Something went wrong — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (tenant.isLoading) {
    return <div className="grid place-items-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (!tenant.data) {
    return (
      <div className="rounded-2xl border border-border bg-sk-surface p-8 text-center text-sm text-muted-foreground">
        We couldn't find that business. Please check the link and try again.
      </div>
    );
  }

  if (done) {
    return (
      <div className="mx-auto max-w-lg space-y-4 rounded-2xl border border-border bg-sk-surface p-8 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-sk-turquoise" />
        <h1 className="text-xl font-bold">Request received!</h1>
        <p className="text-sm text-muted-foreground">
          Thanks {contact.first_name} — we've got your {species === "cat" ? "cattery" : "hotel"} request for{" "}
          {new Date(`${checkIn}T00:00:00`).toLocaleDateString("en-ZA", { day: "2-digit", month: "short" })} to{" "}
          {new Date(`${checkOut}T00:00:00`).toLocaleDateString("en-ZA", { day: "2-digit", month: "short" })}.
          Our team will confirm your booking by email shortly.
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
      </div>
      <BookingPhotos title="Hotel & Cattery" subtitle="A little holiday for your best friend. Choose their dates and accommodation, with prices from our current rate card." />
      <AwardPlaceholder />
      <AccountBar service="hotel" />
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-6">
      {/* Dates */}
      <section className="booking-section space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><CalendarDays className="h-5 w-5 text-primary" /> Your stay</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Check-in</span>
            <input type="date" value={checkIn} min={addDays(new Date().toISOString().slice(0, 10), 0)} onChange={(e) => setCheckIn(e.target.value)} className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Check-out</span>
            <input
              type="date"
              value={checkOut}
              min={checkIn ? addDays(checkIn, 1) : undefined}
              disabled={!checkIn}
              onChange={(e) => e.target.value && checkIn && setNights(nightsBetween(checkIn, e.target.value))}
              className={inputCls}
            />
          </label>
          <div>
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Nights</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" aria-label="Fewer nights" type="button" onClick={() => setNights((n) => Math.max(1, n - 1))} className="shrink-0">
                <Minus className="h-4 w-4" />
              </Button>
              <span className="w-8 text-center text-sm font-semibold">{nights}</span>
              <Button variant="outline" size="icon" aria-label="More nights" type="button" onClick={() => setNights((n) => n + 1)} className="shrink-0">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
        <HouseCapacityNotice rows={houseQ.data} petCount={pets.length} mode="block" loading={houseQ.isLoading} />
      </section>

      {/* Pets */}
      <section className="booking-section space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Who's staying?</h2>
          {pets.length < 6 && (
            <Button variant="ghost" size="sm" type="button" onClick={() => setPets((p) => [...p, emptyPet()])} className="text-xs font-semibold text-sk-coral hover:text-sk-coral-dark">
              + Add another pet
            </Button>
          )}
        </div>
        {pets.map((p, i) => (
          <div key={i} className="space-y-3 rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">Pet {i + 1}</span>
              {pets.length > 1 && (
                <Button variant="ghost" size="sm" type="button" onClick={() => setPets((prev) => prev.filter((_, j) => j !== i))} className="text-xs text-muted-foreground hover:text-destructive">
                  Remove
                </Button>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">Name</span>
                <input value={p.name} onChange={(e) => setPet(i, { name: e.target.value })} className={inputCls} placeholder="Bella" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">Species</span>
                <select value={p.species} onChange={(e) => setPet(i, { species: e.target.value as "dog" | "cat", accommodation: "" })} className={selectCls}>
                  <option value="dog">Dog</option>
                  <option value="cat">Cat</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">Size</span>
                <select value={p.size} onChange={(e) => setPet(i, { size: e.target.value as PetSizeBand })} className={selectCls}>
                  <option value="">— Select size —</option>
                  {SIZE_BAND_ORDER.map((s) => <option key={s} value={s}>{SIZE_BAND_LABEL[s]}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">Breed (optional)</span>
                <input value={p.breed} onChange={(e) => setPet(i, { breed: e.target.value })} className={inputCls} placeholder="Labrador" />
              </label>
            </div>
            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold">Choose accommodation for {p.name || `Pet ${i + 1}`}</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {(rates.data?.rates ?? []).filter(r => r.species === p.species).map((r, index) => {
                  const blocked = !rateAllowsSize(r, p.size);
                  const selected = p.accommodation === r.accommodation_type;
                  const photo = bookingPhotos[index % bookingPhotos.length];
                  return <Button key={r.accommodation_type} type="button" variant="outline" disabled={blocked} aria-pressed={selected} onClick={() => setPet(i, { accommodation: r.accommodation_type })} className={`relative h-auto flex-col items-stretch overflow-hidden whitespace-normal p-0 text-left hover:bg-card ${selected ? "border-primary ring-1 ring-primary" : "border-border"}`}>
                    {p.species === "dog" ? <img src={photo.url} alt={photo.alt} loading="lazy" className="h-32 w-full object-cover" /> : <div className="flex h-32 items-center justify-center bg-accent text-sm text-accent-foreground">Cattery photos coming soon</div>}
                    <div className="space-y-2 p-3">
                      <div className="flex items-center justify-between gap-2"><span className="font-semibold">{r.display_name}</span>{selected && <Check className="h-4 w-4 text-primary" />}</div>
                      <p className="text-xs font-normal text-muted-foreground">{p.species === "dog" ? "Illustrative photo · accommodation photos to follow" : "For our feline guests"}</p>
                      <p className="text-base font-bold">{fmtZar(Number(r.nightly_rate_zar))}<span className="text-xs font-normal text-muted-foreground"> / night</span></p>
                      {blocked && <p className="text-xs font-normal text-muted-foreground">{!p.size ? "Select your pet’s size to check suitability" : "Not available for this size"}</p>}
                    </div>
                  </Button>;
                })}
              </div>
            </fieldset>
          </div>
        ))}
        {speciesRates.length === 0 && !rates.isLoading && (
          <p className="text-xs text-sk-coral-dark">No rates are set up yet — please contact us to book.</p>
        )}
      </section>

      {/* Add-ons */}
      {(rates.data?.surcharges.length ?? 0) > 0 && (
        <section className="booking-section space-y-3">
          <h2 className="text-sm font-semibold">Extras</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {rates.data?.surcharges.map((s) => {
              const qty = addons[s.code] ?? 0;
              return (
                <div key={s.code} className={"flex items-center justify-between gap-3 rounded-xl border p-3 " + (qty > 0 ? "border-sk-coral bg-sk-coral-soft" : "border-border bg-card")}>
                  <div>
                    <div className="text-sm font-medium">{s.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {fmtZar(Number(s.price_zar))}{s.per_night ? " per pet per day" : " once-off"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" aria-label={`Fewer ${s.name}`} type="button" onClick={() => setAddons((a) => ({ ...a, [s.code]: Math.max(0, (a[s.code] ?? 0) - 1) }))} className="h-8 w-8 shrink-0">
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                    <span className="w-5 text-center text-sm font-semibold">{qty}</span>
                    <Button variant="outline" size="icon" aria-label={`More ${s.name}`} type="button" onClick={() => setAddons((a) => ({ ...a, [s.code]: (a[s.code] ?? 0) + 1 }))} className="h-8 w-8 shrink-0">
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Transport */}
      <section className="booking-section space-y-3">
        <h2 className="text-sm font-semibold">Collection & drop-off (optional)</h2>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={transport.pickup} onChange={(e) => setTransport((t) => ({ ...t, pickup: e.target.checked }))} />
            Collect my pet{ pets.length > 1 ? "s" : "" } on check-in day
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={transport.dropoff} onChange={(e) => setTransport((t) => ({ ...t, dropoff: e.target.checked }))} />
            Drop {pets.length > 1 ? "them" : "them"} off on check-out day
          </label>
        </div>
        {(transport.pickup || transport.dropoff) && (
          <PublicAddressField a={addr} label="Collection / drop-off address" />
        )}
      </section>

      {/* Contact */}
      <section className="booking-section space-y-3">
        <h2 className="text-sm font-semibold">Your details</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">First name</span>
            <input value={contact.first_name} onChange={(e) => setContact((c) => ({ ...c, first_name: e.target.value }))} className={inputCls} autoComplete="given-name" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Last name</span>
            <input value={contact.last_name} onChange={(e) => setContact((c) => ({ ...c, last_name: e.target.value }))} className={inputCls} autoComplete="family-name" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Email</span>
            <input type="email" value={contact.email} onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))} className={inputCls} autoComplete="email" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Mobile</span>
            <input value={contact.mobile} onChange={(e) => setContact((c) => ({ ...c, mobile: e.target.value }))} className={inputCls} placeholder="+27…" autoComplete="tel" />
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Anything we should know? (optional)</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sk-coral/40" placeholder="Feeding, medication, anxieties…" />
        </label>
      </section>

      </div>
      {/* Estimate + submit */}
      <aside className="booking-summary space-y-4 rounded-lg border border-border bg-card p-5 lg:sticky lg:top-6">
        <div className="flex items-center gap-2 text-xs font-medium text-sk-turquoise-dark"><CheckCircle2 className="h-4 w-4" /> Request now · Team confirmation follows</div>
        <h2 className="text-lg font-semibold">Your stay at a glance</h2>
        <div className="space-y-2 border-y border-border py-3 text-sm">
          <div className="flex justify-between gap-3"><span className="text-muted-foreground">Dates</span><span className="text-right font-medium">{checkIn ? new Date(`${checkIn}T00:00:00`).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" }) : "Choose dates"}{checkOut && <> — {new Date(`${checkOut}T00:00:00`).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" })}</>}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Guests</span><span>{pets.length} pet{pets.length === 1 ? "" : "s"} · {nights} night{nights === 1 ? "" : "s"}</span></div>
        </div>
        <h3 className="text-sm font-semibold">Estimated total</h3>
        {estimate ? (
          <div className="space-y-1 text-sm">
            {estimate.lines.map((l, i) => (
              <div key={i} className="flex justify-between gap-4">
                <span className="text-muted-foreground">{l.label}</span>
                <span className="shrink-0 font-medium">{fmtZar(l.amount)}</span>
              </div>
            ))}
            <div className="mt-2 flex justify-between border-t border-border pt-2 text-base font-bold">
              <span>Total (incl. VAT)</span>
              <span>{fmtZar(estimate.grand)}</span>
            </div>
            <p className="text-xs text-muted-foreground">Final quote is confirmed by our team — peak dates and discounts may adjust the total.</p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Pick dates, pets and accommodation to see your price.</p>
        )}
        <Button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          className="h-11 w-full"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          Request booking
        </Button>
        <p className="text-center text-xs leading-relaxed text-muted-foreground">Your booking is only confirmed once our team has reviewed your request.</p>
      </aside>
      </div>
    </div>
  );
}
