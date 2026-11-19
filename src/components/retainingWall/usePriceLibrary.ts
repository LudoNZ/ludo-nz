"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useAuth } from "@/context/auth"
import { loadCompanyDetails, loadSharedPrices, saveCompanyDetails, saveSharedPrices } from "@/app/retaining-walls/priceLibraryActions"
import { BLANK_COMPANY, CompanyDetails, libraryFromData, PriceItem, PriceLibrary } from "./pricing"

// a read-only copy of the shared prices, so an estimate still prices up on
// site with no signal; never edited here, and replaced on every load
const OFFLINE_COPY_KEY = "retainingWalls.sharedPrices.v1"

const readOfflineCopy = (): PriceItem[] | null => {
  try {
    const raw = localStorage.getItem(OFFLINE_COPY_KEY)
    return raw ? libraryFromData({ items: JSON.parse(raw) }).items : null
  } catch {
    return null
  }
}
const writeOfflineCopy = (items: PriceItem[]) => {
  try {
    localStorage.setItem(OFFLINE_COPY_KEY, JSON.stringify(items))
  } catch {
    // storage full or blocked: prices still work while online
  }
}

export type LibraryStatus = "loading" | "ready" | "offline" | "error"

/** The shared price library (one set of prices for everyone, kept in the
 * database; only admins can change it) plus the signed-in person's own
 * company details for their proposals. Signed out, company details
 * aren't saved. */
export function usePriceLibrary() {
  const auth = useAuth()
  const user = auth?.currentUser ?? null
  const uid = user?.uid ?? null
  const canEdit = !!auth?.isAdmin
  const [items, setItems] = useState<PriceItem[]>(() => libraryFromData(undefined).items)
  const [company, setCompany] = useState<CompanyDetails>(BLANK_COMPANY)
  const [status, setStatus] = useState<LibraryStatus>("loading")
  const [error, setError] = useState<string | null>(null)
  const latestItems = useRef(items)
  latestItems.current = items

  // shared prices: for everyone, signed in or not
  useEffect(() => {
    let cancelled = false
    // personal libraries used to be kept in the browser; clear them out
    try {
      for (const k of Object.keys(localStorage)) if (k.startsWith("retainingWalls.priceLibrary.v1")) localStorage.removeItem(k)
    } catch {
      // storage blocked: nothing to clear
    }
    const copy = readOfflineCopy()
    if (copy) setItems(copy)
    loadSharedPrices()
      .then(({ items: fromServer }) => {
        if (cancelled) return
        setItems(fromServer)
        writeOfflineCopy(fromServer)
        setStatus("ready")
      })
      .catch((err) => {
        if (cancelled) return
        console.error("Loading the shared prices failed:", err)
        setStatus(navigator.onLine ? "error" : "offline")
      })
    return () => {
      cancelled = true
    }
  }, [])

  // company details: the signed-in person's own
  useEffect(() => {
    if (auth?.authLoading) return
    if (!user) {
      setCompany(BLANK_COMPANY)
      return
    }
    let cancelled = false
    user
      .getIdToken()
      .then(loadCompanyDetails)
      .then((c) => !cancelled && setCompany(c))
      .catch((err) => console.error("Loading company details failed:", err))
    return () => {
      cancelled = true
    }
  }, [auth?.authLoading, uid, user])

  const save = useCallback(
    async (next: PriceLibrary) => {
      setError(null)
      const pricesChanged = canEdit && next.items !== latestItems.current
      if (pricesChanged) setItems(next.items)
      setCompany(next.company)
      if (!user) return
      try {
        const token = await user.getIdToken()
        if (pricesChanged) {
          const saved = await saveSharedPrices(token, next.items)
          if (latestItems.current === next.items) {
            setItems(saved)
            writeOfflineCopy(saved)
          }
        }
        await saveCompanyDetails(token, next.company)
      } catch (err) {
        console.error("Saving the price library failed:", err)
        setError(navigator.onLine ? "Couldn't save. Try again." : "You're offline: changes can't be saved until you're back online.")
      }
    },
    [user, canEdit],
  )

  return { library: { items, company } as PriceLibrary, status, error, save, signedIn: !!user, canEdit }
}
