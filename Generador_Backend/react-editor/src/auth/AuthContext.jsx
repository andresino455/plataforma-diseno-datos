import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { apiFetch, getToken, setToken, setUnauthorizedHandler } from "../api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // Si hay un token guardado, primero hay que confirmar con el servidor que sigue siendo válido.
  const [loading, setLoading] = useState(() => Boolean(getToken()));
  const [bootError, setBootError] = useState(null);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
  }, [logout]);

  useEffect(() => {
    if (!getToken()) return undefined;

    let cancelled = false;
    apiFetch("/api/auth/me")
      .then((data) => {
        if (!cancelled) setUser(data.user);
      })
      .catch((err) => {
        // 401 ya cerró la sesión (setUnauthorizedHandler); otro error = servidor caído.
        if (!cancelled && err.status !== 401) setBootError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await apiFetch("/api/auth/login", { method: "POST", body: { email, password } });
    setToken(data.token);
    setBootError(null);
    setUser(data.user);
  }, []);

  const register = useCallback(async (name, email, password) => {
    const data = await apiFetch("/api/auth/register", { method: "POST", body: { name, email, password } });
    setToken(data.token);
    setBootError(null);
    setUser(data.user);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, bootError, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}
