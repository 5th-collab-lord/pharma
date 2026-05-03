import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSocket } from "@/hooks/useSocket";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  IndianRupee,
  ShoppingCart,
  Truck,
  CalendarDays,
  CalendarRange,
  Sun,
  Search,
  X,
  Package,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
  Legend,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/admin/analytics")({ component: Page });

const API_URL = "http://localhost:5000/api";

type TrendKey = "daily" | "monthly" | "yearly";
type FilterType = "date" | "month" | "year";

// Format currency in ₹
const fmt = (n: number) =>
  "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Custom tooltip
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-md text-xs space-y-1 min-w-[140px]">
      <div className="font-bold text-foreground mb-1">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span
            className="h-2 w-2 rounded-full inline-block shrink-0"
            style={{ background: p.color }}
          />
          <span className="text-muted-foreground capitalize">{p.name ?? p.dataKey}:</span>
          <span className="font-semibold ml-auto">
            {p.dataKey === "revenue" ? fmt(p.value) : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function Page() {
  const queryClient = useQueryClient();
  const { onNewSale } = useSocket();

  const [trendView, setTrendView] = useState<TrendKey>("monthly");

  // Filter state
  const [filterType, setFilterType] = useState<FilterType>("date");
  const [filterDate, setFilterDate] = useState("");
  const [filterMonth, setFilterMonth] = useState("");
  const [filterYear, setFilterYear] = useState("");
  const [activeFilter, setActiveFilter] = useState<{
    filterType: FilterType;
    date?: string;
    month?: string;
    year?: string;
  } | null>(null);

  // ── Main analytics (today / month / year) ──
  const { data, isLoading } = useQuery({
    queryKey: ["analytics-stats"],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/reports/analytics`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!res.ok) throw new Error("Failed to fetch analytics");
      return res.json();
    },
    refetchInterval: 60_000,
  });

  useEffect(() => {
    return onNewSale(() => {
      queryClient.invalidateQueries({ queryKey: ["analytics-stats"] });
      queryClient.invalidateQueries({ queryKey: ["analytics-filter"] });
    });
  }, [onNewSale, queryClient]);

  // ── Custom filter query ──
  const filterQueryKey = activeFilter ? ["analytics-filter", JSON.stringify(activeFilter)] : null;

  const { data: filterResult, isFetching: filterLoading } = useQuery({
    queryKey: filterQueryKey ?? ["analytics-filter-disabled"],
    enabled: !!activeFilter,
    queryFn: async () => {
      const params = new URLSearchParams({ filterType: activeFilter!.filterType });
      if (activeFilter!.date) params.set("date", activeFilter!.date);
      if (activeFilter!.month) params.set("month", activeFilter!.month);
      if (activeFilter!.year) params.set("year", activeFilter!.year);
      const res = await fetch(`${API_URL}/reports/filter?${params}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!res.ok) throw new Error("Failed to fetch filtered stats");
      return res.json();
    },
  });

  const today = data?.today ?? { revenue: 0, orders: 0, dispatchCost: 0 };
  const month = data?.month ?? { revenue: 0, orders: 0, dispatchCost: 0 };
  const year = data?.year ?? { revenue: 0, orders: 0, dispatchCost: 0 };

  // Trend chart data
  const rawTrend: { _id: string; revenue: number; orders: number }[] =
    data?.trends?.[trendView] ?? [];
  const chartData = rawTrend.map((d) => ({
    label:
      trendView === "daily" ? d._id.slice(5) : trendView === "monthly" ? d._id.slice(0, 7) : d._id,
    revenue: d.revenue,
    orders: d.orders,
  }));

  // Filter chart data (daily breakdown of filtered period)
  const filterChartData = (filterResult?.dailyBreakdown ?? []).map((d: any) => ({
    label: d._id.slice(5),
    revenue: d.revenue,
    orders: d.orders,
  }));

  const applyFilter = () => {
    if (filterType === "date" && !filterDate) return;
    if (filterType === "month" && !filterMonth) return;
    if (filterType === "year" && !filterYear) return;
    setActiveFilter({
      filterType,
      date: filterType === "date" ? filterDate : undefined,
      month: filterType === "month" ? filterMonth : undefined,
      year: filterType === "year" ? filterYear : undefined,
    });
  };

  const clearFilter = () => {
    setActiveFilter(null);
    setFilterDate("");
    setFilterMonth("");
    setFilterYear("");
  };

  const trendLabel =
    trendView === "daily"
      ? "Last 30 days"
      : trendView === "monthly"
        ? "Last 12 months"
        : "Last 5 years";

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-3">
          <BarChart3 className="h-7 w-7 text-primary" /> Analytics
        </h1>
        <p className="text-muted-foreground">
          Revenue from sales, dispatch cost, net profit — today, monthly, yearly, or any custom
          period.
        </p>
      </header>

      {/* ── Summary Cards: Today / Month / Year ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <PeriodCard icon={<Sun className="h-4 w-4 text-primary" />} title="Today" data={today} />
        <PeriodCard
          icon={<CalendarDays className="h-4 w-4 text-tertiary" />}
          title={`${new Date().toLocaleString("default", { month: "long" })} (This Month)`}
          data={month}
          revenueLabel="Monthly Revenue"
        />
        <PeriodCard
          icon={<CalendarRange className="h-4 w-4 text-accent" />}
          title={`${new Date().getFullYear()} (This Year)`}
          data={year}
          revenueLabel="Yearly Revenue"
        />
      </div>

      {/* ── Custom Filter Panel ── */}
      <div className="rounded-2xl bg-card shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center gap-3">
          <Search className="h-5 w-5 text-primary" />
          <h2 className="font-bold text-lg">Custom Period Filter</h2>
          <span className="text-xs text-muted-foreground">
            Check revenue for any specific date, month or year
          </span>
        </div>

        <div className="p-6 space-y-5">
          {/* Filter type tabs */}
          <div className="flex items-center gap-1 bg-secondary/50 rounded-full p-1 w-fit">
            {(["date", "month", "year"] as FilterType[]).map((t) => (
              <button
                key={t}
                onClick={() => {
                  setFilterType(t);
                  setActiveFilter(null);
                }}
                className={`text-xs font-bold px-5 py-2 rounded-full transition-all capitalize ${
                  filterType === t
                    ? "bg-gradient-primary text-white shadow-pink"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t === "date" ? "Specific Day" : t === "month" ? "Month" : "Year"}
              </button>
            ))}
          </div>

          {/* Inputs */}
          <div className="flex flex-wrap items-end gap-4">
            {filterType === "date" && (
              <div className="space-y-1.5">
                <Label>Select Date</Label>
                <Input
                  type="date"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                  className="rounded-full h-10 w-52"
                  max={new Date().toISOString().split("T")[0]}
                />
              </div>
            )}
            {filterType === "month" && (
              <div className="space-y-1.5">
                <Label>Select Month</Label>
                <Input
                  type="month"
                  value={filterMonth}
                  onChange={(e) => setFilterMonth(e.target.value)}
                  className="rounded-full h-10 w-52"
                  max={new Date().toISOString().slice(0, 7)}
                />
              </div>
            )}
            {filterType === "year" && (
              <div className="space-y-1.5">
                <Label>Select Year</Label>
                <select
                  value={filterYear}
                  onChange={(e) => setFilterYear(e.target.value)}
                  className="h-10 rounded-full border border-input bg-background px-4 text-sm w-40"
                >
                  <option value="">Select year…</option>
                  {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                    <option key={y} value={String(y)}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex items-center gap-2 pb-0.5">
              <Button
                onClick={applyFilter}
                className="rounded-full shadow-pink h-10 px-6"
                disabled={
                  filterLoading ||
                  (filterType === "date" && !filterDate) ||
                  (filterType === "month" && !filterMonth) ||
                  (filterType === "year" && !filterYear)
                }
              >
                {filterLoading ? "Loading…" : "Apply Filter"}
              </Button>
              {activeFilter && (
                <Button
                  variant="outline"
                  onClick={clearFilter}
                  className="rounded-full h-10 px-4 gap-1.5"
                >
                  <X className="h-3.5 w-3.5" /> Clear
                </Button>
              )}
            </div>
          </div>

          {/* Filter Results */}
          {activeFilter && filterResult && (
            <div className="space-y-5 pt-2">
              {/* Result label */}
              <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-3">
                  Results for: {filterResult.label}
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>

              {/* Stat cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  {
                    label: "Revenue",
                    value: fmt(filterResult.revenue),
                    sub: `${filterResult.orders} orders`,
                    Icon: IndianRupee,
                    tone: "pink" as const,
                  },
                  {
                    label: "Dispatch Cost",
                    value: fmt(filterResult.dispatchCost),
                    sub: "medicines sent",
                    Icon: Truck,
                    tone: "purple" as const,
                  },
                  {
                    label: "Net Profit",
                    value: fmt(filterResult.net),
                    sub: filterResult.net >= 0 ? "Profitable" : "Loss",
                    Icon: filterResult.net >= 0 ? TrendingUp : TrendingDown,
                    tone: filterResult.net >= 0 ? ("green" as const) : ("pink" as const),
                  },
                  {
                    label: "Avg Order",
                    value: fmt(filterResult.avgOrder ?? 0),
                    sub: "per transaction",
                    Icon: ShoppingCart,
                    tone: "blue" as const,
                  },
                ].map(({ label, value, sub, Icon, tone }) => (
                  <div
                    key={label}
                    className="rounded-2xl bg-secondary/40 p-4 flex items-center gap-3"
                  >
                    <div
                      className={`h-9 w-9 rounded-xl grid place-items-center shrink-0 ${
                        tone === "pink"
                          ? "bg-primary/10 text-primary"
                          : tone === "purple"
                            ? "bg-tertiary/10 text-tertiary"
                            : tone === "green"
                              ? "bg-green-500/10 text-green-600"
                              : "bg-accent/10 text-accent"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        {label}
                      </div>
                      <div className="text-lg font-extrabold leading-tight truncate">{value}</div>
                      <div className="text-[10px] text-muted-foreground">{sub}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Daily breakdown chart (only shown for month / year filter) */}
              {filterType !== "date" && filterChartData.length > 0 && (
                <div className="rounded-2xl border border-border overflow-hidden">
                  <div className="px-4 py-3 border-b border-border bg-secondary/30">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                      Daily Revenue Breakdown
                    </span>
                  </div>
                  <div className="p-4 h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={filterChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis
                          dataKey="label"
                          fontSize={10}
                          stroke="hsl(var(--muted-foreground))"
                        />
                        <YAxis
                          fontSize={10}
                          stroke="hsl(var(--muted-foreground))"
                          tickFormatter={(v) => "₹" + v.toLocaleString("en-IN")}
                        />
                        <Tooltip content={<ChartTooltip />} />
                        <Bar
                          dataKey="revenue"
                          fill="oklch(0.66 0.24 350)"
                          radius={[6, 6, 0, 0]}
                          name="Revenue"
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Top medicines */}
              {filterResult.topMedicines?.length > 0 && (
                <div className="rounded-2xl border border-border overflow-hidden">
                  <div className="px-4 py-3 border-b border-border bg-secondary/30 flex items-center gap-2">
                    <Package className="h-4 w-4 text-primary" />
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                      Top Selling Medicines
                    </span>
                  </div>
                  <div className="divide-y divide-border">
                    {filterResult.topMedicines.map((m: any, i: number) => (
                      <div
                        key={m._id ?? i}
                        className="px-4 py-3 flex items-center justify-between text-sm"
                      >
                        <div className="flex items-center gap-3">
                          <span className="h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-bold grid place-items-center shrink-0">
                            {i + 1}
                          </span>
                          <span className="font-semibold">{m.name}</span>
                        </div>
                        <div className="flex items-center gap-4 text-muted-foreground">
                          <span>{m.totalQuantity} units</span>
                          <span className="font-bold text-accent">{fmt(m.totalRevenue)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {filterResult.orders === 0 && (
                <div className="text-center py-6 text-sm text-muted-foreground">
                  No sales found for <span className="font-semibold">{filterResult.label}</span>.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Trend Charts ── */}
      <div className="rounded-2xl bg-card shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-4 flex-wrap">
          <h2 className="font-bold text-lg">Revenue Trend</h2>
          <div className="flex items-center gap-1 bg-secondary/50 rounded-full p-1">
            {(["daily", "monthly", "yearly"] as TrendKey[]).map((v) => (
              <button
                key={v}
                onClick={() => setTrendView(v)}
                className={`text-xs font-bold px-4 py-1.5 rounded-full transition-all ${
                  trendView === v
                    ? "bg-gradient-primary text-white shadow-pink"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {v === "daily"
                  ? "Last 30 days"
                  : v === "monthly"
                    ? "Last 12 months"
                    : "Last 5 years"}
              </button>
            ))}
          </div>
        </div>
        <div className="p-6">
          {isLoading ? (
            <div className="h-72 flex items-center justify-center text-muted-foreground text-sm">
              Loading…
            </div>
          ) : chartData.length === 0 ? (
            <div className="h-72 flex items-center justify-center text-muted-foreground text-sm">
              No sales data for this period yet.
            </div>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={11}
                    tickFormatter={(v) => "₹" + v.toLocaleString("en-IN")}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend
                    formatter={(v) => (
                      <span className="text-xs text-muted-foreground capitalize">{v}</span>
                    )}
                  />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    stroke="oklch(0.66 0.24 350)"
                    strokeWidth={3}
                    dot={{ r: 4 }}
                    name="Revenue"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* ── Orders bar chart ── */}
      <div className="rounded-2xl bg-card shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center gap-3">
          <ShoppingCart className="h-5 w-5 text-tertiary" />
          <h2 className="font-bold text-lg">Orders</h2>
          <span className="text-xs text-muted-foreground ml-1">{trendLabel}</span>
        </div>
        <div className="p-6">
          {chartData.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-muted-foreground text-sm">
              No orders yet.
            </div>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar
                    dataKey="orders"
                    fill="oklch(0.62 0.22 320)"
                    radius={[8, 8, 0, 0]}
                    name="Orders"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Period Card (Today / Month / Year) ──
function PeriodCard({
  icon,
  title,
  data,
  revenueLabel = "Sales Revenue",
}: {
  icon: React.ReactNode;
  title: string;
  data: { revenue: number; orders: number; dispatchCost: number };
  revenueLabel?: string;
}) {
  const net = data.revenue - data.dispatchCost;
  return (
    <div className="rounded-2xl bg-card shadow-card overflow-hidden">
      <div className="px-5 pt-4 pb-2 flex items-center gap-2 border-b border-border">
        {icon}
        <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          {title}
        </span>
      </div>
      <div className="p-5 space-y-4">
        <StatRow
          Icon={IndianRupee}
          label={revenueLabel}
          value={fmt(data.revenue)}
          tone="pink"
          sub={`${data.orders} order${data.orders !== 1 ? "s" : ""}`}
        />
        <StatRow
          Icon={Truck}
          label="Dispatch Cost"
          value={fmt(data.dispatchCost)}
          tone="purple"
          sub="cost of medicines dispatched"
        />
        <div
          className={`rounded-xl p-3 flex items-center justify-between ${net >= 0 ? "bg-green-50" : "bg-red-50"}`}
        >
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Net Profit
            </div>
            <div
              className={`text-xl font-extrabold mt-0.5 ${net >= 0 ? "text-green-600" : "text-destructive"}`}
            >
              {fmt(net)}
            </div>
          </div>
          {net >= 0 ? (
            <TrendingUp className="h-5 w-5 text-green-500" />
          ) : (
            <TrendingDown className="h-5 w-5 text-destructive" />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Stat Row ──
function StatRow({
  Icon,
  label,
  value,
  tone,
  sub,
}: {
  Icon: any;
  label: string;
  value: string;
  tone: "pink" | "purple" | "blue" | "green";
  sub?: string;
}) {
  const cls =
    tone === "pink"
      ? "bg-primary/10 text-primary"
      : tone === "purple"
        ? "bg-tertiary/10 text-tertiary"
        : tone === "green"
          ? "bg-green-500/10 text-green-600"
          : "bg-accent/10 text-accent";
  return (
    <div className="flex items-center gap-3">
      <div className={`h-10 w-10 rounded-xl grid place-items-center shrink-0 ${cls}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          {label}
        </div>
        <div className="text-2xl font-extrabold leading-tight">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}
