import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError, AuthError, resetCsrf, setAuthExpiredHandler } from "../lib/api";
import { clearPrivate, loadMe, saveMe } from "../offline/cache";

const LOGGED_OUT = "ma-cerro-sesion";
const flag = (on?: boolean) => {
  try {
    if (on === undefined) return localStorage.getItem(LOGGED_OUT) === "1";
    if (on) localStorage.setItem(LOGGED_OUT, "1");
    else localStorage.removeItem(LOGGED_OUT);
  } catch {
    /* sin almacenamiento */
  }
  return false;
};

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
      .then(async (d) => {
        if (flag()) {
          // se salió sin señal: al volver la conexión se cierra también la sesión del servidor
          await api("/api/auth/logout", { method: "POST" }).catch(() => {});
          flag(false);
          resetCsrf();
          return setUser(null);
        }
        setUser(d.user);
        saveMe(d.user);
      })
      // sin señal: se usa el último usuario guardado en el dispositivo para no sacarlo de la app
      .catch(async (e) => setUser(e instanceof ApiError && e.status === 0 && !flag() ? await loadMe() : null))
      .finally(() => setReady(true));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    resetCsrf();
    const d = await api<{ user: User }>("/api/auth/login", { method: "POST", json: { username, password, remember: true } });
    resetCsrf(); // el token cambia con la sesión nueva
    flag(false);
    setUser(d.user);
    saveMe(d.user);
    return d.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch (e) {
      if (e instanceof ApiError && e.status === 0) flag(true); // sin señal: se sale en el dispositivo
      else if (!(e instanceof AuthError)) throw e;
    }
    resetCsrf();
    await clearPrivate(); // datos de clientes y catálogo no se quedan en un dispositivo compartido
    setUser(null);
  }, []);

  const expire = useCallback(() => {
    resetCsrf();
    saveMe(null);
    setUser(null);
  }, []);

  useEffect(() => {
    setAuthExpiredHandler(expire);
    return () => setAuthExpiredHandler(null);
  }, [expire]);

  return (
    <AuthCtx.Provider value={{ user, ready, isAdmin: user?.role === "admin", login, logout, expire }}>{children}</AuthCtx.Provider>
  );
}
