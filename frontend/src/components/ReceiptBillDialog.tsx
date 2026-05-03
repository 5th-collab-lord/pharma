import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Download } from "lucide-react";
import { fmtInr } from "@/lib/invoice";
import type { ReceiptSale } from "@/lib/receipt-utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sale: ReceiptSale | null;
  subtitle: string | null;
  cashierLabel?: string | null;
  onDownloadPdf: (sale: ReceiptSale) => void;
};

export function ReceiptBillDialog({
  open,
  onOpenChange,
  sale,
  subtitle,
  cashierLabel,
  onDownloadPdf,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm">{sale?.receiptNo ?? "—"}</DialogTitle>
          <DialogDescription>
            {subtitle ?? "Select a receipt to preview."}
            {sale && cashierLabel != null && cashierLabel !== "" ? ` · Cashier: ${cashierLabel}` : null}
          </DialogDescription>
        </DialogHeader>
        {sale && (
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-x-2 gap-y-1 text-xs">
              <span className="text-muted-foreground">Customer</span>
              <span className="font-medium">{sale.customerName || "Walk-in"}</span>
              {sale.customerPhone ? (
                <span className="text-muted-foreground">· {sale.customerPhone}</span>
              ) : null}
              <span className="text-muted-foreground">·</span>
              <span className="capitalize">{sale.paymentMethod}</span>
            </div>

            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-secondary/50">
                  <tr className="text-muted-foreground">
                    <th className="text-left py-2 px-3 font-semibold">Item</th>
                    <th className="text-left py-2 px-2 font-semibold">Batch</th>
                    <th className="text-right py-2 px-2 font-semibold w-10">Qty</th>
                    <th className="text-right py-2 px-2 font-semibold">Unit</th>
                    <th className="text-right py-2 px-3 font-semibold">Line total</th>
                  </tr>
                </thead>
                <tbody>
                  {sale.items.map((i, idx) => (
                    <tr key={idx} className="border-t border-border">
                      <td className="py-2 px-3 font-medium align-top">{i.medicineName}</td>
                      <td className="py-2 px-2 align-top">{i.batchNumber}</td>
                      <td className="py-2 px-2 text-right align-top">{i.quantity}</td>
                      <td className="py-2 px-2 text-right whitespace-nowrap align-top">
                        {fmtInr(i.unitPrice)}
                      </td>
                      <td className="py-2 px-3 text-right font-medium whitespace-nowrap align-top">
                        {fmtInr(i.lineTotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-1.5 pt-1 border-t border-border text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="tabular-nums">{fmtInr(sale.subtotal)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Tax (GST)</span>
                <span className="tabular-nums">{fmtInr(sale.taxAmount)}</span>
              </div>
              <div className="flex justify-between gap-4 font-bold text-base pt-1">
                <span>Total</span>
                <span className="tabular-nums">{fmtInr(sale.total)}</span>
              </div>
            </div>

            <Button type="button" className="w-full rounded-full" onClick={() => onDownloadPdf(sale)}>
              <Download className="h-4 w-4 mr-2" /> Download PDF
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
