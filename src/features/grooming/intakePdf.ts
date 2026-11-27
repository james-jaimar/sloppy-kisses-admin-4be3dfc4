import type { PaymentFlag } from "@/features/shared/payments/paymentFlags";

export interface IntakePdfRow {
  number: number | undefined; timeIn: string; timeSub: string | null;
  owner: string | null; ownerSub: string | null; pet: string; breed: string;
  pkg: string; station: string; band: number; firstOfOwner: boolean; payment: PaymentFlag | undefined;
}

// Soft owner bands echoing the parlour highlighters (yellow, green, pink, blue).
const BANDS: [number, number, number][] = [[255, 241, 194], [214, 240, 214], [252, 221, 226], [214, 236, 246]];

function payText(p: PaymentFlag | undefined) {
  if (!p || p.status === "none" || p.status === "loading" || p.status === "unavailable") return "—";
  if (p.status === "paid") return "Paid";
  if (p.status === "draft") return "Not issued";
  const due = `R${p.balanceDue.toLocaleString("en-ZA", { minimumFractionDigits: 2 })} due`;
  return p.status === "overdue" ? `${due} (overdue)` : due;
}

/** A4 portrait intake sheet drawn by jsPDF so layout never depends on the screen. */
export async function downloadIntakePdf(opts: { day: Date; rows: IntakePdfRow[]; appointments: number; business: string }) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const W = doc.internal.pageSize.getWidth();
  const dayLabel = opts.day.toLocaleDateString("en-ZA", { weekday: "long", day: "2-digit", month: "short", year: "numeric" });
  const drawHeader = () => {
    doc.setFont("helvetica", "bold").setFontSize(16).setTextColor(20);
    doc.text("Grooming intake", 12, 15);
    doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(90);
    doc.text(`${opts.business} · ${dayLabel}`, 12, 21);
    doc.setFillColor(20, 20, 20).roundedRect(W - 62, 8, 50, 15, 2, 2, "F");
    doc.setTextColor(255).setFont("helvetica", "bold").setFontSize(18);
    doc.text(String(opts.rows.length), W - 55, 18.5);
    doc.setFontSize(9).text(`pets`, W - 42, 14.5);
    doc.setFont("helvetica", "normal").text(`${opts.appointments} appts`, W - 42, 19.5);
  };
  const body = opts.rows.map((r) => [
    r.number == null ? "—" : String(r.number),
    r.timeSub ? `${r.timeIn}\n${r.timeSub}` : r.timeIn,
    r.firstOfOwner ? (r.ownerSub ? `${r.owner ?? "—"}\n${r.ownerSub}` : r.owner ?? "—") : '  "',
    `${r.pet}\n${r.breed}`, r.pkg, r.station, payText(r.payment),
  ]);
  autoTable(doc, {
    startY: 28, margin: { left: 12, right: 12, top: 28, bottom: 14 },
    head: [["#", "Time in", "Owner", "Pet & breed", "Package", "Station", "Payment"]],
    body, theme: "grid", rowPageBreak: "avoid",
    styles: { font: "helvetica", fontSize: 9, cellPadding: 1.8, textColor: 20, lineColor: [200, 200, 200], lineWidth: 0.2, valign: "middle", overflow: "linebreak" },
    headStyles: { fillColor: [40, 40, 40], textColor: 255, fontStyle: "bold", fontSize: 8.5 },
    columnStyles: {
      0: { cellWidth: 12, halign: "center", fontStyle: "bold", fontSize: 14 },
      1: { cellWidth: 17, fontStyle: "bold" }, 2: { cellWidth: 40 }, 3: { cellWidth: 38 },
      4: { cellWidth: 37 }, 5: { cellWidth: 18 }, 6: { cellWidth: 24 },
    },
    didParseCell: (d) => {
      if (d.section !== "body") return;
      const r = opts.rows[d.row.index];
      d.cell.styles.fillColor = BANDS[r.band % BANDS.length];
      if (d.column.index === 2 && !r.firstOfOwner) { d.cell.styles.fontSize = 14; d.cell.styles.textColor = 110; }
      if (d.column.index === 6 && r.payment && (r.payment.status === "unpaid" || r.payment.status === "overdue")) { d.cell.styles.textColor = [180, 30, 30]; d.cell.styles.fontStyle = "bold"; }
    },
    didDrawCell: (d) => {
      // Thicker rule above each new owner group.
      if (d.section === "body" && opts.rows[d.row.index].firstOfOwner && d.column.index === 0 && d.row.index > 0) {
        doc.setDrawColor(60).setLineWidth(0.6).line(12, d.cell.y, W - 12, d.cell.y);
      }
    },
    didDrawPage: drawHeader,
  });
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(120);
    doc.text(`Same colour = same owner`, 12, doc.internal.pageSize.getHeight() - 7);
    doc.text(`Page ${i} of ${pages}`, W - 12, doc.internal.pageSize.getHeight() - 7, { align: "right" });
  }
  const iso = `${opts.day.getFullYear()}-${String(opts.day.getMonth() + 1).padStart(2, "0")}-${String(opts.day.getDate()).padStart(2, "0")}`;
  doc.save(`grooming-intake-${iso}.pdf`);
}
