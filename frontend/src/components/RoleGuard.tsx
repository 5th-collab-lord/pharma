import { useEffect, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth, type AppRole } from "@/lib/auth";
import { Loader2 } from "lucide-react";

export function RoleGuard({ require, children }: { require: AppRole; children: ReactNode }) {
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/auth", replace: true });
      return;
    }
    if (role && role !== require) {
      navigate({ to: role === "admin" ? "/admin" : "/shop", replace: true });
    }
  }, [user, role, loading, require, navigate]);

  if (loading || !user || role !== require) {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  return <>{children}</>;
}
