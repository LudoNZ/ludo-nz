"use server"

import { FieldValue } from "firebase-admin/firestore"
import { revalidateTag } from "next/cache"
import { normaliseSiteAccess, SiteAccess } from "@/lib/features"
import { requireAdmin } from "@/lib/members.server"
import { SITE_ACCESS_TAG, siteAccessRef } from "@/lib/siteAccess.server"

/** Save which features are public / members only / hidden. Clears the
 * cached settings so every page picks the change up on its next load
 * (including the admin's own, which Next refreshes after this action). */
export async function saveSiteAccess(idToken: string, access: Partial<Record<string, string>>): Promise<SiteAccess> {
  await requireAdmin(idToken)
  const normalised = normaliseSiteAccess(access)
  await siteAccessRef().set({ features: normalised, updatedAt: FieldValue.serverTimestamp() })
  revalidateTag(SITE_ACCESS_TAG)
  return normalised
}
