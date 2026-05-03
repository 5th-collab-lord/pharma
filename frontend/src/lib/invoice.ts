import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/** INR for React UI */
export function fmtInr(n: number) {
  return (
    "₹" +
    n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

/**
 * ASCII-only rupee label for jsPDF standard fonts — Unicode ₹ / en-IN grouping
 * can corrupt Helvetica output into garbled text in the PDF viewer.
 */
export function fmtInrPdf(n: number): string {
  return (
    "Rs. " +
    n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

export interface InvoiceData {
  receiptNo: string;
  shopName: string;
  shopLocation?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  cashier?: string | null;
  paymentMethod: string;
  createdAt: Date;
  items: { name: string; batch: string; qty: number; unitPrice: number; lineTotal: number }[];
  subtotal: number;
  tax: number;
  total: number;
}

export function generateInvoicePdf(d: InvoiceData) {
  const doc = new jsPDF({ unit: "pt", format: "a5" });
  const W = doc.internal.pageSize.getWidth();
  const margin = 28;

  // Header band
  doc.setFillColor(236, 72, 153); // pink
  doc.rect(0, 0, W, 70, "F");
  doc.setTextColor("#ffffff");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("KK PHARMA", margin, 32);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Joyful Health Solutions", margin, 48);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("INVOICE", W - margin, 32, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(d.receiptNo, W - margin, 48, { align: "right" });

  // Shop / customer block
  doc.setTextColor("#000000");
  let y = 92;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(d.shopName, margin, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  if (d.shopLocation) { y += 12; doc.text(d.shopLocation, margin, y); }
  y += 12;
  doc.text(`Date: ${d.createdAt.toLocaleString()}`, margin, y);
  y += 12;
  doc.text(`Cashier: ${(d.cashier ?? "-").replace(/\u2013|\u2014/g, "-")}`, margin, y);

  let cy = 92;
  doc.setFont("helvetica", "bold");
  doc.text("Bill to:", W - margin - 140, cy);
  doc.setFont("helvetica", "normal");
  cy += 12;
  doc.text((d.customerName || "Walk-in").replace(/\u2013|\u2014/g, "-"), W - margin - 140, cy);
  if (d.customerPhone) {
    cy += 12;
    doc.text(d.customerPhone.replace(/\u2013|\u2014/g, "-"), W - margin - 140, cy);
  }

  autoTable(doc, {
    startY: y + 18,
    head: [["Medicine", "Batch", "Qty", "Unit price", "Line total"]],
    body: d.items.map((i) => [
      i.name,
      i.batch,
      String(i.qty),
      fmtInrPdf(i.unitPrice),
      fmtInrPdf(i.lineTotal),
    ]),
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [251, 207, 232], textColor: [136, 19, 55] },
    columnStyles: {
      0: { halign: "left", valign: "top" },
      1: { halign: "center", valign: "top", cellWidth: 52 },
      2: { halign: "right", valign: "top", cellWidth: 38 },
      3: { halign: "right", valign: "top", cellWidth: 74 },
      4: { halign: "right", valign: "top", cellWidth: 78 },
    },
    margin: { left: margin, right: margin },
  });

  // autoTable attaches lastAutoTable to doc
  let ty = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18;

  // Summary — label column ends before amount column (width from longest amount string)
  const pageRight = W - margin;
  const gap = 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const wSub = doc.getTextWidth(fmtInrPdf(d.subtotal));
  const wTax = doc.getTextWidth(fmtInrPdf(d.tax));
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  const wTot = doc.getTextWidth(fmtInrPdf(d.total));
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const amtBlockLeft = pageRight - Math.max(wSub, wTax, wTot) - gap;
  const labelHangRight = amtBlockLeft - gap;

  doc.text("Subtotal", labelHangRight, ty, { align: "right" });
  doc.text(fmtInrPdf(d.subtotal), pageRight, ty, { align: "right" });
  ty += 13;
  doc.text("Tax (GST)", labelHangRight, ty, { align: "right" });
  doc.text(fmtInrPdf(d.tax), pageRight, ty, { align: "right" });
  ty += 15;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("TOTAL", labelHangRight, ty, { align: "right" });
  doc.text(fmtInrPdf(d.total), pageRight, ty, { align: "right" });

  ty += 26;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Payment: ${(d.paymentMethod ?? "cash").toUpperCase()}`, margin, ty);
  ty += 22;
  doc.setFontSize(8);
  doc.setTextColor("#666666");
  doc.text(
    "Thank you for choosing KK Pharma. Get well soon!",
    W / 2,
    ty,
    { align: "center" },
  );

  doc.save(`${d.receiptNo}.pdf`);
}
