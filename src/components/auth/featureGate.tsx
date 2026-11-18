"use client"

import { useEffect } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useAuth } from "@/context/auth"
import { FeatureId, getFeature } from "@/lib/features"
import styles from "./featureGate.module.scss"

/** Wraps a feature's pages (from its route's layout.tsx): signed-out
 * visitors are sent to log in and brought back afterwards; signed-in
 * members without the feature get a short "no access" note instead of the
 * page. Public features pass straight through. */
export default function FeatureGate({ feature, children }: { feature: FeatureId; children: React.ReactNode }) {
  const auth = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const info = getFeature(feature)
  const isPublic = info.access === "public"
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
        <h2>No access to {info.label}</h2>
        <p>Your account hasn&apos;t been given access to this yet. Ask Ludo if you think it should have.</p>
        <Link href="/">Back to home</Link>
      </div>
    )
  }
  return <>{children}</>
}
