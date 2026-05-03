import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useSocket } from "@/hooks/useSocket";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ReceiptBillDialog } from "@/components/ReceiptBillDialog";
import { ClipboardList, Download, Eye, Loader2 } from "lucide-react";
import { fmtInr } from "@/lib/invoice";
import {
  downloadReceiptPdf,
  normalizeReceiptSalesPayload,
  type ReceiptSale,
} from "@/lib/receipt-utils";

export const Route = createFileRoute("/shop/receipts")({ component: Page });

const API_URL = "http://localhost:5000/api";

type PeriodFilter = "all" | "date" | "month" | "year";

function rangeForPeriod(
  period: PeriodFilter,
  date: string,
  month: string,
  year: string,
): { startDate?: string; endDate?: string } {
  if (period === "all") return {};
  if (period === "date" && date) {
    const s = new Date(`${date}T00:00:00`);
    const e = new Date(`${date}T23:59:59.999`);
    return { startDate: s.toISOString(), endDate: e.toISOString() };
  }
  if (period === "month" && month) {
    const [y, m] = month.split("-").map(Number);
    const s = new Date(y, m - 1, 1, 0, 0, 0, 0);
    const e = new Date(y, m, 0, 23, 59, 59, 999);
    return { startDate: s.toISOString(), endDate: e.toISOString() };
  }
  if (period === "year" && year) {
    const y = parseInt(year, 10);
    const s = new Date(y, 0, 1, 0, 0, 0, 0);
    const e = new Date(y, 11, 31, 23, 59, 59, 999);
    return { startDate: s.toISOString(), endDate: e.toISOString() };
  }
  return {};
}

function Page() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const { onNewSale } = useSocket();

  const [period, setPeriod] = useState<PeriodFilter>("all");
  const [filterDate, setFilterDate] = useState("");
  const [filterMonth, setFilterMonth] = useState("");
  const [filterYear, setFilterYear] = useState("");
  const [applied, setApplied] = useState<{
    period: PeriodFilter;
    date: string;
    month: string;
    year: string;
  }>({ period: "all", date: "", month: "", year: "" });

  const [preview, setPreview] = useState<ReceiptSale | null>(null);

  const range = useMemo(
    () => rangeForPeriod(applied.period, applied.date, applied.month, applied.year),
    [applied],
  );

  const { data, isLoading } = useQuery({
    queryKey: ["shop-sales", range.startDate ?? "", range.endDate ?? ""],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "100", page: "1" });
      if (range.startDate) params.set("startDate", range.startDate);
      if (range.endDate) params.set("endDate", range.endDate);
      const res = await fetch(`${API_URL}/pos/sales/shop?${params}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!res.ok) throw new Error("Failed to load sales");
      return res.json();
    },
    select: (payload) => normalizeReceiptSalesPayload(payload),
  });

  const sales = data ?? [];

  useEffect(() => {
    return onNewSale(() => {
      queryClient.invalidateQueries({ queryKey: ["shop-sales"] });
    });
  }, [onNewSale, queryClient]);

  const applyFilter = () => {
    if (period === "date" && !filterDate) return;
    if (period === "month" && !filterMonth) return;
    if (period === "year" && !filterYear) return;
    setApplied({
      period,
      date: period === "date" ? filterDate : "",
      month: period === "month" ? filterMonth : "",
      year: period === "year" ? filterYear : "",
    });
  };

  const cashierName = profile?.full_name ?? null;

  const pdfForShop = (s: ReceiptSale) =>
    downloadReceiptPdf(s, {
      shopName: "KK Pharma — Branch",
      shopLocation: null,
      cashier: cashierName,
    });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-3">
          <ClipboardList className="h-7 w-7 text-primary" /> Receipts
        </h1>
        <p className="text-muted-foreground">
          Sales from your branch POS. Filters match the admin receipt log layout.
        </p>
      </header>

      <div className="rounded-2xl bg-card shadow-card p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-1 bg-secondary/50 rounded-full p-1 w-fit">
          {(["all", "date", "month", "year"] as PeriodFilter[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                setPeriod(p);
                if (p === "all") {
                  setApplied({ period: "all", date: "", month: "", year: "" });
                }
              }}
              className={`text-xs font-bold px-4 py-2 rounded-full transition-all capitalize ${
                period === p
                  ? "bg-gradient-primary text-white shadow-pink"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p === "all" ? "All" : p === "date" ? "Day" : p === "month" ? "Month" : "Year"}
            </button>
          ))}
        </div>

        {period !== "all" && (
          <div className="flex flex-wrap items-end gap-4">
            {period === "date" && (
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                  className="rounded-full h-10 w-52"
                  max={new Date().toISOString().split("T")[0]}
                />
              </div>
            )}
            {period === "month" && (
              <div className="space-y-1.5">
                <Label>Month</Label>
                <Input
                  type="month"
                  value={filterMonth}
                  onChange={(e) => setFilterMonth(e.target.value)}
                  className="rounded-full h-10 w-52"
                  max={new Date().toISOString().slice(0, 7)}
                />
              </div>
            )}
            {period === "year" && (
              <div className="space-y-1.5">
                <Label>Year</Label>
                <select
                  value={filterYear}
                  onChange={(e) => setFilterYear(e.target.value)}
                  className="h-10 rounded-full border border-input bg-background px-4 text-sm w-40"
                >
                  <option value="">Select…</option>
                  {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                    <option key={y} value={String(y)}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <Button type="button" onClick={applyFilter} className="rounded-full shadow-pink h-10">
              Apply filters
            </Button>
          </div>
        )}
      </div>

      <div className="rounded-2xl bg-card shadow-card overflow-hidden">
        {isLoading ? (
          <div className="p-12 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-xs uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="text-left p-4">Receipt</th>
                <th className="text-left p-4">When</th>
                <th className="text-left p-4">Customer</th>
                <th className="text-left p-4">Payment</th>
                <th className="text-right p-4">Total</th>
                <th className="text-right p-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((r) => (
                <tr key={r._id} className="border-t border-border">
                  <td className="p-4 font-mono text-xs">{r.receiptNo}</td>
                  <td className="p-4">{new Date(r.createdAt).toLocaleString()}</td>
                  <td className="p-4">{r.customerName || "Walk-in"}</td>
                  <td className="p-4 capitalize">{r.paymentMethod}</td>
                  <td className="p-4 text-right font-bold">{fmtInr(r.total)}</td>
                  <td className="p-4 text-right space-x-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="rounded-full"
                      onClick={() => setPreview(r)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="rounded-full"
                      onClick={() => pdfForShop(r)}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
              {sales.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-muted-foreground">
                    No sales in this range — use POS to record a sale.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <ReceiptBillDialog
        open={!!preview}
        onOpenChange={(o) => !o && setPreview(null)}
        sale={preview}
        subtitle={
          preview
            ? `Your branch · ${new Date(preview.createdAt).toLocaleString()}`
            : null
        }
        cashierLabel={cashierName}
        onDownloadPdf={pdfForShop}
      />
    </div>
  );
}
