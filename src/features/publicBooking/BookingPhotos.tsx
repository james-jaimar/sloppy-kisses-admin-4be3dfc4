import { Camera, MapPin, Trophy, Images } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger, DialogTitle } from "@/components/ui/dialog";
import daycare from "@/assets/booking/daycare.png.asset.json";
import puppy from "@/assets/booking/puppy.jpg.asset.json";
import dalmatian from "@/assets/booking/dalmatian.jpg.asset.json";

export const bookingPhotos = [
  { url: daycare.url, alt: "Dogs playing outdoors", label: "Playtime" },
  { url: dalmatian.url, alt: "A Dalmatian enjoying a cuddle", label: "A little love" },
  { url: puppy.url, alt: "A small puppy", label: "Little guests" },
];

export function AwardPlaceholder() {
  return <div className="flex items-center gap-3 border-y border-border py-3 text-sm"><Trophy className="h-5 w-5 shrink-0 text-sk-orange" /><span className="font-medium">Something to celebrate</span><span className="ml-auto text-right text-xs text-muted-foreground">Award details coming soon · placeholder</span></div>;
}

export function BookingPhotos({ title, subtitle }: { title: string; subtitle: string }) {
  return <section className="space-y-3">
    <div className="relative grid h-[330px] grid-cols-1 gap-2 overflow-hidden rounded-lg sm:h-[360px] sm:grid-cols-[1.6fr_1fr]">
      <div className="relative min-h-0 overflow-hidden">
        <img src={bookingPhotos[0].url} alt={bookingPhotos[0].alt} className="h-full w-full object-cover" />
        <div className="booking-photo-shade absolute inset-0" />
        <div className="absolute inset-x-0 bottom-0 space-y-2 p-6 text-primary-foreground sm:p-8">
          <p className="flex items-center gap-1.5 text-xs font-medium"><MapPin className="h-3.5 w-3.5" /> Bryanston, Johannesburg</p>
          <h1 className="text-3xl font-bold leading-tight sm:text-4xl">{title}</h1>
          <p className="max-w-md text-sm leading-relaxed">{subtitle}</p>
        </div>
      </div>
      <div className="hidden min-h-0 grid-cols-2 gap-2 sm:grid">
        {bookingPhotos.slice(1).map(photo => <img key={photo.url} src={photo.url} alt={photo.alt} className="h-full min-h-0 w-full object-cover" />)}
      </div>
      <Dialog><DialogTrigger asChild><Button variant="secondary" size="sm" className="absolute right-3 top-3"><Images /> Photos</Button></DialogTrigger><DialogContent className="max-w-4xl"><DialogTitle>Photos from Sloppy Kisses’ website</DialogTitle><div className="grid max-h-[65vh] gap-3 overflow-y-auto sm:grid-cols-3">{bookingPhotos.map(photo => <figure key={photo.url}><img src={photo.url} alt={photo.alt} className="aspect-[3/4] w-full rounded-md object-cover" /><figcaption className="mt-2 text-sm">{photo.label}</figcaption></figure>)}</div><p className="text-xs text-muted-foreground">Illustrative website photography, not photographs of the accommodation. Suite, play-yard and cattery photos coming soon.</p></DialogContent></Dialog>
    </div>
    <p className="flex items-start gap-2 text-xs text-muted-foreground"><Camera className="h-3.5 w-3.5 shrink-0" /> Photos from our website, shown for illustration. Actual accommodation photos coming soon.</p>
  </section>;
}