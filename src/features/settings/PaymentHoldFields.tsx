interface Props {
  disabled?: boolean;
  requirePayment: boolean;
  holdHours: number;
  onChange: (patch: { require_payment_to_confirm?: boolean; payment_hold_hours?: number }) => void;
}

/** Shared "hold the slot until it's paid" controls for the service workflow settings pages. */
export function PaymentHoldFields({ disabled, requirePayment, holdHours, onChange }: Props) {
  return (
    <div className="space-y-4 rounded-xl border border-border p-4">
      <div className="text-sm font-semibold">Confirmation &amp; payment hold</div>

      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          disabled={disabled}
          checked={requirePayment}
          onChange={(e) => onChange({ require_payment_to_confirm: e.target.checked })}
          className="mt-1 h-4 w-4 rounded border-border"
        />
        <span className="text-sm">
          Only confirm once payment is received
          <span className="block text-xs text-muted-foreground">
            New bookings sit as “Awaiting payment” and hold the slot. They flip to Confirmed automatically the moment
            the deposit (or the full amount, where no deposit applies) is paid. Waiving the deposit on a booking skips this.
          </span>
        </span>
      </label>

      <div>
        <label className="text-sm font-medium">Hold the slot for (hours)</label>
        <p className="mb-1 text-xs text-muted-foreground">
          If it is still unpaid when the hold lapses, the booking is cancelled, the slot is released and the unpaid
          invoice is cancelled.
        </p>
        <input
          type="number"
          min={1}
          max={720}
          step={1}
          disabled={disabled || !requirePayment}
          value={holdHours}
          onChange={(e) => onChange({ payment_hold_hours: Number(e.target.value) })}
          className="h-10 w-full max-w-[12rem] rounded-lg border border-border bg-white px-3 text-sm disabled:opacity-60"
        />
      </div>
    </div>
  );
}
