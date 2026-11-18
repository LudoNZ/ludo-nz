"use client"

import { createContext, useContext } from "react"
import { DEFAULT_SITE_ACCESS, SiteAccess } from "@/lib/features"

const SiteAccessContext = createContext<SiteAccess>(DEFAULT_SITE_ACCESS)

/** Hands the site's access settings (read and cached on the server by the
 * root layout) to client components: the header, page gates and auth. */
export function SiteAccessProvider({ value, children }: { value: SiteAccess; children: React.ReactNode }) {
  return <SiteAccessContext.Provider value={value}>{children}</SiteAccessContext.Provider>
}

export const useSiteAccess = () => useContext(SiteAccessContext)
