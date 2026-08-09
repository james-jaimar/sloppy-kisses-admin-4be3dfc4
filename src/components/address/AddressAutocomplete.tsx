import { useEffect, useRef, useState, useCallback } from "react";
import { loadGoogleMaps, isGoogleMapsConfigured, ZA_BIAS } from "@/lib/maps/googleMaps";
import { MapPin, Loader2, AlertCircle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface AddressResult {
  place_id: string;
  formatted_address: string;
  address_line_1: string;
  address_line_2: string;
  suburb: string;
  city: string;
  province: string;
  postcode: string;
  country_code: string;
  latitude: number;
  longitude: number;
}

interface Suggestion {
  placeId: string;
  formattedAddress: string;
  mainText: string;
  secondaryText: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSelect: (result: AddressResult) => void;
  placeholder?: string;
  disabled?: boolean;
  label?: string;
}

export default function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = "Start typing an address…",
  disabled,
  label = "Address",
}: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lookupPaused, setLookupPaused] = useState(false);
  const [open, setOpen] = useState(false);
  const [configured] = useState(() => isGoogleMapsConfigured());
  const inputRef = useRef<HTMLInputElement>(null);
  const sessionTokenRef = useRef<any>(null);
  const abortRef = useRef<number | null>(null);

  const ensureSessionToken = useCallback(async () => {
    if (sessionTokenRef.current) return sessionTokenRef.current;
    const maps = await loadGoogleMaps();
    const lib = (await maps.importLibrary("places")) as any;
    sessionTokenRef.current = new lib.AutocompleteSessionToken();
    return sessionTokenRef.current;
  }, []);

  const fetchSuggestions = useCallback(
    async (query: string) => {
      if (lookupPaused || !query.trim() || query.trim().length < 3) {
        setSuggestions([]);
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        setError(null);
        const maps = await loadGoogleMaps();
        const lib = (await maps.importLibrary("places")) as any;
        const sessionToken = await ensureSessionToken();
        const { suggestions: raw } = await lib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: query,
          sessionToken,
          ...ZA_BIAS,
        });
        setSuggestions(
          (raw ?? []).map((s: any) => ({
            placeId: s.placePrediction?.placeId ?? "",
            formattedAddress: s.placePrediction?.text?.text ?? "",
            mainText: s.placePrediction?.structuredFormat?.mainText?.text ?? "",
            secondaryText: s.placePrediction?.structuredFormat?.secondaryText?.text ?? "",
          })),
        );
        setOpen(true);
      } catch (e) {
        console.error("Places autocomplete failed", e);
        setError("Address search is temporarily unavailable.");
        setLookupPaused(true);
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    },
    [ensureSessionToken, lookupPaused],
  );

  useEffect(() => {
    if (!configured) return;
    if (abortRef.current) window.clearTimeout(abortRef.current);
    abortRef.current = window.setTimeout(() => fetchSuggestions(value), 250);
    return () => {
      if (abortRef.current) window.clearTimeout(abortRef.current);
    };
  }, [value, configured, fetchSuggestions]);

  const handleSelect = async (suggestion: Suggestion) => {
    try {
      setLoading(true);
      setError(null);
      const maps = await loadGoogleMaps();
      const lib = (await maps.importLibrary("places")) as any;
      const Place = lib.Place;
      const place = new Place({ id: suggestion.placeId, requestedLanguage: "en-ZA" });
      await place.fetchFields({
        fields: ["location", "formattedAddress", "addressComponents", "displayName"],
      });

      const location = (place as any).location;
      const formattedAddress = (place as any).formattedAddress ?? suggestion.formattedAddress;
      const components: Array<{ types: string[]; longText: string; shortText: string }> =
        (place as any).addressComponents ?? [];

      // Reset parsed fields
      const result: AddressResult = {
        place_id: suggestion.placeId,
        formatted_address: formattedAddress,
        address_line_1: "",
        address_line_2: "",
        suburb: "",
        city: "",
        province: "",
        postcode: "",
        country_code: "ZA",
        latitude: location?.lat() ?? 0,
        longitude: location?.lng() ?? 0,
      };

      let streetNumber = "";
      let route = "";
      for (const c of components) {
        const type = c.types[0];
        if (type === "street_number") streetNumber = c.longText;
        if (type === "route") route = c.longText;
        if (type === "sublocality" || type === "sublocality_level_1") result.suburb = c.longText;
        if (type === "locality") result.city = c.longText;
        if (type === "administrative_area_level_1") result.province = c.longText;
        if (type === "postal_code") result.postcode = c.longText;
        if (type === "country") result.country_code = c.shortText?.toUpperCase() ?? "ZA";
      }
      result.address_line_1 = [streetNumber, route].filter(Boolean).join(" ").trim();

      onChange(formattedAddress);
      onSelect(result);
      setSuggestions([]);
      setOpen(false);
      sessionTokenRef.current = null; // consume token
    } catch (e) {
      console.error("Place details lookup failed", e);
      setError("We couldn't load that address from Google. Please try another one.");
    } finally {
      setLoading(false);
    }
  };

  if (!configured) {
    return (
      <label className="block">
        <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">{label}</div>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm"
        />
        <div className="mt-1 flex items-center gap-1 text-xs text-amber-600">
          <AlertCircle className="h-3 w-3" /> Google Places autocomplete is not configured.
        </div>
      </label>
    );
  }

  return (
    <label className="relative block">
      <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">{label}</div>
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => {
            setLookupPaused(false);
            setError(null);
            onChange(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => value.trim().length >= 3 && setOpen(true)}
          placeholder={placeholder}
          disabled={disabled || loading}
          className="h-10 w-full rounded-lg border border-border bg-white pl-9 pr-9 text-sm"
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </div>
      {error && (
        <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <AlertCircle className="h-3 w-3" /> {error}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => {
              setLookupPaused(false);
              setError(null);
              void fetchSuggestions(value);
            }}
          >
            <RotateCw className="h-3 w-3" /> Retry
          </Button>
        </div>
      )}
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-white py-1 shadow-lg">
          {suggestions.map((s) => (
            <button
              key={s.placeId}
              type="button"
              onClick={() => handleSelect(s)}
              className="w-full px-3 py-2 text-left hover:bg-sk-surface-muted"
            >
              <div className="text-sm font-medium">{s.mainText || s.formattedAddress}</div>
              {s.secondaryText && <div className="text-xs text-muted-foreground">{s.secondaryText}</div>}
            </button>
          ))}
        </div>
      )}
    </label>
  );
}
