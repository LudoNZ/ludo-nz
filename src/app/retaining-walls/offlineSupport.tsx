"use client"

import { useEffect } from "react"

/** Registers the retaining wall calculator's service worker (see
 * public/retaining-walls-sw.js) and asks it to save everything the
 * calculator needs, so the pages still open with no signal. Production
 * only: in development the bundles aren't content-hashed, and a worker
 * serving cached ones silently hides code changes. Renders nothing. */
const OfflineSupport = () => {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return
    let cancelled = false
    ;(async () => {
      try {
        await navigator.serviceWorker.register("/retaining-walls-sw.js", { scope: "/retaining-walls" })
        // ready resolves for the registration that controls *this* page
        const registration = await navigator.serviceWorker.ready
        if (!cancelled && navigator.onLine) registration.active?.postMessage("warm")
      } catch (err) {
        console.warn("Retaining walls offline support unavailable", err)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])
  return null
}

export default OfflineSupport
