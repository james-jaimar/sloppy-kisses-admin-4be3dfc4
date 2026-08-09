// Single place the browser loads Google Maps JS from.
//
// Uses this project's own referrer-restricted browser key (not the Lovable
// connector), so nothing here changes when hosting moves off Lovable.
// The key is public by design — it is protected by HTTP-referrer + API
// restrictions in Google Cloud.

export const GOOGLE_MAPS_BROWSER_KEY =
  (import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY as string | undefined) ?? "";

export const isGoogleMapsConfigured = () => GOOGLE_MAPS_BROWSER_KEY.length > 0;

/** Bias Places autocomplete to Gauteng / Johannesburg. */
export const ZA_BIAS = {
  region: "ZA",
  includedRegionCodes: ["za"],
  locationBias: {
    // ~40 km around Bryanston
    circle: { center: { latitude: -26.0567, longitude: 28.0348 }, radius: 40000 },
  },
} as const;

let loader: Promise<typeof google.maps> | null = null;

/** Loads the Maps JS API once and resolves when `google.maps` is ready. */
export function loadGoogleMaps(): Promise<typeof google.maps> {
  if (loader) return loader;
  if (!isGoogleMapsConfigured()) {
    return Promise.reject(new Error("VITE_GOOGLE_MAPS_BROWSER_KEY is not set"));
  }

  loader = new Promise((resolve, reject) => {
    const w = window as any;
    if (w.google?.maps?.importLibrary) return resolve(w.google.maps);

    const cb = "__skInitGoogleMaps";
    w[cb] = () => resolve(w.google.maps);

    const s = document.createElement("script");
    s.async = true;
    s.src =
      "https://maps.googleapis.com/maps/api/js" +
      `?key=${encodeURIComponent(GOOGLE_MAPS_BROWSER_KEY)}` +
      "&libraries=places,marker&loading=async" +
      `&callback=${cb}&region=ZA&language=en-ZA`;
    s.onerror = () => reject(new Error("Failed to load Google Maps JS — check the browser key's referrer restrictions"));
    document.head.appendChild(s);
  });
  return loader;
}