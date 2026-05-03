import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Loader2, Package, Warehouse, Store, Clock, ArrowRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useSocket } from "@/hooks/useSocket";

export const Route = createFileRoute("/admin/inventory")({ component: Page });

const API_URL = "http://localhost:5000/api";

// ── helpers ──────────────────────────────────────────────────────────────────
const fmtINR = (n: number) => "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });

// ─────────────────────────────────────────────────────────────────────────────
function Page() {
  const queryClient = useQueryClient();
  const { onWarehouseUpdated, onMedicinesUpdated } = useSocket();

  // ── Live feed: invalidate instantly on socket events ─────────────────────
  useEffect(() => {
    const unsubWarehouse = onWarehouseUpdated(() => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-stats"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    });
    const unsubMedicines = onMedicinesUpdated(() => {
      queryClient.invalidateQueries({ queryKey: ["medicines"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-stats"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    });
    return () => {
      unsubWarehouse?.();
      unsubMedicines?.();
    };
  }, [onWarehouseUpdated, onMedicinesUpdated, queryClient]);

  // ── Queries ───────────────────────────────────────────────────────────────
  // All warehouse batches (the detail table)
  const { data: rows = [], isLoading: batchesLoading } = useQuery({
    queryKey: ["inventory"],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/inventory`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!res.ok) throw new Error("Failed to fetch inventory");
      return res.json();
    },
    staleTime: 0, // always consider data stale so it re-fetches on focus
    refetchInterval: 5_000, // 5s fallback polling; socket handles instant
  });

  // Per-medicine aggregated stats
  const { data: stats = [], isLoading: statsLoading } = useQuery({
    queryKey: ["inventory-stats"],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/inventory/stats`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!res.ok) throw new Error("Failed to fetch inventory stats");
      return res.json();
    },
    staleTime: 0, // always consider data stale
    refetchInterval: 5_000, // 5s fallback polling
  });

  // ── Derived totals ─────────────────────────────────────────────────────────
  const totalEntered = (stats as any[]).reduce((s, m) => s + (m.totalEntered ?? 0), 0);
  const totalWarehouse = (stats as any[]).reduce((s, m) => s + (m.warehouseStock ?? 0), 0);
  const totalDispatched = (stats as any[]).reduce((s, m) => s + (m.dispatched ?? 0), 0);
  const totalPending = (stats as any[]).reduce((s, m) => s + (m.pending ?? 0), 0);

  const isLoading = batchesLoading || statsLoading;

  return (
    <div className="space-y-8">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Master Inventory</h1>
          <p className="text-muted-foreground">
            Real-time stock levels — entered vs dispatched vs remaining.
          </p>
        </div>

        {/* Direct user to Medicines page to add stock */}
        <Button asChild className="rounded-full shadow-pink gap-2">
          <Link to="/admin/medicines">
            Add Stock via Medicines <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </header>

      {/* ── Summary stat cards ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Entered", value: totalEntered, Icon: Package, tone: "pink" },
          { label: "In Warehouse", value: totalWarehouse, Icon: Warehouse, tone: "blue" },
          { label: "Dispatched", value: totalDispatched, Icon: Store, tone: "green" },
          { label: "In Transit", value: totalPending, Icon: Clock, tone: "purple" },
        ].map(({ label, value, Icon, tone }) => (
          <div key={label} className="rounded-2xl bg-card shadow-card p-5 flex items-center gap-3">
            <div
              className={`h-10 w-10 rounded-xl grid place-items-center shrink-0 ${
                tone === "pink"
                  ? "bg-primary/10 text-primary"
                  : tone === "blue"
                    ? "bg-accent/10 text-accent"
                    : tone === "green"
                      ? "bg-green-500/10 text-green-600"
                      : "bg-tertiary/10 text-tertiary"
              }`}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                {label}
              </div>
              <div className="text-2xl font-extrabold mt-0.5">
                {isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                ) : (
                  value.toLocaleString()
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Per-medicine breakdown ──────────────────────────────────────── */}
      {stats.length > 0 && (
        <div className="rounded-2xl bg-card shadow-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center gap-3">
            <Package className="h-5 w-5 text-primary" />
            <h2 className="font-bold">Per-Medicine Stock Overview</h2>
            <span className="ml-auto text-xs text-muted-foreground hidden sm:block">
              Warehouse · Value by unit price · Dispatched
            </span>
          </div>

          <div className="divide-y divide-border">
            {(stats as any[]).map((m: any) => {
              const barTotal = Math.max(m.totalEntered, 1);
              const warehousePct = (m.warehouseStock / barTotal) * 100;
              const dispatchedPct = (m.dispatched / barTotal) * 100;
              const pendingPct = (m.pending / barTotal) * 100;

              const warehouseValue = m.warehouseStock * (m.basePrice || 0);

              return (
                <div key={m._id} className="px-6 py-4">
                  {/* medicine name */}
                  <div className="flex items-center justify-between mb-3 gap-4 flex-wrap">
                    <div>
                      <span className="font-semibold text-sm">{m.name}</span>
                      {m.category && (
                        <span className="ml-2 text-xs text-muted-foreground">{m.category}</span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Unit price: ₹{(m.basePrice || 0).toFixed(2)}
                    </span>
                  </div>

                  {/* 4 mini stat boxes */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                    <MiniStat
                      label="In Warehouse"
                      value={m.warehouseStock.toLocaleString()}
                      sub="current units"
                      valueClass="text-accent"
                    />
                    <MiniStat
                      label="In Warehouse Value"
                      value={fmtINR(warehouseValue)}
                      sub={`${m.warehouseStock} × ₹${(m.basePrice || 0).toFixed(2)}`}
                      valueClass="text-primary"
                    />
                    <MiniStat
                      label="Dispatched Value"
                      value={fmtINR((m.dispatched || 0) * (m.basePrice || 0))}
                      sub={`${m.dispatched || 0} × ₹${(m.basePrice || 0).toFixed(2)}`}
                    />
                    <MiniStat
                      label="Dispatched"
                      value={m.dispatched.toLocaleString()}
                      sub={m.pending > 0 ? `${m.pending} in transit` : "none pending"}
                      valueClass="text-green-600"
                    />
                  </div>

                  {/* Stacked progress bar */}
                  <div className="h-2 rounded-full bg-secondary overflow-hidden flex">
                    {warehousePct > 0 && (
                      <div
                        className="h-full bg-accent transition-all duration-500"
                        style={{ width: `${warehousePct}%` }}
                      />
                    )}
                    {dispatchedPct > 0 && (
                      <div
                        className="h-full bg-green-500 transition-all duration-500"
                        style={{ width: `${dispatchedPct}%` }}
                      />
                    )}
                    {pendingPct > 0 && (
                      <div
                        className="h-full bg-tertiary transition-all duration-500"
                        style={{ width: `${pendingPct}%` }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="px-6 py-3 border-t border-border bg-secondary/30 flex items-center gap-6 text-xs text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-accent inline-block" />
              In warehouse
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-green-500 inline-block" />
              Dispatched to shops (confirmed)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-tertiary inline-block" />
              In transit / pending
            </span>
          </div>
        </div>
      )}

      {/* ── All Warehouse Batches table ─────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" /> All Warehouse Batches
          </h2>
          <span className="text-xs text-muted-foreground">
            To add stock, go to{" "}
            <Link to="/admin/medicines" className="text-primary font-semibold underline">
              Medicines
            </Link>{" "}
            and add a batch there.
          </span>
        </div>

        <div className="rounded-2xl bg-card shadow-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-xs uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="text-left p-4">Medicine</th>
                <th className="text-left p-4">Category</th>
                <th className="text-left p-4">Batch</th>
                <th className="text-right p-4">Stock</th>
                <th className="text-left p-4">Expiry</th>
                <th className="text-right p-4">Price</th>
              </tr>
            </thead>
            <tbody>
              {batchesLoading ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center">
                    <p className="text-muted-foreground mb-3">
                      No batches yet. Add stock from the{" "}
                      <Link to="/admin/medicines" className="text-primary font-semibold underline">
                        Medicines
                      </Link>{" "}
                      page.
                    </p>
                  </td>
                </tr>
              ) : (
                rows.map((r: any) => (
                  <tr
                    key={r.id}
                    className="border-t border-border hover:bg-secondary/20 transition-colors"
                  >
                    <td className="p-4 font-semibold">
                      {r.medicines?.name}
                      <div className="text-xs text-muted-foreground font-mono">
                        {r.medicines?.sku}
                      </div>
                    </td>
                    <td className="p-4 text-tertiary font-medium">{r.medicines?.category}</td>
                    <td className="p-4">{r.batch_number}</td>
                    <td
                      className={`p-4 text-right font-bold ${r.stock < 50 ? "text-primary" : ""}`}
                    >
                      {r.stock.toLocaleString()}
                      {r.stock < 50 && r.stock > 0 && (
                        <div className="text-[10px] font-normal text-primary">Low stock</div>
                      )}
                      {r.stock === 0 && (
                        <div className="text-[10px] font-normal text-destructive">Out</div>
                      )}
                    </td>
                    <td className="p-4">{r.expiry_date}</td>
                    <td className="p-4 text-right">₹{Number(r.unit_price).toFixed(2)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// ── Mini stat box component ───────────────────────────────────────────────────
function MiniStat({
  label,
  value,
  sub,
  valueClass = "",
  subClass = "text-muted-foreground",
}: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
  subClass?: string;
}) {
  return (
    <div className="rounded-xl bg-secondary/40 px-3 py-2">
      <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wide">
        {label}
      </div>
      <div className={`font-extrabold ${valueClass}`}>{value}</div>
      {sub && <div className={`text-[10px] ${subClass}`}>{sub}</div>}
    </div>
  );
}
