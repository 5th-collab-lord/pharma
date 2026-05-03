import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Pill, TrendingUp, Truck, AlertTriangle, ShieldCheck, Receipt } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user && role) {
      navigate({ to: role === "admin" ? "/admin" : "/shop", replace: true });
    }
  }, [loading, user, role, navigate]);

  return (
    <div className="min-h-screen bg-background">
      {/* nav */}
      <header className="px-6 md:px-12 py-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-gradient-primary grid place-items-center shadow-pink">
            <Pill className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="font-extrabold tracking-tight text-lg leading-none text-primary">KK PHARMA</div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Pharmacy Management</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" className="rounded-full"><Link to="/auth">Sign in</Link></Button>
          <Button asChild className="rounded-full shadow-pink"><Link to="/auth" search={{ mode: "signup" } as any}>Get started</Link></Button>
        </div>
      </header>

      {/* hero */}
      <section className="px-6 md:px-12 pt-10 pb-20 max-w-6xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-secondary text-secondary-foreground text-xs font-semibold mb-6">
          <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
          Multi-branch pharmacy, beautifully managed
        </div>
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight leading-[1.05]">
          One warehouse.<br />
          <span className="text-gradient-primary">Every branch in sync.</span>
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
          Track stock and batches across your central warehouse and shops, dispatch with FIFO precision,
          run a delightful point-of-sale, and print pharmacy-grade receipts — all in one place.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Button asChild size="lg" className="rounded-full shadow-pink h-12 px-8 text-base">
            <Link to="/auth" search={{ mode: "signup" } as any}>Start free</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="rounded-full h-12 px-8 text-base">
            <Link to="/auth">Sign in</Link>
          </Button>
        </div>
      </section>

      {/* features */}
      <section className="px-6 md:px-12 pb-24 max-w-6xl mx-auto grid md:grid-cols-3 gap-6">
        {[
          { Icon: TrendingUp, title: "Master inventory", desc: "Track every batch and expiry across the warehouse and all branches.", tone: "pink" },
          { Icon: Truck, title: "Dispatch", desc: "FIFO batch picking, delivery confirmation, full audit trail.", tone: "purple" },
          { Icon: Receipt, title: "Point of sale", desc: "Lightning-fast cart with printable, downloadable receipts.", tone: "blue" },
          { Icon: AlertTriangle, title: "Smart alerts", desc: "Low-stock and expiring-soon medicines surface automatically.", tone: "pink" },
          { Icon: ShieldCheck, title: "Role-based access", desc: "Admin sees everything; each shop sees only its own data.", tone: "purple" },
          { Icon: Pill, title: "Built for pharmacy", desc: "Composition, SKU, batch numbers — the fields you actually need.", tone: "blue" },
        ].map(({ Icon, title, desc, tone }) => (
          <div key={title} className={`rounded-2xl bg-card p-6 shadow-card hover:-translate-y-1 hover:shadow-${tone} transition-all`}>
            <div className={`h-11 w-11 rounded-xl grid place-items-center mb-4 ${
              tone === "pink" ? "bg-primary/10 text-primary" : tone === "purple" ? "bg-tertiary/10 text-tertiary" : "bg-accent/10 text-accent"
            }`}>
              <Icon className="h-5 w-5" />
            </div>
            <h3 className="font-bold text-lg">{title}</h3>
            <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{desc}</p>
          </div>
        ))}
      </section>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} KK Pharma | Krishna Kanhaiya — Joyful Health Solutions
      </footer>
    </div>
  );
}
