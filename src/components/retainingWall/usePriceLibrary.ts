"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useAuth } from "@/context/auth"
import { loadPriceLibrary, savePriceLibrary } from "@/app/retaining-walls/priceLibraryActions"
import { libraryFromData, PriceLibrary } from "./pricing"

// a read-only copy of the library, so an estimate still prices up on site
// with no signal; never edited here, and replaced on every load
const OFFLINE_COPY_KEY = "retainingWalls.sharedPrices.v2"

const readOfflineCopy = (): PriceLibrary | null => {
  try {
    const raw = localStorage.getItem(OFFLINE_COPY_KEY)
    return raw ? libraryFromData(JSON.parse(raw)) : null
  } catch {
    return null
  }
}
const writeOfflineCopy = (library: PriceLibrary) => {
  try {
    localStorage.setItem(OFFLINE_COPY_KEY, JSON.stringify(library))
  } catch {
    // storage full or blocked: prices still work while online
  }
}

export type LibraryStatus = "loading" | "ready" | "offline" | "error"

/** The one price library (prices and company details), kept in the
 * database. Everyone uses it; anyone signed in can change it. */
export function usePriceLibrary() {
  const auth = useAuth()
  const user = auth?.currentUser ?? null
  const canEdit = !!user
  const [library, setLibrary] = useState<PriceLibrary>(() => libraryFromData(undefined))
  const [status, setStatus] = useState<LibraryStatus>("loading")
  const [error, setError] = useState<string | null>(null)
  const latest = useRef(library)
  latest.current = library

  useEffect(() => {
    let cancelled = false
    // older versions kept copies in the browser; clear them out
    try {
      for (const k of Object.keys(localStorage))
        if (k.startsWith("retainingWalls.priceLibrary.v1") || k === "retainingWalls.sharedPrices.v1") localStorage.removeItem(k)
    } catch {
      // storage blocked: nothing to clear
    }
    const copy = readOfflineCopy()
    if (copy) setLibrary(copy)
    loadPriceLibrary()
      .then((fromServer) => {
        if (cancelled) return
        setLibrary(fromServer)
        writeOfflineCopy(fromServer)
        setStatus("ready")
      })
      .catch((err) => {
        if (cancelled) return
        console.error("Loading the price library failed:", err)
        setStatus(navigator.onLine ? "error" : "offline")
      })
    return () => {
      cancelled = true
    }
  }, [])

  const save = useCallback(
    async (next: PriceLibrary) => {
      if (!user || !canEdit) return
      setLibrary(next)
      setError(null)
      try {
        const saved = await savePriceLibrary(await user.getIdToken(), next)
        // a newer edit may have landed while this one was saving
        if (latest.current === next) {
          setLibrary(saved)
          writeOfflineCopy(saved)
        }
      } catch (err) {
        console.error("Saving the price library failed:", err)
        setError(navigator.onLine ? "Couldn't save. Try again." : "You're offline: changes can't be saved until you're back online.")
      }
    },
    [user, canEdit],
  )

  return { library, status, error, save, signedIn: !!user, canEdit }
}
