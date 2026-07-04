import { AppHeader } from "./AppHeader";
import { Construction } from "lucide-react";

export default function PlaceholderPage({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <>
      <AppHeader title={title} subtitle={subtitle ?? "This screen is scaffolded and will be built next."} />
      <div className="flex-1 p-6">
        <div className="sk-card flex flex-col items-center justify-center gap-3 p-16 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-sk-coral-soft text-sk-coral-dark">
            <Construction className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            Route wired up. UI and workflows for this section land in a follow-up pass, using the shared
            customer / pet / booking / invoice foundations.
          </p>
        </div>
      </div>
    </>
  );
}