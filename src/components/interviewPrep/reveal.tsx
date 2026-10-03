"use client"

import { useState } from "react"
import styles from "./reveal.module.scss"

/** Hides `children` behind a toggle button — solutions and model answers,
 * so there's a moment to try first. */
const Reveal: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => {
  const [open, setOpen] = useState(false)
  return (
    <div className={styles.reveal}>
      <button type="button" className={styles.revealButton} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {open ? `Hide ${label.toLowerCase()}` : `Reveal ${label.toLowerCase()}`}
      </button>
      {open && <div className={styles.revealBody}>{children}</div>}
    </div>
  )
}

export default Reveal
