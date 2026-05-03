import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type AppRole = "admin" | "shop";

export interface AuthProfile {
  id: string;
  full_name: string | null;
  shop_id: string | null;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: AppRole;
  shopId: string | null;
}

interface AuthState {
  user: User | null;
  role: AppRole | null;
  profile: AuthProfile | null;
  loading: boolean;
  signIn: (token: string, user: User) => void;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthCtx = createContext<AuthState | undefined>(undefined);

const API_URL = "http://localhost:5000/api";

// Notify backend that this shop is going offline
async function notifyLogout(user: User | null) {
  if (!user || user.role !== "shop" || !user.shopId) return;
  try {
    await fetch(`${API_URL}/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shopId: user.shopId, role: user.role }),
      keepalive: true, // works even if page is unloading
    });
  } catch {
    // best-effort — ignore errors
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Restore session from localStorage
    const token = localStorage.getItem("token");
    const storedUser = localStorage.getItem("user");

    if (token && storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser) as User;
        setUser(parsedUser);
        setRole(parsedUser.role);
        setProfile({
          id: parsedUser.id,
          full_name: parsedUser.name,
          shop_id: parsedUser.shopId,
        });
      } catch (e) {
        console.error("Failed to parse stored user", e);
        localStorage.removeItem("token");
        localStorage.removeItem("user");
      }
    }
    setLoading(false);
  }, []);

  // Mark shop offline when the tab/browser is closed or refreshed away
  useEffect(() => {
    const handleUnload = () => {
      const storedUser = localStorage.getItem("user");
      if (!storedUser) return;
      try {
        const u = JSON.parse(storedUser) as User;
        notifyLogout(u);
      } catch {
        // ignore
      }
    };

    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, []);

  const signIn = (token: string, newUser: User) => {
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(newUser));
    setUser(newUser);
    setRole(newUser.role);
    setProfile({
      id: newUser.id,
      full_name: newUser.name,
      shop_id: newUser.shopId,
    });
  };

  const signOut = async () => {
    // Notify backend BEFORE clearing state/storage
    const currentUser = user;
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
    setProfile(null);
    setRole(null);
    await notifyLogout(currentUser);
    window.location.href = "/";
  };

  const refresh = async () => {
    // Re-sync online status with backend when tab regains focus
    const token = localStorage.getItem("token");
    const storedUser = localStorage.getItem("user");
    if (!token || !storedUser) return;
    try {
      const u = JSON.parse(storedUser) as User;
      if (u.role === "shop" && u.shopId) {
        // Re-mark as online (handles cases where beforeunload fired on refresh)
        await fetch(`${API_URL}/auth/online`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ shopId: u.shopId }),
        });
      }
    } catch {
      // ignore
    }
  };

  // Re-mark shop as online when tab becomes visible again (after a refresh that fired beforeunload)
  useEffect(() => {
    if (!user || user.role !== "shop") return;

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        const token = localStorage.getItem("token");
        if (token && user.shopId) {
          fetch(`${API_URL}/auth/online`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ shopId: user.shopId }),
          }).catch(() => {});
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [user]);

  return (
    <AuthCtx.Provider value={{ user, profile, role, loading, signIn, signOut, refresh }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
