"use client"

import { useState } from "react"
import Link from "next/link"
import Button from "@/components/button/button"
import { Modal } from "@/app/elements/Modal/modal"
import styles from "./makePublicButton.module.scss"

/** "Make public" on a private project: asks whether to move it to the
 * public projects (same link, no private one left) or put a copy there
 * and keep the private one as it is. `onMove` moves it and switches the
 * page over; `onCopy` makes the public copy and gives its link. */
const MakePublicButton: React.FC<{
  name: string
  /** e.g. "site project", "stair" */
  what: string
  disabled?: boolean
  onMove: () => Promise<void>
  onCopy: () => Promise<string>
}> = ({ name, what, disabled, onMove, onCopy }) => {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<null | "move" | "copy">(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const close = () => {
    if (busy) return
    setOpen(false)
    setError(null)
  }
  const run = async (kind: "move" | "copy") => {
    setBusy(kind)
    setError(null)
    try {
      if (kind === "move") {
        await onMove()
        setOpen(false)
      } else setCopied(await onCopy())
    } catch (err) {
      console.error(`Making a ${what} public failed`, err)
      setError("That didn't work — check your connection and try again.")
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <Button
        size="small"
        variant="secondary"
        disabled={disabled}
        onClick={() => {
          setCopied(null)
          setOpen(true)
        }}
      >
        Make public…
      </Button>
      <Modal isActive={open} closeModal={close}>
        <div className={styles.content}>
          <h2>Make &ldquo;{name}&rdquo; public</h2>
          {copied ? (
            <>
              <p>The public copy is made. This private {what} stays as it was, and you&apos;re still on it.</p>
              <div className={styles.actions}>
                <Link href={copied} className={styles.openLink} onClick={() => setOpen(false)}>
                  Open the public copy →
                </Link>
                <Button size="small" variant="secondary" onClick={close}>
                  Stay here
                </Button>
              </div>
            </>
          ) : (
            <>
              <p>
                A public {what} is listed for everyone, and anyone with its link can see and edit it — no login needed. Only an
                admin can delete a public one.
              </p>
              <div className={styles.choices}>
                <button type="button" className={styles.choice} onClick={() => run("move")} disabled={busy !== null}>
                  <strong>{busy === "move" ? "Moving…" : "Move to public"}</strong>
                  <span>This {what} becomes public, on the same link. No private copy is kept.</span>
                </button>
                <button type="button" className={styles.choice} onClick={() => run("copy")} disabled={busy !== null}>
                  <strong>{busy === "copy" ? "Copying…" : "Copy to public, keep mine private"}</strong>
                  <span>A public copy is made as it is now. This private one stays yours, and the two go their own ways from here.</span>
                </button>
              </div>
              {error && <p className={styles.error}>{error}</p>}
              <div className={styles.actions}>
                <Button size="small" variant="secondary" onClick={close} disabled={busy !== null}>
                  Cancel
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </>
  )
}

export default MakePublicButton
