"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/context/auth"
import { useSiteAccess } from "@/context/siteAccess"
import { ACCESS_LEVELS, FeatureAccess, FEATURES, FeatureId, SiteAccess } from "@/lib/features"
import { saveSiteAccess } from "./siteAccessActions"
import styles from "./siteAccessSection.module.scss"

const HINTS: Record<FeatureAccess, string> = {
  public: "Everyone, signed in or not",
  granted: "Members you've ticked it for below",
  hidden: "Only you",
}

/** Admin dashboard: choose, per tab, whether it's public, members only
 * (granted per member in the Members section) or hidden. Saves on each
 * change; the whole site picks it up on its next page load. */
export default function SiteAccessSection() {
  const auth = useAuth()
  const saved = useSiteAccess()
  const [value, setValue] = useState<SiteAccess>(saved)
  const [busy, setBusy] = useState<FeatureId | null>(null)
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null)

  // follow the server's copy when it changes (e.g. refreshed after a save)
  useEffect(() => setValue(saved), [saved])

  const change = async (id: FeatureId, access: FeatureAccess) => {
    if (!auth?.currentUser || value[id] === access) return
    const previous = value
    const next = { ...value, [id]: access }
    setValue(next)
    setBusy(id)
    setStatus(null)
    try {
      setValue(await saveSiteAccess(await auth.currentUser.getIdToken(), next))
      const label = FEATURES.find((f) => f.id === id)!.label
      const level = ACCESS_LEVELS.find((l) => l.value === access)!.label
      setStatus({ kind: "ok", text: `${label} is now ${level.toLowerCase()}.` })
    } catch (e) {
      setValue(previous)
      setStatus({ kind: "error", text: e instanceof Error ? e.message : "Couldn't save that change" })
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className={styles.siteAccessSection}>
      <div className={styles.header}>
        <h2>Site access</h2>
        <p>Who can see each tab. Members only tabs are given to people in Members, below.</p>
      </div>

      <ul className={styles.list}>
        {FEATURES.map((f) => (
          <li key={f.id} className={styles.row}>
            <div className={styles.name}>
              <span className={styles.label}>{f.label}</span>
              <span className={styles.hint}>{HINTS[value[f.id]]}</span>
            </div>
            <div className={styles.segmented} role="radiogroup" aria-label={`${f.label} access`}>
              {ACCESS_LEVELS.map((l) => (
                <button
                  key={l.value}
                  type="button"
                  role="radio"
                  aria-checked={value[f.id] === l.value}
                  className={value[f.id] === l.value ? styles.on : undefined}
                  disabled={busy !== null}
                  onClick={() => change(f.id, l.value)}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>

      <p className={status?.kind === "error" ? styles.error : styles.status} aria-live="polite">
        {busy ? "Saving..." : status?.text}
      </p>
    </section>
  )
}
