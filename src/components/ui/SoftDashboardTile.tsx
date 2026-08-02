import * as React from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Loader2 } from "lucide-react";

export type SoftTileTone = "green" | "coral" | "cyan" | "orange";

const TONES: Record<SoftTileTone, { icon: string; value: string; glow: string }> = {
  green: { icon: "soft-icon-green", value: "text-sk-green", glow: "hsl(var(--sk-green-soft) / 0.9)" },
  coral: { icon: "soft-icon-coral", value: "text-sk-coral-dark", glow: "hsl(var(--sk-coral-soft) / 0.95)" },
  cyan: { icon: "soft-icon-cyan", value: "text-sk-turquoise-dark", glow: "hsl(var(--sk-turquoise-soft) / 0.95)" },
  orange: { icon: "soft-icon-orange", value: "text-sk-orange", glow: "hsl(var(--sk-orange-soft) / 0.95)" },
};

export interface SoftDashboardTileProps {
  title: string;
  subtitle: string;
  value?: string | number;
  icon: React.ReactNode;
  tone?: SoftTileTone;
  /** Renders a router Link instead of a button when provided. */
  to?: string;
  onClick?: () => void;
  /** Extra content (e.g. an attention pill) shown under the subtitle. */
  alert?: React.ReactNode;
  /** Shows a spinner in place of the value. */
  loading?: boolean;
}

export function SoftDashboardTile({
  title,
  subtitle,
  value,
  icon,
  tone = "green",
  to,
  onClick,
  alert,
  loading,
}: SoftDashboardTileProps) {
  const toneStyle = TONES[tone];

  const body = (
    <div className="soft-dashboard-tile-content">
      <div className="flex items-start justify-between gap-4">
        <div className={`soft-icon-tile ${toneStyle.icon}`}>{icon}</div>
        {loading ? (
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        ) : value !== undefined ? (
          <div className={`soft-tile-value ${toneStyle.value}`}>{value}</div>
        ) : null}
      </div>
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="soft-tile-title">{title}</div>
          <div className="soft-tile-subtitle">{subtitle}</div>
          {alert}
        </div>
        <div className="soft-chevron">
          <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6" />
        </div>
      </div>
    </div>
  );

  const style = { "--tile-glow": toneStyle.glow } as React.CSSProperties;
  const className = "soft-dashboard-tile block w-full text-left";

  if (to) {
    return (
      <Link to={to} onClick={onClick} className={className} style={style}>
        {body}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={className} style={style}>
      {body}
    </button>
  );
}

export default SoftDashboardTile;