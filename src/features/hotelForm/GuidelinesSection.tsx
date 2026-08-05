import { Section } from "./AccommodationFields";
import { useHotelGuidelines } from "./guidelinesQueries";

/** Very small markdown renderer — headings, bullets, bold. */
function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>,
  );
}

export function GuidelinesBody({ md }: { md: string }) {
  const lines = md.split("\n");
  const out: JSX.Element[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (!bullets.length) return;
    out.push(
      <ul key={`ul-${out.length}`} className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        {bullets.map((b, i) => <li key={i}>{renderInline(b)}</li>)}
      </ul>,
    );
    bullets = [];
  };
  lines.forEach((raw) => {
    const line = raw.trimEnd();
    if (/^\s*[-*]\s+/.test(line)) {
      bullets.push(line.replace(/^\s*[-*]\s+/, ""));
      return;
    }
    flush();
    if (!line.trim()) return;
    if (line.startsWith("#")) {
      out.push(
        <h3 key={`h-${out.length}`} className="pt-2 text-sm font-semibold text-foreground">
          {renderInline(line.replace(/^#+\s*/, ""))}
        </h3>,
      );
      return;
    }
    out.push(<p key={`p-${out.length}`} className="text-sm text-muted-foreground">{renderInline(line)}</p>);
  });
  flush();
  return <div className="space-y-2">{out}</div>;
}

export function GuidelinesSection({
  tenantId,
  collapsible,
  onVersion,
}: {
  tenantId: string | null | undefined;
  collapsible?: boolean;
  onVersion?: (v: number) => void;
}) {
  const q = useHotelGuidelines(tenantId);
  const md = q.data?.guidelines_md ?? "";
  if (q.data?.guidelines_version && onVersion) onVersion(q.data.guidelines_version);
  if (!md) return null;
  return (
    <Section title="Hotel guidelines" collapsible={collapsible} complete summary="Please read before confirming">
      <GuidelinesBody md={md} />
    </Section>
  );
}