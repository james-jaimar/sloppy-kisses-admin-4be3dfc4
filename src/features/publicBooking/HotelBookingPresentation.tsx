import type { ReactNode } from "react";
import { Check, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { bookingPhotos } from "./BookingPhotos";

export const hotelMoney = (n: number) => new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", minimumFractionDigits: 2 }).format(n);

export function HotelAccommodationChoices({ rates, species, value, onChange, blocked }: {
  rates: { accommodation_type: string; display_name: string; nightly_rate_zar: number }[];
  species: string;
  value: string;
  onChange: (value: string) => void;
  blocked: (rate: any) => string | null;
}) {
  return <div className="grid gap-3 sm:grid-cols-2">
    {rates.map((r, i) => {
      const reason = blocked(r);
      const selected = r.accommodation_type === value;
      const photo = bookingPhotos[i % bookingPhotos.length];
      return <Button key={r.accommodation_type} type="button" variant="outline" disabled={Boolean(reason)} aria-pressed={selected} onClick={() => onChange(r.accommodation_type)} className={`relative h-auto flex-col items-stretch overflow-hidden whitespace-normal p-0 text-left hover:bg-card ${selected ? "border-primary ring-1 ring-primary" : "border-border"}`}>
        {species === "cat" ? <div className="flex h-32 items-center justify-center bg-accent text-sm text-accent-foreground">Cat Hotel photos coming soon</div> : <img src={photo.url} alt={photo.alt} loading="lazy" className="h-32 w-full object-cover" />}
        <div className="space-y-2 p-3">
          <div className="flex items-center justify-between gap-2"><span className="font-semibold">{r.display_name}</span>{selected && <Check className="h-4 w-4 shrink-0 text-primary" />}</div>
          <p className="text-xs font-normal text-muted-foreground">{species === "cat" ? "For our feline guests" : "Illustrative photo · accommodation photos to follow"}</p>
          <p className="text-base font-bold">{hotelMoney(Number(r.nightly_rate_zar))}<span className="text-xs font-normal text-muted-foreground"> / night</span></p>
          {reason && <p className="text-xs font-normal text-muted-foreground">{reason}</p>}
        </div>
      </Button>;
    })}
  </div>;
}

export function HotelStaySummary({ checkIn, checkOut, nights, petCount, estimate, status, children, disclaimer }: {
  checkIn: string; checkOut: string; nights: number; petCount: number;
  estimate: { lines: { label: string; amount: number }[]; grand: number } | null;
  status: string; children?: ReactNode; disclaimer: string;
}) {
  const date = (v: string) => new Date(`${v}T00:00:00`).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });
  return <aside className="booking-summary min-w-0 space-y-4 rounded-lg border border-border bg-card p-5 lg:sticky lg:top-6">
    <div className="flex items-start gap-2 text-xs font-medium text-sk-turquoise-dark"><CheckCircle2 className="h-4 w-4 shrink-0" />{status}</div>
    <h2 className="text-lg font-semibold">Your stay at a glance</h2>
    <div className="space-y-2 border-y border-border py-3 text-sm">
      <div className="flex justify-between gap-3"><span className="text-muted-foreground">Dates</span><span className="text-right font-medium">{checkIn ? date(checkIn) : "Choose dates"}{checkOut && ` — ${date(checkOut)}`}</span></div>
      <div className="flex justify-between gap-3"><span className="text-muted-foreground">Guests</span><span>{petCount} pet{petCount === 1 ? "" : "s"} · {nights} night{nights === 1 ? "" : "s"}</span></div>
    </div>
    <h3 className="text-sm font-semibold">Estimated total</h3>
    {estimate ? <div className="space-y-2 text-sm">
      {estimate.lines.map((l, i) => <div key={i} className="flex justify-between gap-3"><span className="min-w-0 break-words text-muted-foreground">{l.label}</span><span className="shrink-0 font-medium">{hotelMoney(l.amount)}</span></div>)}
      <div className="flex justify-between gap-2 border-t border-border pt-3 text-base font-bold"><span>Total (incl. VAT)</span><span>{hotelMoney(estimate.grand)}</span></div>
    </div> : <p className="text-xs text-muted-foreground">Pick dates, pets and accommodation to see your price.</p>}
    <p className="text-xs leading-relaxed text-muted-foreground">{disclaimer}</p>
    {children}
  </aside>;
}