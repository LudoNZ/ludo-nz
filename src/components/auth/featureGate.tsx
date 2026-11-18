"use client"

import { useEffect } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useAuth } from "@/context/auth"
import { FeatureId, getFeature } from "@/lib/features"
import { useSiteAccess } from "@/context/siteAccess"
import styles from "./featureGate.module.scss"

/** Wraps a feature's pages (from its route's layout.tsx): signed-out
 * visitors are sent to log in and brought back afterwards; signed-in
 * members without the feature get a short "no access" note instead of the
 * page. Public features pass straight through. Access levels come from the
 * admin dashboard (Site access). */
export default function FeatureGate({ feature, children }: { feature: FeatureId; children: React.ReactNode }) {
  const auth = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const info = getFeature(feature)
  const access = useSiteAccess()[feature]
  const isPublic = access === "public"
  const signedOut = !!auth && !auth.authLoading && !auth.currentUser

  useEffect(() => {
    if (!isPublic && signedOut) router.replace(`/login?next=${encodeURIComponent(pathname)}`)
  }, [isPublic, signedOut, router, pathname])

  if (isPublic) return <>{children}</>
  if (!auth || auth.authLoading || !auth.currentUser) {
    return <p className={styles.note}>Checking access...</p>
  }
  if (!auth.hasFeature(feature)) {
    return (
      <div className={styles.noAccess}>
        <h2>{access === "hidden" ? `${info.label} isn't available` : `No access to ${info.label}`}</h2>
        <p>
          {access === "hidden"
            ? "This isn't open at the moment. Check back later."
            : "Your account hasn't been given access to this yet. Ask Ludo if you think it should have."}
        </p>
        <Link href="/">Back to home</Link>
      </div>
    )
  }
  return <>{children}</>
}
