"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import styles from "./familyTree.module.scss"
import {
  FamilyTreeData,
  LineageSide,
  Person,
  Source,
  computeGenerations,
  computeLineageSides,
  orderWithSpouses,
  personById,
  formatYears,
} from "./types"
import PersonDetailPanel from "./personDetailPanel"
import { AddPersonModal, AddRelationshipModal } from "./familyTreeModals"
import TreeSummary from "./treeSummary"

interface FamilyTreeViewProps {
  data: FamilyTreeData
  onAddPerson: (person: Person) => void
  onUpdatePerson: (personId: string, updates: Partial<Person>) => void
  onAddSource: (personId: string, source: Source) => void
  onAddParentChild: (parent: string, child: string) => void
  onAddSpouse: (personA: string, personB: string, marriedYear?: string, location?: string) => void
  onSetRoot: (personId: string) => void
}

const LINE_COLOR = "#9C8F78"
const MOBILE_BREAKPOINT = 700

type ViewMode = "tree" | "summary"
type LineageChoice = "maternal" | "paternal"

const FamilyTreeView: React.FC<FamilyTreeViewProps> = ({
  data,
  onAddPerson,
  onUpdatePerson,
  onAddSource,
  onAddParentChild,
  onAddSpouse,
  onSetRoot,
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showPersonModal, setShowPersonModal] = useState(false)
  const [showRelModal, setShowRelModal] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>("tree")
  const [lineageChoice, setLineageChoice] = useState<LineageChoice>("maternal")
  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT) {
      setViewMode("summary")
    }
  }, [])

  const gen = useMemo(() => computeGenerations(data), [data])
  const maxLevel = useMemo(() => Math.max(0, ...Object.values(gen)), [gen])
  const sideMap = useMemo(() => computeLineageSides(data), [data])
  const hasRoot = !!data.rootPersonId
  const oppositeSide: LineageSide = lineageChoice === "maternal" ? "paternal" : "maternal"

  const rows = useMemo(() => {
    const out: { level: number; ids: string[] }[] = []
    for (let lvl = 0; lvl <= maxLevel; lvl++) {
      const ids = data.people.filter((p) => gen[p.id] === lvl).map((p) => p.id)
      if (ids.length === 0) continue
      out.push({ level: lvl, ids: orderWithSpouses(ids, data.relationships) })
    }
    return out
  }, [data, gen, maxLevel])

  useEffect(() => {
    const drawLines = () => {
      const svg = svgRef.current
      const wrap = wrapRef.current
      if (!svg || !wrap) return
      svg.setAttribute("width", String(wrap.scrollWidth))
      svg.setAttribute("height", String(wrap.scrollHeight))
      svg.innerHTML = ""
      const wrapRect = wrap.getBoundingClientRect()

      data.relationships.forEach((r) => {
        if (r.type === "parent-child") {
          const pEl = document.getElementById(`ft-card-${r.parent}`)
          const cEl = document.getElementById(`ft-card-${r.child}`)
          if (!pEl || !cEl) return
          const pr = pEl.getBoundingClientRect()
          const cr = cEl.getBoundingClientRect()
          const x1 = pr.left - wrapRect.left + pr.width / 2 + wrap.scrollLeft
          const y1 = pr.top - wrapRect.top + pr.height + wrap.scrollTop
          const x2 = cr.left - wrapRect.left + cr.width / 2 + wrap.scrollLeft
          const y2 = cr.top - wrapRect.top + wrap.scrollTop
          const midY = (y1 + y2) / 2
          const path = document.createElementNS("http://www.w3.org/2000/svg", "path")
          path.setAttribute("d", `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`)
          path.setAttribute("stroke", LINE_COLOR)
          path.setAttribute("stroke-width", "1.4")
          path.setAttribute("fill", "none")
          svg.appendChild(path)
        } else {
          const aEl = document.getElementById(`ft-card-${r.personA}`)
          const bEl = document.getElementById(`ft-card-${r.personB}`)
          if (!aEl || !bEl) return
          const ar = aEl.getBoundingClientRect()
          const br = bEl.getBoundingClientRect()
          if (Math.abs(ar.top - br.top) > 4) return
          const left = ar.left < br.left ? ar : br
          const right = ar.left < br.left ? br : ar
          const y = left.top - wrapRect.top + left.height / 2 + wrap.scrollTop
          const x1 = left.left - wrapRect.left + left.width + wrap.scrollLeft
          const x2 = right.left - wrapRect.left + wrap.scrollLeft
          const line = document.createElementNS("http://www.w3.org/2000/svg", "line")
          line.setAttribute("x1", String(x1))
          line.setAttribute("y1", String(y))
          line.setAttribute("x2", String(x2))
          line.setAttribute("y2", String(y))
          line.setAttribute("stroke", LINE_COLOR)
          line.setAttribute("stroke-width", "1.4")
          line.setAttribute("stroke-dasharray", "3 3")
          svg.appendChild(line)
        }
      })
    }

    drawLines()
    window.addEventListener("resize", drawLines)
    return () => window.removeEventListener("resize", drawLines)
  }, [data, rows])

  const selected = selectedId ? personById(data.people, selectedId) : null

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div className={styles.titleBlock}>
          <div className={styles.eyebrow}>Genealogy Workspace</div>
          <h1 className={styles.title}>Family Tree</h1>
        </div>
        <div className={styles.headerActions}>
          <button className={`${styles.btn} ${styles.ghost}`} onClick={() => setShowPersonModal(true)}>
            + Add person
          </button>
          <button className={`${styles.btn} ${styles.primary}`} onClick={() => setShowRelModal(true)}>
            + Add relationship
          </button>
        </div>
      </div>

      <div className={styles.legend}>
        <span><span className={`${styles.dot} ${styles.dotConfirmed}`}></span>Confirmed</span>
        <span><span className={`${styles.dot} ${styles.dotUnconfirmed}`}></span>Unconfirmed</span>
        <span className={styles.legendHint}>Click a card to view sources &amp; edit</span>
      </div>

      <div className={styles.controlsRow}>
        <div className={styles.typeToggle}>
          <button
            className={viewMode === "tree" ? styles.typeToggleBtnActive : styles.typeToggleBtn}
            onClick={() => setViewMode("tree")}
          >
            Tree
          </button>
          <button
            className={viewMode === "summary" ? styles.typeToggleBtnActive : styles.typeToggleBtn}
            onClick={() => setViewMode("summary")}
          >
            Summary
          </button>
        </div>

        <div className={styles.lineageControl}>
          <div className={styles.typeToggle}>
            <button
              className={lineageChoice === "maternal" ? styles.typeToggleBtnActive : styles.typeToggleBtn}
              disabled={!hasRoot}
              onClick={() => setLineageChoice("maternal")}
            >
              Maternal
            </button>
            <button
              className={lineageChoice === "paternal" ? styles.typeToggleBtnActive : styles.typeToggleBtn}
              disabled={!hasRoot}
              onClick={() => setLineageChoice("paternal")}
            >
              Paternal
            </button>
          </div>
          {!hasRoot && (
            <span className={styles.legendHint}>Set a root person (in their detail panel) to enable</span>
          )}
        </div>
      </div>

      {viewMode === "summary" ? (
        <TreeSummary
          data={data}
          gen={gen}
          sideMap={sideMap}
          onSelectPerson={(id) => {
            setSelectedId(id)
          }}
        />
      ) : (
        <div className={styles.treeWrap} ref={wrapRef}>
          <svg ref={svgRef} className={styles.lines}></svg>
          {rows.map(({ level, ids }) => (
            <div key={level} className={styles.generationBlock}>
              <div className={styles.genLabel}>Generation {level + 1}</div>
              <div className={styles.generationRow}>
                {ids.map((id) => {
                  const p = personById(data.people, id)
                  if (!p) return null
                  const dimmed = hasRoot && sideMap[id] === oppositeSide
                  return (
                    <div
                      key={id}
                      id={`ft-card-${id}`}
                      role="button"
                      tabIndex={0}
                      className={`${styles.card} ${id === selectedId ? styles.cardSelected : ""} ${dimmed ? styles.cardDimmed : ""}`}
                      onClick={() => setSelectedId(id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") setSelectedId(id)
                      }}
                    >
                      <div className={p.confirmed ? styles.statusTabConfirmed : styles.statusTabUnconfirmed}>
                        {p.confirmed ? "Confirmed" : "Unconfirmed"}
                      </div>
                      {p.label && <div className={styles.cardLabel}>{p.label}</div>}
                      <div className={styles.cardName}>{p.name}</div>
                      <div className={styles.cardYears}>{formatYears(p)}</div>
                      <div className={styles.srcCount}>
                        {p.sources.length} source{p.sources.length !== 1 ? "s" : ""} attached
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <PersonDetailPanel
          person={selected}
          data={data}
          isRoot={selected.id === data.rootPersonId}
          onClose={() => setSelectedId(null)}
          onUpdatePerson={onUpdatePerson}
          onAddSource={onAddSource}
          onSetRoot={onSetRoot}
        />
      )}

      {showPersonModal && (
        <AddPersonModal
          onClose={() => setShowPersonModal(false)}
          onSubmit={(p) => {
            onAddPerson(p)
            setShowPersonModal(false)
          }}
        />
      )}
      {showRelModal && (
        <AddRelationshipModal
          people={data.people}
          onClose={() => setShowRelModal(false)}
          onSubmitParentChild={(parent, child) => {
            onAddParentChild(parent, child)
            setShowRelModal(false)
          }}
          onSubmitSpouse={(a, b, marriedYear, location) => {
            onAddSpouse(a, b, marriedYear, location)
            setShowRelModal(false)
          }}
        />
      )}
    </div>
  )
}

export default FamilyTreeView
