"use client"

import { useCallback, useEffect, useState } from "react"

/** useState mirrored into localStorage under `key`. Starts at `initial` on
 * both server and first client render (so hydration matches) and loads the
 * stored value in an effect. Storage failures — private windows, blocked
 * site data — are swallowed: the page still works, it just won't remember. */
export function useStoredState<T>(key: string, initial: T): [T, (update: (prev: T) => T) => void, boolean] {
  const [value, setValue] = useState<T>(initial)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key)
      if (raw !== null) setValue(JSON.parse(raw) as T)
    } catch {
      // unreadable or corrupt — keep the initial value
    }
    setLoaded(true)
  }, [key])

  const update = useCallback(
    (fn: (prev: T) => T) => {
      setValue((prev) => {
        const next = fn(prev)
        try {
          window.localStorage.setItem(key, JSON.stringify(next))
        } catch {
          // storage unavailable — state still updates for this visit
        }
        return next
      })
    },
    [key],
  )

  return [value, update, loaded]
}
