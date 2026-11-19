"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useAuth } from "@/context/auth"
import { loadCompany, loadPrices, saveCompany, savePrices } from "@/app/retaining-walls/priceLibraryActions"
import { BLANK_COMPANY, CompanyDetails, libraryFromData, PriceItem, PriceLibrary } from "./pricing"

// a read-only copy of the shared prices, so an estimate still prices up on
// site with no signal; never edited here, and replaced on every load
const OFFLINE_COPY_KEY = "retainingWalls.sharedPrices.v3"

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

/** The shared prices (one list for everyone, in the database; anyone
 * signed in can change them) and the signed-in person's own company
 * details and logo for their proposals. */
export function usePriceLibrary() {
  const auth = useAuth()
  const user = auth?.currentUser ?? null
  const uid = user?.uid ?? null
  const canEdit = !!user
  const [items, setItems] = useState<PriceItem[]>(() => libraryFromData(undefined).items)
  const [company, setCompany] = useState<CompanyDetails>(BLANK_COMPANY)
  const [status, setStatus] = useState<LibraryStatus>("loading")
  const [error, setError] = useState<string | null>(null)
  const latest = useRef({ items, company })
  latest.current = { items, company }

  useEffect(() => {
    let cancelled = false
    // older versions kept copies in the browser; clear them out
    try {
      for (const k of Object.keys(localStorage))
        if (k.startsWith("retainingWalls.priceLibrary.v1") || /^retainingWalls\.sharedPrices\.v[12]$/.test(k)) localStorage.removeItem(k)
    } catch {
      // storage blocked: nothing to clear
    }
    const copy = readOfflineCopy()
    if (copy) setItems(copy)
    loadPrices()
      .then((r) => {
        if (cancelled) return
        if (!r.ok) throw new Error(r.error)
        setItems(r.value)
        writeOfflineCopy(r.value)
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

  useEffect(() => {
    if (auth?.authLoading) return
    if (!user) {
      setCompany(BLANK_COMPANY)
      return
    }
    let cancelled = false
    user
      .getIdToken()
      .then(loadCompany)
      .then((r) => {
        if (cancelled) return
        if (r.ok) setCompany(r.value)
        else console.error("Loading company details failed:", r.error)
      })
      .catch((err) => console.error("Loading company details failed:", err))
    return () => {
      cancelled = true
    }
  }, [auth?.authLoading, uid, user])

  const save = useCallback(
    async (next: PriceLibrary) => {
      if (!user) return
      const pricesChanged = next.items !== latest.current.items
      const companyChanged = next.company !== latest.current.company
      if (pricesChanged) setItems(next.items)
      if (companyChanged) setCompany(next.company)
      setError(null)
      try {
        const token = await user.getIdToken()
        if (pricesChanged) {
          const r = await savePrices(token, next.items)
          if (!r.ok) throw new Error(r.error)
          if (latest.current.items === next.items) {
            setItems(r.value)
            writeOfflineCopy(r.value)
          }
        }
        if (companyChanged) {
          const r = await saveCompany(token, next.company)
          if (!r.ok) throw new Error(r.error)
        }
      } catch (err) {
        console.error("Saving failed:", err)
        setError(
          navigator.onLine
            ? `Couldn't save: ${err instanceof Error ? err.message : "try again"}`
            : "You're offline: changes can't be saved until you're back online.",
        )
      }
    },
    [user],
  )

  return { library: { items, company } as PriceLibrary, status, error, save, signedIn: !!user, canEdit }
}
