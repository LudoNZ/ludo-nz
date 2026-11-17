"use client"

import { ReactNode, useCallback, useEffect, useRef, useState } from "react"
import { ChevronRightIcon } from "@/components/icons/icons"
import styles from "./sectionRail.module.scss"

export interface RailSection {
  /** the id of the element to scroll to */
  id: string
  label: string
  icon: ReactNode
}

/** px from the left edge of the screen a swipe has to start within */
const EDGE_PX = 28
/** px a swipe has to travel to count */
const SWIPE_PX = 48

/** A side panel for getting around a long page. Closed, it's a column of
 * small dots on the left edge — one per section, the one you're in
 * enlarged. Tap it, or swipe in from the left edge of the screen, and it
 * slides out as icons with their names; tap one and the page scrolls
 * smoothly to that section. Swipe it back, tap outside or press Escape to
 * close. Sections whose element isn't on the page right now are left out,
 * so it only lists what there is to scroll to. */
const SectionRail: React.FC<{ sections: RailSection[] }> = ({ sections }) => {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState<string | null>(null)
  const [present, setPresent] = useState<RailSection[]>(sections)
  const touch = useRef<{ x: number; y: number; fromEdge: boolean; wasOpen: boolean } | null>(null)

  // which of the sections are actually on the page, and which one the
  // reader is in: the last section that's reached the upper part of the screen
  const sectionKey = sections.map((s) => s.id).join(",")
  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      const here = sections.filter((s) => document.getElementById(s.id))
      setPresent((prev) => (prev.map((s) => s.id).join(",") === here.map((s) => s.id).join(",") ? prev : here))
      const line = window.innerHeight * 0.3
      let current: string | null = here[0]?.id ?? null
      for (const s of here) {
        const el = document.getElementById(s.id)
        if (el && el.getBoundingClientRect().top <= line) current = s.id
      }
      // at the very bottom the last section wins even if it's short
      if (here.length && window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) current = here[here.length - 1].id
      setActive(current)
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener("scroll", schedule, { passive: true })
    window.addEventListener("resize", schedule)
    // the page grows and shrinks as sections appear and results change
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => {
      window.removeEventListener("scroll", schedule)
      window.removeEventListener("resize", schedule)
      observer.disconnect()
      if (frame) cancelAnimationFrame(frame)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionKey])

  const go = useCallback((id: string) => {
    const el = document.getElementById(id)
    if (!el) return
    const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    // a little air above the section, rather than flush with the screen top
    window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - 16), behavior: calm ? "auto" : "smooth" })
    setOpen(false)
  }, [])

  // swipe in from the left edge to open; swipe back to close
  useEffect(() => {
    const start = (e: TouchEvent) => {
      const t = e.touches[0]
      touch.current = { x: t.clientX, y: t.clientY, fromEdge: t.clientX <= EDGE_PX, wasOpen: open }
    }
    const move = (e: TouchEvent) => {
      const s = touch.current
      if (!s) return
      const t = e.touches[0]
      const dx = t.clientX - s.x
      const dy = t.clientY - s.y
      // mostly sideways, so it never fights a scroll
      if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return
      if (!s.wasOpen && s.fromEdge && dx > 0) setOpen(true)
      else if (s.wasOpen && dx < 0) setOpen(false)
      touch.current = null
    }
    const end = () => {
      touch.current = null
    }
    document.addEventListener("touchstart", start, { passive: true })
    document.addEventListener("touchmove", move, { passive: true })
    document.addEventListener("touchend", end)
    return () => {
      document.removeEventListener("touchstart", start)
      document.removeEventListener("touchmove", move)
      document.removeEventListener("touchend", end)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  if (present.length < 2) return null

  return (
    <>
      {open && <div className={styles.scrim} onClick={() => setOpen(false)} aria-hidden="true" />}
      <nav className={`${styles.rail} ${open ? styles.railOpen : ""}`} aria-label="Jump to a part of this page">
        {/* closed: dots, one per section — the whole strip opens the panel */}
        <button
          type="button"
          className={styles.handle}
          aria-expanded={open}
          aria-label={open ? "Close the section panel" : "Open the section panel"}
          onClick={() => setOpen((o) => !o)}
        >
          <span className={styles.dots} aria-hidden="true">
            {present.map((s) => (
              <span key={s.id} className={s.id === active ? styles.dotActive : styles.dot} />
            ))}
          </span>
          <ChevronRightIcon className={styles.chevron} />
        </button>
        <ul className={styles.list}>
          {present.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className={s.id === active ? styles.itemActive : styles.item}
                aria-current={s.id === active ? "true" : undefined}
                tabIndex={open ? 0 : -1}
                onClick={() => go(s.id)}
              >
                <span className={styles.icon}>{s.icon}</span>
                <span className={styles.label}>{s.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </>
  )
}

export default SectionRail
