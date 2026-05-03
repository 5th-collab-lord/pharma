import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Pill, Loader2 } from "lucide-react";
import { toast } from "sonner";

type AuthSearch = {
  mode?: "signin" | "signup";
};

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): AuthSearch => {
    return {
      mode: search.mode as "signin" | "signup" | undefined,
    };
  },
  component: AuthPage,
});

const emailSchema = z.string().trim().email("Enter a valid email").max(255);
const passwordSchema = z.string().min(6, "At least 6 characters").max(72);
const nameSchema = z.string().trim().min(1, "Name required").max(80);

const API_URL = "http://localhost:5000/api";

function AuthPage() {
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();
  const search = Route.useSearch();
  
  const [tab, setTab] = useState<"user" | "admin">("user");
  const [isSignUp, setIsSignUp] = useState(search.mode === "signup");

  useEffect(() => {
    if (!loading && user && role) {
      navigate({ to: role === "admin" ? "/admin" : "/shop", replace: true });
    }
  }, [user, role, loading, navigate]);

  useEffect(() => {
    if (search.mode === "signup") {
      setTab("user");
      setIsSignUp(true);
    }
  }, [search.mode]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md p-6 md:p-12">
        <Link to="/" className="flex flex-col items-center justify-center gap-3 mb-8">
          <div className="h-14 w-14 rounded-2xl bg-gradient-primary grid place-items-center shadow-pink">
            <Pill className="h-8 w-8 text-white" />
          </div>
          <div className="text-center">
            <span className="font-extrabold text-2xl text-primary tracking-tight">KK PHARMA</span>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">Pharmacy Management</div>
          </div>
        </Link>
        
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList className="grid grid-cols-2 w-full rounded-full p-1 h-auto">
            <TabsTrigger value="user" className="rounded-full">User Portal</TabsTrigger>
            <TabsTrigger value="admin" className="rounded-full">Admin Portal</TabsTrigger>
          </TabsList>
          
          <TabsContent value="user" className="mt-6">
            {isSignUp ? (
              <>
                <SignUpForm onDone={() => setIsSignUp(false)} />
                <div className="mt-4 text-center text-sm text-muted-foreground">
                  Already have an account?{" "}
                  <button type="button" onClick={() => setIsSignUp(false)} className="text-primary font-semibold hover:underline">
                    Sign in
                  </button>
                </div>
              </>
            ) : (
              <>
                <SignInForm loginType="shop" />
                <div className="mt-4 text-center text-sm text-muted-foreground">
                  Don't have an account?{" "}
                  <button type="button" onClick={() => setIsSignUp(true)} className="text-primary font-semibold hover:underline">
                    Create one
                  </button>
                </div>
              </>
            )}
          </TabsContent>
          
          <TabsContent value="admin" className="mt-6">
            <SignInForm loginType="admin" />
          </TabsContent>
        </Tabs>
        
        <p className="text-xs text-muted-foreground mt-8 text-center">
          By continuing you agree to KK Pharma's terms of use.
        </p>
      </div>
    </div>
  );
}

function SignInForm({ loginType }: { loginType: "admin" | "shop" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const { signIn } = useAuth();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ev = emailSchema.safeParse(email);
    const pv = passwordSchema.safeParse(password);
    if (!ev.success) return toast.error(ev.error.issues[0].message);
    if (!pv.success) return toast.error(pv.error.issues[0].message);
    setBusy(true);

    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: ev.data, password: pv.data, loginType })
      });
      const data = await res.json();
      
      if (!res.ok) {
        setBusy(false);
        toast.error(data.message || "Login failed");
        return;
      }

      signIn(data.token, data.user);
      toast.success("Welcome back!");
    } catch (error: any) {
      toast.error(error.message || "Network error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="si-email">Email</Label>
        <Input id="si-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="si-pw">Password</Label>
        <Input id="si-pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </div>
      <Button type="submit" disabled={busy} className="w-full rounded-full shadow-pink h-11">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
      </Button>
    </form>
  );
}

function SignUpForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nv = nameSchema.safeParse(name);
    const ev = emailSchema.safeParse(email);
    const pv = passwordSchema.safeParse(password);
    if (!nv.success) return toast.error(nv.error.issues[0].message);
    if (!ev.success) return toast.error(ev.error.issues[0].message);
    if (!pv.success) return toast.error(pv.error.issues[0].message);

    setBusy(true);
    
    try {
      const res = await fetch(`${API_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nv.data, email: ev.data, password: pv.data })
      });
      const data = await res.json();
      
      if (!res.ok) {
        setBusy(false);
        toast.error(data.message || "Registration failed");
        return;
      }
      
      toast.success(data.message || "Registration successful! Please wait for Admin approval.");
      onDone();
    } catch (error: any) {
      toast.error(error.message || "Network error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="su-name">Full name</Label>
        <Input id="su-name" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="su-email">Email</Label>
        <Input id="su-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="su-pw">Password</Label>
        <Input id="su-pw" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </div>
      <Button type="submit" disabled={busy} className="w-full rounded-full shadow-pink h-11">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create account"}
      </Button>
    </form>
  );
}