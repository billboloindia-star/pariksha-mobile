import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import * as api from "../../shared/api";

interface SessionContextValue {
  session: api.Session | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/** Mirrors the web app's Login.tsx flow (api.login/signup → api.setSession →
 * local state), just lifted into a context so every screen (and the tab
 * navigator's own auth gate) can read the current session. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<api.Session | null>(() => api.getSession());

  // Refresh `plan` from the backend once at startup when a cached session
  // exists — the JWT itself doesn't carry plan, so a stale cached session
  // could still show "free" right after an admin flips someone to premium.
  useEffect(() => {
    if (!api.backendEnabled() || !session) return;
    api.me().then((m) => {
      const updated = { ...session, plan: m.plan };
      api.setSession(updated);
      setSessionState(updated);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<SessionContextValue>(() => ({
    session,
    async login(email, password) {
      const s = await api.login(email, password);
      api.setSession(s);
      setSessionState(s);
    },
    async signup(email, password) {
      const s = await api.signup(email, password);
      api.setSession(s);
      setSessionState(s);
    },
    logout() {
      api.setSession(null);
      setSessionState(null);
    },
  }), [session]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession() must be used inside <SessionProvider>.");
  return ctx;
}
