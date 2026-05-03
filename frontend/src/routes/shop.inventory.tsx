import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Package, Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { fmtInr } from "@/lib/invoice";
import { useSocket } from "@/hooks/useSocket";

export const Route = createFileRoute("/shop/inventory")({ component: Page });

const API_URL = "http://localhost:5000/api";

type Row = {
  id: string;
  stock: number;
  retailPrice?: number;
  authorisedRetailPrice?: number;
  batches?: { batch_number?: string; expiry_date?: string; unit_price?: number };
  medicines?: { name?: string; category?: string; sku?: string };
  medicineId?: { name?: string; category?: string; sku?: string };
  batchId?: { batchNumber?: string; expiryDate?: string; price?: number };
};

function Page() {
  const queryClient = useQueryClient();
  const { onInventoryUpdated } = useSocket();
  const [q, setQ] = useState("");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["shop-inventory"],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/inventory/shop`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!res.ok) throw new Error("Failed to fetch branch inventory");
      return (await res.json()) as Row[];
    },
  });

  useEffect(() => {
    return onInventoryUpdated(() => {
      queryClient.invalidateQueries({ queryKey: ["shop-inventory"] });
    });
  }, [onInventoryUpdated, queryClient]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) => {
      const name = r.medicines?.name || r.medicineId?.name || "";
      const sku = r.medicines?.sku || r.medicineId?.sku || "";
      const batch =
        r.batches?.batch_number || r.batchId?.batchNumber || "";
      const blob = `${name} ${sku} ${batch}`.toLowerCase();
      return blob.includes(term);
    });
  }, [rows, q]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-3">
          <Package className="h-7 w-7 text-primary" /> Branch Inventory
        </h1>
        <p className="text-muted-foreground">
          Search by medicine, SKU, or batch. Sell at the mandated price set by admin.
        </p>
      </header>

      <div className="relative max-w-md">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, SKU, batch number…"
          className="pl-11 h-11 rounded-full"
        />
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
                <th className="text-left p-4">Medicine</th>
                <th className="text-left p-4">Batch</th>
                <th className="text-right p-4">Stock</th>
                <th className="text-left p-4">Expiry</th>
                <th className="text-right p-4">Price</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const mandate = Number(
                  r.authorisedRetailPrice ??
                    r.batchId?.price ??
                    r.batches?.unit_price ??
                    0,
                );
                const name =
                  r.medicines?.name || r.medicineId?.name || "—";
                const cat =
                  r.medicines?.category || r.medicineId?.category || "";
                const sku = r.medicines?.sku || r.medicineId?.sku || "";
                const batch =
                  r.batches?.batch_number || r.batchId?.batchNumber || "—";
                const exp =
                  r.batches?.expiry_date ||
                  (r.batchId?.expiryDate
                    ? new Date(r.batchId.expiryDate).toLocaleDateString()
                    : "N/A");
                return (
                  <tr key={r.id} className="border-t border-border">
                    <td className="p-4 font-semibold">
                      {name}
                      <div className="text-xs text-muted-foreground font-normal">
                        {cat}
                        {cat && sku ? " · " : ""}
                        {sku}
                      </div>
                    </td>
                    <td className="p-4">{batch}</td>
                    <td
                      className={`p-4 text-right font-bold ${
                        r.stock < 10 ? "text-primary" : ""
                      }`}
                    >
                      {r.stock}
                    </td>
                    <td className="p-4">{exp}</td>
                    <td className="p-4 text-right tabular-nums text-primary font-extrabold">
                      {fmtInr(mandate)}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-muted-foreground">
                    {rows.length === 0
                      ? "No stock yet — wait for an admin dispatch."
                      : "No rows match your search."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
