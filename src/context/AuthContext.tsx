import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { AuthService, Credentials } from "@/lib/auth";
import { ApiError, setToken, setTenantId, getToken, setUnauthorizedHandler } from "@/lib/api";
import { clearAppTimeZone } from "@/lib/format";
import {
  hasAllowedRole,
  resolveWorkerRole,
  resolveTenantId,
  WorkerRole,
} from "@/lib/roles";

interface AuthResult {
  success: boolean;
  error?: string;
}

interface AuthContextType {
  user: any | null;
  role: WorkerRole | null;
  loading: boolean;
  isAuthenticated: boolean;
  signIn: (c: Credentials) => Promise<AuthResult>;
  signOut: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
};

function persistSession(user: any) {
  const tenantId = resolveTenantId(user);
  if (tenantId) setTenantId(tenantId);
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const { t } = useTranslation();
  const [user, setUser] = useState<any | null>(null);
  const [role, setRole] = useState<WorkerRole | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore session on launch.
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    AuthService.getProfile()
      .then((profile) => {
        if (!hasAllowedRole(profile)) {
          // Token belongs to a non-guard/supervisor account — drop it.
          setToken(null);
          setTenantId(null);
          return;
        }
        persistSession(profile);
        setUser(profile);
        setRole(resolveWorkerRole(profile));
      })
      .catch((e: any) => {
        if (e instanceof ApiError && e.status === 401) {
          setToken(null);
          setTenantId(null);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const signIn = useCallback(async (credentials: Credentials): Promise<AuthResult> => {
    try {
      const resp = await AuthService.signIn(credentials);
      if (!resp?.token) return { success: false, error: t("auth.errorGeneric") };

      setToken(resp.token);

      // Hydrate the full profile so we have tenants + roles to gate on.
      let u = resp.user;
      const incomplete =
        !u || (!Array.isArray(u.tenants) && !u.roles && !u.role);
      if (incomplete) {
        try {
          u = await AuthService.getProfile();
        } catch {
          /* fall back to whatever sign-in returned */
        }
      }

      // Role gate: only security guards and supervisors may use this app.
      if (!hasAllowedRole(u)) {
        setToken(null);
        setTenantId(null);
        return { success: false, error: t("auth.errorNotAllowed") };
      }

      persistSession(u);
      setUser(u);
      setRole(resolveWorkerRole(u));
      return { success: true };
    } catch (err: any) {
      if (err instanceof ApiError) {
        if (err.status === 429) return { success: false, error: t("auth.rateLimited") };
        if (err.status === 401 || err.status === 403)
          return { success: false, error: t("auth.errorGeneric") };
      }
      return { success: false, error: t("auth.errorGeneric") };
    }
  }, [t]);

  const signOut = useCallback(() => {
    setToken(null);
    setTenantId(null);
    setUser(null);
    setRole(null);
    // Drop the tenant display timezone so the next session starts clean.
    clearAppTimeZone();
  }, []);

  // Keep the latest signOut reachable from the (empty-dep) unauthorized handler
  // effect without re-registering it on every identity change.
  const signOutRef = useRef(signOut);
  signOutRef.current = signOut;

  // Sign out automatically when any authenticated request gets a 401 — e.g. this
  // device's session was ended by a login elsewhere (single active session).
  useEffect(() => {
    setUnauthorizedHandler(() => signOutRef.current());
    return () => setUnauthorizedHandler(null);
  }, []);

  // Re-fetch the signed-in profile (used by pull-to-refresh on the Profile tab).
  const refreshUser = useCallback(async () => {
    if (!getToken()) return;
    try {
      const profile = await AuthService.getProfile();
      if (!hasAllowedRole(profile)) return;
      persistSession(profile);
      setUser(profile);
      setRole(resolveWorkerRole(profile));
    } catch {
      /* keep the current session on a transient failure */
    }
  }, []);

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      role,
      loading,
      isAuthenticated: !!user,
      signIn,
      signOut,
      refreshUser,
    }),
    [user, role, loading, signIn, signOut, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
