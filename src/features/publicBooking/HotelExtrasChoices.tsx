import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { hotelMoney } from "./HotelBookingPresentation";
import type { HotelExtraRate } from "../../../supabase/functions/_shared/hotel-extras";

export function HotelExtrasChoices({ catalog, quantities, onChange, petCount }: {
  catalog: HotelExtraRate[]; quantities: Record<string, number>;
  onChange: (code: string, quantity: number) => void; petCount: number;
}) {
  if (!catalog.length) return null;
  return <section className="booking-section space-y-3">
    <h2 className="text-sm font-semibold">Extras</h2>
    <div className="grid gap-2 sm:grid-cols-2">
      {catalog.map(extra => {
        const quantity = quantities[extra.code] ?? 0;
        const daily = extra.per_night && !/walk/i.test(extra.code);
        return <div key={extra.code} className={`flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-lg border p-3 ${quantity ? "border-primary bg-primary/10" : "border-border bg-card"}`}>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">{extra.name}</div>
            <div className="text-xs text-muted-foreground">{hotelMoney(Number(extra.price_zar))} per pet{daily ? " per day" : /walk/i.test(extra.code) ? " per walk" : " per stay"}</div>
            {quantity > 0 && <div className="mt-1 text-xs text-muted-foreground">{quantity} per pet{daily ? " daily" : " over the stay"} · {quantity * petCount} total{daily ? " per day" : ""}</div>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" size="icon" type="button" aria-label={`Fewer ${extra.name}`} disabled={quantity === 0} onClick={() => onChange(extra.code, quantity - 1)} className="h-8 w-8"><Minus className="h-3.5 w-3.5" /></Button>
            <span className="w-6 text-center text-sm font-semibold tabular-nums">{quantity}</span>
            <Button variant="outline" size="icon" type="button" aria-label={`More ${extra.name}`} disabled={quantity >= (extra.code === "late_checkout" ? 1 : 100)} onClick={() => onChange(extra.code, quantity + 1)} className="h-8 w-8"><Plus className="h-3.5 w-3.5" /></Button>
          </div>
        </div>;
      })}
    </div>
  </section>;
}