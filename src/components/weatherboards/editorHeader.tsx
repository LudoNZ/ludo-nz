"use client"

import Link from "next/link"
import { ReactNode } from "react"
import styles from "./editorHeader.module.scss"

/** Back link, project name (editable or fixed), a location badge, and a
 * row for status text and actions — the top of every editor page. */
const EditorHeader: React.FC<{
  name: string
  onRename?: (name: string) => void
  badge: string
  status?: ReactNode
  actions?: ReactNode
  /** where "← All projects" goes — the weatherboard projects page unless
   * another calculator's editor says otherwise */
  backHref?: string
}> = ({ name, onRename, badge, status, actions, backHref = "/weatherboards" }) => (
  <header className={styles.header}>
    <Link href={backHref} className={styles.back}>
      ← All projects
    </Link>
    <div className={styles.titleRow}>
      {onRename ? (
        <input
          className={styles.nameInput}
          value={name}
          aria-label="Project name"
          maxLength={100}
          placeholder="Project name"
          onChange={(e) => onRename(e.target.value)}
        />
      ) : (
        <h1>{name}</h1>
      )}
      <span className={styles.badge}>{badge}</span>
    </div>
    {(status || actions) && (
      <div className={styles.statusRow}>
        {status && <span className={styles.status}>{status}</span>}
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
    )}
  </header>
)

export default EditorHeader
