import { createContext, useContext, useMemo, type ReactNode } from "react";

export interface Tenant {
  id: string;
  slug: string;
  name: string;
}

const defaultTenant: Tenant = {
  id: "tenant-sloppy-kisses",
  slug: "sloppy-kisses",
  name: "Sloppy Kisses",
};

const TenantContext = createContext<{ tenant: Tenant }>({ tenant: defaultTenant });

export function TenantProvider({ children }: { children: ReactNode }) {
  const value = useMemo(() => ({ tenant: defaultTenant }), []);
  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export const useTenant = () => useContext(TenantContext);