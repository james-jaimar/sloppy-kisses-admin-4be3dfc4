import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { groomingDurationPrice } from "./durationOverride";

interface Props {
  petName: string;
  baseMinutes: number;
  durationOverride?: number | null;
  surchargeOverride?: number | null;
  rate: number;
  disabled?: boolean;
  onChange: (patch: { durationOverride?: number | null; mattedSurchargeOverride?: number | null }) => void;
}

export function GroomingDurationFields({ petName, baseMinutes, durationOverride, surchargeOverride, rate, disabled, onChange }: Props) {
  const price = groomingDurationPrice(baseMinutes, durationOverride, surchargeOverride, rate);
  const inputClass = "h-10 w-full rounded-md border border-border bg-background px-3 text-sm";
  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm font-medium">
          <span>Duration (minutes)</span>
          <input aria-label={`${petName} duration (minutes)`} className={inputClass} type="number" min={15} step={15} required disabled={disabled} value={price.durationMinutes || ""}
            onChange={e => onChange({ durationOverride: Number(e.target.value), mattedSurchargeOverride: null })} />
          <span className="block text-xs font-normal text-muted-foreground">Standard: {baseMinutes} min · Extra: {price.extraMinutes} min</span>
        </label>
        <label className="space-y-1 text-sm font-medium">
          <span>Matted coat surcharge (ZAR)</span>
          <input aria-label={`${petName} matted coat surcharge (ZAR)`} className={inputClass} type="number" min={0} step={0.01} required disabled={disabled} value={price.mattedSurchargeZar}
            onChange={e => onChange({ mattedSurchargeOverride: Number(e.target.value) })} />
          <span className="block text-xs font-normal text-muted-foreground">Suggested: R{price.suggestedSurcharge.toFixed(2)} · R{rate.toFixed(2)} per extra 15 min</span>
        </label>
      </div>
      {(durationOverride != null || surchargeOverride != null) && (
        <Button type="button" variant="ghost" size="sm" className="mt-2" disabled={disabled} onClick={() => onChange({ durationOverride: null, mattedSurchargeOverride: null })}>
          <RotateCcw className="mr-2 h-3.5 w-3.5" /> Reset to standard
        </Button>
      )}
    </div>
  );
}