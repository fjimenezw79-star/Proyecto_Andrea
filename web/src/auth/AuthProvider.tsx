import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, AuthError, resetCsrf } from "../lib/api";

export type User = { id: number; username: string; full_name: string; role: "admin" | "seller" };
type Ctx = {
  user: User | null;
  ready: boolean;
  isAdmin: boolean;
  login: (username: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  expire: () => void;
};

const AuthCtx = createContext<Ctx | null>(null);

export function useAuth(): Ctx {
  const c = useContext(AuthCtx);
  if (!c) throw new Error("useAuth fuera de AuthProvider");
  return c;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api<{ user: User }>("/api/auth/me")
      .then((d) => setUser(d.user))
      .catch(() => setUser(null))
      .finally(() => setReady(true));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    resetCsrf();
    const d = await api<{ user: User }>("/api/auth/login", { method: "POST", json: { username, password, remember: true } });
    resetCsrf(); // el token cambia con la sesión nueva
    setUser(d.user);
    return d.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch (e) {
      if (!(e instanceof AuthError)) throw e;
    }
    resetCsrf();
    setUser(null);
  }, []);

  const expire = useCallback(() => {
    resetCsrf();
    setUser(null);
  }, []);

  return (
    <AuthCtx.Provider value={{ user, ready, isAdmin: user?.role === "admin", login, logout, expire }}>{children}</AuthCtx.Provider>
  );
}
