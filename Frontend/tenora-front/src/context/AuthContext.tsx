import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { authApi, setApiErrorHandler, setSessionToken, type User } from "@/lib/api";

export const AUTH_QUERY_KEY = ["auth", "me"] as const;

interface AuthCtx {
  user: User | null;
  checked: boolean;
  loading: boolean;
  isLoggedIn: boolean;
  isVerified: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    phone?: string,
    username?: string,
  ) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setUser: (u: User) => void;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);

  const { data, isFetched, refetch } = useQuery<User | null>({
    queryKey: AUTH_QUERY_KEY,
    queryFn: async () => {
      try {
        const res = await authApi.me();
        setSessionToken(res.data?.access_token);
        return res.data;
      } catch {
        return null;
      }
    },
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });

  const user = data ?? null;

  useEffect(() => {
    setApiErrorHandler(() => {
      setSessionToken(null);
      qc.setQueryData(AUTH_QUERY_KEY, null);
    });
  }, [qc]);

  const setUser = useCallback(
    (u: User | null) => qc.setQueryData(AUTH_QUERY_KEY, u),
    [qc]
  );

  const value = useMemo<AuthCtx>(
    () => ({
      user,
      checked: isFetched,
      loading,
      isLoggedIn: !!user,
      isVerified: user?.is_verified ?? false,
      isAdmin: user?.is_admin ?? false,

      async login(email, password) {
        setLoading(true);
        try {
          const res = await authApi.login({ email, password });
          if (res.data) {
            setSessionToken(res.data.access_token);
            setUser(res.data);
          } else {
            await refetch();
          }
        } finally {
          setLoading(false);
        }
      },

      async register(email, password, phone, username) {
        setLoading(true);
        try {
          const res = await authApi.register({ email, password, phone, username });
          setSessionToken(res.data?.access_token);
          setUser(res.data);
        } finally {
          setLoading(false);
        }
      },

      async logout() {
        await authApi.logout();
        setSessionToken(null);
        setUser(null);
        qc.removeQueries({ queryKey: ["orders"] });
        qc.removeQueries({ queryKey: ["imports"] });
      },

      refresh: async () => {
        await refetch();
      },

      setUser: (u: User) => setUser(u),
    }),
    [user, isFetched, loading, refetch, setUser, qc]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside AuthProvider");
  return v;
}
