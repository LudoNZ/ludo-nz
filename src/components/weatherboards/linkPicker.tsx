"use client"

import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { Measure, MeasureGroup, anchorCounts, describe, rootOf } from "./measures"
import styles from "./linkPicker.module.scss"

type Filter = MeasureGroup | "all"

/** Choose what a dimension links to. Anchors — the measurements other
 * links already pull from — come first, since linking to one of those is
 * almost always the answer; then every width and height in the project,
 * elevation by elevation, wall by wall. Picking a measurement that's
 * itself linked links to its anchor instead. */
const LinkPicker: React.FC<{
  title: string
  measures: Measure[]
  links: Map<string, string>
  /** the measure being linked — it and anything linked to it are left out */
  targetKey: string | null
  group: MeasureGroup
  onPick: (anchorKey: string) => void
  onClose: () => void
}> = ({ title, measures, links, targetKey, group, onPick, onClose }) => {
  const [filter, setFilter] = useState<Filter>(group)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const byKey = useMemo(() => new Map(measures.map((m) => [m.key, m])), [measures])
  const counts = useMemo(() => anchorCounts(links), [links])

  const allowed = (m: Measure) =>
    (filter === "all" || m.group === filter) && (!targetKey || (m.key !== targetKey && rootOf(m.key, links) !== targetKey))

  const anchors = measures
    .filter((m) => counts.has(m.key) && allowed(m))
    .sort((a, b) => (counts.get(b.key) ?? 0) - (counts.get(a.key) ?? 0))

  const byElevation = new Map<string, { name: string; walls: Map<string, { name: string; items: Measure[] }> }>()
  for (const m of measures) {
    if (!allowed(m)) continue
    const e = byElevation.get(m.elevationId) ?? { name: m.elevationName, walls: new Map() }
    const w = e.walls.get(m.wallId) ?? { name: m.wallName, items: [] }
    w.items.push(m)
    e.walls.set(m.wallId, w)
    byElevation.set(m.elevationId, e)
  }

  const item = (m: Measure, showWhere = false) => {
    const anchor = links.get(m.key)
    return (
      <button key={m.key} type="button" className={styles.item} onClick={() => onPick(m.key)}>
        <span className={styles.itemLabel}>{showWhere ? describe(m) : m.label}</span>
        <span className={styles.itemValue}>{Math.round(m.value)}</span>
        {counts.has(m.key) && <span className={styles.itemMeta}>⚓ {counts.get(m.key)} linked</span>}
        {anchor && <span className={styles.itemMeta}>🔗 uses {describe(byKey.get(anchor))}</span>}
      </button>
    )
  }

  return createPortal(
    <div className={styles.backdrop} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label={title}>
        <div className={styles.header}>
          <h2>{title}</h2>
          <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className={styles.filters} role="radiogroup" aria-label="Show">
          {(["height", "width", "all"] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={filter === f}
              className={`${styles.filter} ${filter === f ? styles.filterOn : ""}`}
              onClick={() => setFilter(f)}
            >
              {f === "height" ? "Heights" : f === "width" ? "Widths" : "All"}
            </button>
          ))}
        </div>

        <div className={styles.body}>
          <section>
            <h3>Anchor measurements</h3>
            {anchors.length ? (
              <div className={styles.items}>
                {anchors.map((m) => item(m, true))}
              </div>
            ) : (
              <p className={styles.empty}>No anchors yet — whatever you pick here becomes one.</p>
            )}
          </section>

          {[...byElevation.entries()].map(([id, e]) => (
            <section key={id}>
              <h3>{e.name}</h3>
              {[...e.walls.entries()].map(([wid, w]) => (
                <div key={wid} className={styles.wall}>
                  <h4>{w.name}</h4>
                  <div className={styles.items}>
                    {w.items.map((m) => item(m))}
                  </div>
                </div>
              ))}
            </section>
          ))}
          {byElevation.size === 0 && <p className={styles.empty}>Nothing else to link to yet — add another wall first.</p>}
        </div>
      </div>
    </div>,
    document.body,
  )
}

export default LinkPicker
