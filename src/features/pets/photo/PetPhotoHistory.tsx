import { format } from "date-fns";
import { toast } from "sonner";
import { Star, Loader2 } from "lucide-react";
import { usePetPhotoHistory, useSetMainPetPhoto, isFreshToday } from "./petPhotoQueries";
import { PetPhotoButton } from "./PetPhotoButton";

/** Every photo taken of this pet, newest first. The newest is the main picture. */
export function PetPhotoHistory({ petId, petName }: { petId: string; petName: string | null | undefined }) {
  const q = usePetPhotoHistory(petId);
  const setMain = useSetMainPetPhoto();
  const photos = q.data ?? [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {photos.length === 0
            ? "No photo on file yet."
            : isFreshToday(photos[0].created_at)
              ? "Photo taken today."
              : `Latest photo: ${format(new Date(photos[0].created_at), "d MMM yyyy")}`}
        </p>
        <PetPhotoButton petId={petId} petName={petName} label={photos.length ? "New photo" : "Take photo"} />
      </div>

      {q.isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading photos…
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          {photos.map((p, i) => (
            <div key={p.id} className="w-24 space-y-1">
              <div className={`relative overflow-hidden rounded-xl border ${i === 0 ? "border-sk-coral" : "border-border"}`}>
                {p.url ? (
                  <img src={p.url} alt={`Photo of ${petName ?? "pet"}`} className="h-24 w-24 object-cover" loading="lazy" />
                ) : (
                  <div className="grid h-24 w-24 place-items-center bg-muted text-[10px] text-muted-foreground">No preview</div>
                )}
                {i === 0 && (
                  <span className="absolute left-1 top-1 rounded-full bg-sk-coral px-1.5 py-0.5 text-[9px] font-bold text-white">
                    Main
                  </span>
                )}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {format(new Date(p.created_at), "d MMM yyyy")}
              </div>
              {i > 0 && (
                <button
                  type="button"
                  disabled={setMain.isPending}
                  onClick={async () => {
                    try {
                      await setMain.mutateAsync(p.id);
                      toast.success("Main photo updated");
                    } catch (e: any) {
                      toast.error(e?.message ?? "Couldn't update the main photo");
                    }
                  }}
                  className="inline-flex items-center gap-1 text-[10px] font-semibold text-sk-coral-dark hover:underline disabled:opacity-50"
                >
                  <Star className="h-3 w-3" /> Make main
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
