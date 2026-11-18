// Server-only: imports the Admin SDK. Never import this from a client component.
import { unstable_cache } from "next/cache"
import { getFirestoreAdmin } from "../../firebase/server"
import { DEFAULT_SITE_ACCESS, normaliseSiteAccess, SiteAccess } from "./features"

/** `settings/siteAccess`: `{ features: { [featureId]: "public" | "granted" |
 * "hidden" }, updatedAt }`. Only the Admin SDK touches it; Firestore rules
 * deny clients (the catch-all deny at the bottom of firestore.rules). */
export const SITE_ACCESS_TAG = "site-access"

export function siteAccessRef() {
  return getFirestoreAdmin().collection("settings").doc("siteAccess")
}

/** Cached across requests and server instances' renders: one Firestore
 * read, then served from Next's data cache until the admin saves a change
 * (which revalidates the tag) or an hour passes (a safety net). Pages that
 * use it stay statically cached, so visitors don't pay for a lookup. */
const readSiteAccess = unstable_cache(
  async (): Promise<SiteAccess> => {
    const snap = await siteAccessRef().get()
    return normaliseSiteAccess(snap.data()?.features)
  },
  ["site-access"],
  { tags: [SITE_ACCESS_TAG], revalidate: 3600 },
)

/** The site's current access settings. Falls back to each feature's
 * default if Firestore can't be read (the failure isn't cached, so the
 * next render tries again). */
export async function getSiteAccess(): Promise<SiteAccess> {
  try {
    return await readSiteAccess()
  } catch (err) {
    console.error("Reading site access settings failed; using defaults:", err)
    return { ...DEFAULT_SITE_ACCESS }
  }
}
