import { useState } from "react";
import { MapPin } from "lucide-react";

interface Props {
  latitude?: number | null;
  longitude?: number | null;
  /** Rendered pixel size of the thumbnail. */
  size?: number;
  className?: string;
  alt?: string;
}

const KEY = import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY as string | undefined;

/**
 * Small static map preview for a saved address. Degrades silently to a pin
 * placeholder when we have no coordinates or Static Maps isn't available.
 */
export default function StaticMapThumb({ latitude, longitude, size = 72, className = "", alt = "Map preview" }: Props) {
  const [failed, setFailed] = useState(false);
  const hasCoords = typeof latitude === "number" && typeof longitude === "number";
  const box = { width: size, height: size };

  if (!hasCoords || !KEY || failed) {
    return (
      <div
        style={box}
        className={`grid shrink-0 place-items-center rounded-lg border border-border bg-sk-surface-muted text-muted-foreground ${className}`}
        aria-hidden
      >
        <MapPin className="h-4 w-4" />
      </div>
    );
  }

  const px = Math.round(size * 2);
  const src =
    `https://maps.googleapis.com/maps/api/staticmap?center=${latitude},${longitude}` +
    `&zoom=16&size=${px}x${px}&scale=1&maptype=roadmap` +
    `&markers=color:0xff6b5b%7C${latitude},${longitude}&key=${KEY}`;

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      style={box}
      onError={() => setFailed(true)}
      className={`shrink-0 rounded-lg border border-border object-cover ${className}`}
    />
  );
}