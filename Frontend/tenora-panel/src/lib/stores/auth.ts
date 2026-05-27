import { create } from "zustand";
import { persist } from "zustand/middleware";
import api, { setPanelSessionToken } from "@/lib/api/client";

interface User {
  id: number;
  email: string;
  is_admin: boolean;
  access_token?: string;
}

interface AuthState {
  sessionActive: boolean;
  user: User | null;
  isLoggedIn: boolean;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  fetchMe: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      sessionActive: false,
      user: null,
      isLoggedIn: false,
      ready: false,

      login: async (email, password) => {
        // Le backend renvoie directement le user dans la reponse de /auth/login
        // et pose le cookie session_id (httpOnly). On evite un second appel
        // /auth/me qui peut echouer en race condition (cookie pas encore propage).
        const { data: me } = await api.post("/auth/login", { email, password });
        if (!me?.is_admin) {
          await api.post("/auth/logout").catch(() => {});
          setPanelSessionToken(null);
          throw new Error("Acces reserve aux administrateurs.");
        }
        setPanelSessionToken(me.access_token);
        set({ user: me, sessionActive: true, isLoggedIn: true, ready: true });
      },

      fetchMe: async () => {
        try {
          const { data } = await api.get("/auth/me");
          if (!data.is_admin) {
            await get().logout();
            set({ ready: true });
            return;
          }
          setPanelSessionToken(data.access_token);
          set({ user: data, sessionActive: true, isLoggedIn: true, ready: true });
        } catch {
          setPanelSessionToken(null);
          set({ sessionActive: false, isLoggedIn: false, user: null, ready: true });
        }
      },

      logout: async () => {
        try {
          await api.post("/auth/logout");
        } catch {
          // ignore
        }
        setPanelSessionToken(null);
        set({ user: null, sessionActive: false, isLoggedIn: false });
      },
    }),
    {
      name: "panel_session",
      partialize: (state) => ({ sessionActive: state.sessionActive }),
    }
  )
);
