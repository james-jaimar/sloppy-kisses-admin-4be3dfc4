import { createContext, useContext, useMemo, type ReactNode } from "react";

export type UserRole =
  | "platform_owner"
  | "tenant_owner"
  | "tenant_admin"
  | "staff_frontdesk"
  | "staff_grooming"
  | "staff_daycare"
  | "staff_hotel"
  | "staff_driver"
  | "staff_accounts"
  | "staff_read_only"
  | "customer";

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  roles: UserRole[];
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const mockUser: AuthUser = {
  id: "mock-user-charlotte",
  email: "charlotte@sloppykisses.co.za",
  displayName: "Charlotte",
  roles: ["tenant_owner"],
};

const AuthContext = createContext<AuthContextValue>({
  user: mockUser,
  loading: false,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const value = useMemo<AuthContextValue>(
    () => ({ user: mockUser, loading: false, signOut: async () => {} }),
    [],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);