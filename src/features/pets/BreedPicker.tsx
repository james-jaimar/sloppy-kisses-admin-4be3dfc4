import { useMemo, useState, useRef, useEffect } from "react";
import { ChevronDown, X } from "lucide-react";
import { useDogBreeds, type BreedSizeBand, BREED_SIZE_LABEL } from "./breedQueries";

interface Props {
  value: string;
  onChange: (breed: string, size: BreedSizeBand | null) => void;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * Searchable dog-breed combobox backed by public.dog_breeds.
 * Selecting a listed breed also emits its size band so callers can
 * auto-fill the pet's Size field. "Other / not listed" lets the
 * caller keep a free-text breed and pick size manually.
 */
export function BreedPicker({ value, onChange, disabled, placeholder }: Props) {
  const { data: breeds = [], isLoading } = useDogBreeds({ activeOnly: true });
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? breeds.filter((b) => b.name.toLowerCase().includes(q)) : breeds;
    return list.slice(0, 60);
  }, [breeds, query]);

  const isKnown = value ? breeds.some((b) => b.name.toLowerCase() === value.toLowerCase()) : false;

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 w-full items-center justify-between rounded-lg border border-border bg-white px-3 text-left text-sm outline-none focus:ring-2 focus:ring-sk-coral/40 disabled:opacity-60"
      >
        <span className={value ? "" : "text-muted-foreground"}>
          {value || placeholder || "Select breed…"}
          {value && !isKnown && <span className="ml-2 text-xs text-muted-foreground">(custom)</span>}
        </span>
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-border bg-white shadow-lg">
          <div className="border-b border-border p-2">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search breed…"
              className="h-8 w-full rounded-md border border-border bg-white px-2 text-sm outline-none focus:ring-2 focus:ring-sk-coral/40"
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1 text-sm">
            {isLoading && <div className="px-3 py-2 text-muted-foreground">Loading…</div>}
            {!isLoading && filtered.length === 0 && (
              <div className="px-3 py-2 text-muted-foreground">No matches.</div>
            )}
            {filtered.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => { onChange(b.name, b.size_band); setOpen(false); setQuery(""); }}
                className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-sk-coral-soft"
              >
                <span>{b.name}</span>
                <span className="text-xs text-muted-foreground">{BREED_SIZE_LABEL[b.size_band]}</span>
              </button>
            ))}
            <div className="mt-1 border-t border-border">
              <button
                type="button"
                onClick={() => {
                  const custom = window.prompt("Enter breed name (not on the standard list)", query || value || "");
                  if (custom && custom.trim()) {
                    onChange(custom.trim(), null);
                  }
                  setOpen(false); setQuery("");
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sk-coral-dark hover:bg-sk-coral-soft"
              >
                <X className="h-3.5 w-3.5" /> Other / not listed…
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}