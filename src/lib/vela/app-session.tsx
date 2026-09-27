import { createContext, useContext, type ReactNode } from "react";
import type { Profile } from "./types";

type AppSession = {
  userId: string | null;
  profile: Profile | null;
};

const AppSessionContext = createContext<AppSession>({
  userId: null,
  profile: null,
});

export function AppSessionProvider({
  userId,
  profile,
  children,
}: AppSession & { children: ReactNode }) {
  return (
    <AppSessionContext.Provider value={{ userId, profile }}>
      {children}
    </AppSessionContext.Provider>
  );
}

export function useAppSession() {
  return useContext(AppSessionContext);
}
