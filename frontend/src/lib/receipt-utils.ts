import { generateInvoicePdf } from "@/lib/invoice";

/** Normalized sale row for receipt list + preview (Mongo /api/pos) */

export type ReceiptSale = {
  _id: string;
  receiptNo: string;
  createdAt: string;
  customerName?: string;
  customerPhone?: string;
  paymentMethod: string;
  shopId?: { _id: string; name?: string } | string;
  items: Array<{
    medicineName: string;
    batchNumber: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  subtotal: number;
  taxAmount: number;
  total: number;
};

export function shopLabel(s: ReceiptSale): string {
  const sid = s.shopId;
  if (sid && typeof sid === "object" && "name" in sid && sid.name) return sid.name;
  return "—";
}

export function normalizeReceiptSale(raw: unknown): ReceiptSale | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = r._id != null ? String(r._id) : "";
  if (!id) return null;

  const itemsIn = Array.isArray(r.items) ? r.items : [];
  const items = itemsIn
    .filter(Boolean)
    .map((it) => {
      const i = it as Record<string, unknown>;
      return {
        medicineName: String(i.medicineName ?? ""),
        batchNumber: String(i.batchNumber ?? ""),
        quantity: Number(i.quantity ?? 0),
        unitPrice: Number(i.unitPrice ?? 0),
        lineTotal: Number(i.lineTotal ?? 0),
      };
    });

  const created = r.createdAt;
  const createdAt =
    typeof created === "string"
      ? created
      : created instanceof Date
        ? created.toISOString()
        : String(created ?? "");

  return {
    _id: id,
    receiptNo: String(r.receiptNo ?? ""),
    createdAt,
    customerName: r.customerName != null ? String(r.customerName) : undefined,
    customerPhone: r.customerPhone != null ? String(r.customerPhone) : undefined,
    paymentMethod: String(r.paymentMethod ?? "cash"),
    shopId: r.shopId as ReceiptSale["shopId"],
    items,
    subtotal: Number(r.subtotal ?? 0),
    taxAmount: Number(r.taxAmount ?? 0),
    total: Number(r.total ?? 0),
  };
}

export function normalizeReceiptSalesPayload(data: unknown): ReceiptSale[] {
  if (!data || typeof data !== "object") return [];
  const sales = (data as { sales?: unknown }).sales;
  if (!Array.isArray(sales)) return [];
  return sales.map(normalizeReceiptSale).filter(Boolean) as ReceiptSale[];
}

export function downloadReceiptPdf(
  sale: ReceiptSale,
  opts: { shopName: string; shopLocation?: string | null; cashier?: string | null },
) {
  generateInvoicePdf({
    receiptNo: sale.receiptNo,
    shopName: opts.shopName,
    shopLocation: opts.shopLocation ?? null,
    customerName: sale.customerName,
    customerPhone: sale.customerPhone,
    cashier: opts.cashier ?? null,
    paymentMethod: sale.paymentMethod,
    createdAt: new Date(sale.createdAt),
    items: sale.items.map((i) => ({
      name: i.medicineName,
      batch: i.batchNumber,
      qty: i.quantity,
      unitPrice: i.unitPrice,
      lineTotal: i.lineTotal,
    })),
    subtotal: sale.subtotal,
    tax: sale.taxAmount,
    total: sale.total,
  });
}
