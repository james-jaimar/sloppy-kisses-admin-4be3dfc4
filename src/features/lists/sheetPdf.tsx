import { useState } from "react";
import { FileDown } from "lucide-react";
import { toast } from "sonner";

export interface SheetPdfSection {
  heading?: string;
  counts?: string;
  columns: { label: string; width?: number; big?: boolean }[];
  rows: string[][];
  /** Optional per-row band index for alternating fills. */
  bands?: number[];
  footer?: string;
}

const BANDS: [number, number, number][] = [[255, 241, 194], [214, 240, 214], [252, 221, 226], [214, 236, 246]];

/** Controlled A4 layout for daily lists so output never depends on the screen or browser print. */
export async function downloadSheetPdf(opts: {
  title: string; subtitle: string; landscape?: boolean; total?: { value: number; label: string; sub?: string };
  sections: SheetPdfSection[]; fileName: string; notesBox?: string;
}) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: opts.landscape ? "landscape" : "portrait" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  let heading = "";
  const drawHeader = () => {
    doc.setFont("helvetica", "bold").setFontSize(16).setTextColor(20);
    doc.text(heading || opts.title, 12, 15);
    doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(90);
    doc.text(opts.subtitle, 12, 21);
    if (opts.total) {
      doc.setFillColor(20, 20, 20).roundedRect(W - 62, 8, 50, 15, 2, 2, "F");
      doc.setTextColor(255).setFont("helvetica", "bold").setFontSize(18);
      doc.text(String(opts.total.value), W - 55, 18.5);
      doc.setFontSize(9).text(opts.total.label, W - 42, 14.5);
      if (opts.total.sub) doc.setFont("helvetica", "normal").text(opts.total.sub, W - 42, 19.5);
    }
  };
  opts.sections.forEach((s, si) => {
    if (si > 0) doc.addPage();
    heading = s.heading ?? opts.title;
    const startPage = doc.getNumberOfPages();
    drawHeader();
    if (s.counts) {
      doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(20);
      doc.text(s.counts, 12, 28);
    }
    const colStyles: Record<number, any> = {};
    s.columns.forEach((c, i) => { colStyles[i] = { ...(c.width ? { cellWidth: c.width } : {}), ...(c.big ? { fontSize: 13, fontStyle: "bold", halign: "center" } : {}) }; });
    autoTable(doc, {
      startY: s.counts ? 32 : 28, margin: { left: 12, right: 12, top: 28, bottom: 14 },
      head: [s.columns.map((c) => c.label)], body: s.rows, theme: "grid", rowPageBreak: "avoid",
      styles: { font: "helvetica", fontSize: 9, cellPadding: 1.8, textColor: 20, lineColor: [190, 190, 190], lineWidth: 0.2, valign: "middle", overflow: "linebreak" },
      headStyles: { fillColor: [40, 40, 40], textColor: 255, fontStyle: "bold", fontSize: 8.5 },
      columnStyles: colStyles,
      didParseCell: (d) => {
        if (d.section === "body" && s.bands) d.cell.styles.fillColor = BANDS[s.bands[d.row.index] % BANDS.length];
      },
      didDrawPage: () => { if (doc.getNumberOfPages() > startPage) drawHeader(); },
    });
    let y = (doc as any).lastAutoTable.finalY + 6;
    const box = s.footer ?? null;
    if (box) {
      if (y > H - 20) { doc.addPage(); drawHeader(); y = 32; }
      doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(40).text(box, 12, y);
      y += 6;
    }
    if (opts.notesBox) {
      if (y > H - 45) { doc.addPage(); drawHeader(); y = 32; }
      doc.setDrawColor(120).setLineWidth(0.3).rect(12, y, W - 24, 30);
      doc.setFont("helvetica", "bold").setFontSize(8.5).text(opts.notesBox.toUpperCase(), 14, y + 5);
      doc.setLineDashPattern([0.8, 0.8], 0);
      for (let l = 1; l <= 3; l++) doc.line(14, y + 5 + l * 7, W - 14, y + 5 + l * 7);
      doc.setLineDashPattern([], 0);
    }
  });
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(120);
    doc.text(`Page ${i} of ${pages}`, W - 12, H - 7, { align: "right" });
  }
  doc.save(opts.fileName);
}

export function PdfButton({ onClick, disabled }: { onClick: () => Promise<void>; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button" disabled={disabled || busy}
      onClick={async () => { setBusy(true); try { await onClick(); } catch { toast.error("Couldn't create the PDF. Please try again."); } finally { setBusy(false); } }}
      className="mb-3 inline-flex h-10 items-center gap-2 rounded-xl bg-sk-coral px-4 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-50 print:hidden"
    >
      <FileDown className="h-4 w-4" /> {busy ? "Preparing PDF…" : "Download PDF"}
    </button>
  );
}

export const pdfDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const fmtShort = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleDateString("en-ZA", { day: "2-digit", month: "short" }) : "open";
