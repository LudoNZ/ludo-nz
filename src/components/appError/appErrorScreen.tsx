"use client"

import { useEffect, useState } from "react"
import styles from "./appErrorScreen.module.scss"

/** a reload this soon after the last one (on this tab) isn't tried again —
 * it didn't help, so the error's real and shows instead of looping */
const RELOAD_GUARD_MS = 30_000
const RELOAD_KEY = "app-error-reloaded-at"

/** The page a crash shows (app/error.tsx, app/global-error.tsx).
 *
 * The usual crash is a stale page, not a bug: the CDN can hand out a
 * page's HTML from the build before the latest deploy (once, while it
 * fetches the new one), and that HTML asks for script files the new
 * server no longer has. A reload gets the new page, so this reloads once
 * by itself. If the reload didn't help, it says so, with a Reload button
 * and the error's message for reporting. */
const AppErrorScreen: React.FC<{ error: Error & { digest?: string }; reset: () => void }> = ({ error, reset }) => {
  const [reloading, setReloading] = useState(true)

  useEffect(() => {
    console.error("Page crashed:", error)
    try {
      const last = Number(sessionStorage.getItem(RELOAD_KEY)) || 0
      if (Date.now() - last > RELOAD_GUARD_MS) {
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
        window.location.reload()
        return
      }
    } catch {
      // storage blocked: with no way to tell a second crash from the
      // first, don't reload by itself — it could loop
    }
    setReloading(false)
  }, [error])

  if (reloading) {
    return (
      <div className={styles.root}>
        <p className={styles.lead}>Loading the latest version…</p>
      </div>
    )
  }

  return (
    <div className={styles.root} role="alert">
      <h1 className={styles.title}>This page didn&apos;t load properly</h1>
      <p className={styles.lead}>Reloading usually fixes it. Your saved work is safe — calculators save as you go.</p>
      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={() => window.location.reload()}>
          Reload
        </button>
        <button type="button" className={styles.secondary} onClick={reset}>
          Try again without reloading
        </button>
      </div>
      <details className={styles.details}>
        <summary>What went wrong</summary>
        <code>
          {error.name}: {error.message}
          {error.digest ? ` (ref ${error.digest})` : ""}
        </code>
      </details>
    </div>
  )
}

export default AppErrorScreen
