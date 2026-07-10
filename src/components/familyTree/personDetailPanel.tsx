"use client"

import React, { useEffect, useState } from "react"
import styles from "./familyTree.module.scss"
import {
  FamilyTreeData,
  Person,
  Source,
  formatYears,
  personById,
  getParents,
  getChildren,
  getSpouseRelationships,
  otherSpouse,
} from "./types"

interface PersonDetailPanelProps {
  person: Person
  data: FamilyTreeData
  onClose: () => void
  onUpdatePerson: (personId: string, updates: Partial<Person>) => void
  onAddSource: (personId: string, source: Source) => void
}

const PersonDetailPanel: React.FC<PersonDetailPanelProps> = ({
  person,
  data,
  onClose,
  onUpdatePerson,
  onAddSource,
}) => {
  const [details, setDetails] = useState({
    birthYear: person.birthYear || "",
    deathYear: person.deathYear || "",
    notes: person.notes || "",
  })
  const [srcType, setSrcType] = useState("")
  const [srcYear, setSrcYear] = useState("")
  const [srcLoc, setSrcLoc] = useState("")

  useEffect(() => {
    setDetails({
      birthYear: person.birthYear || "",
      deathYear: person.deathYear || "",
      notes: person.notes || "",
    })
    setSrcType("")
    setSrcYear("")
    setSrcLoc("")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [person.id])

  const dirty =
    details.birthYear !== (person.birthYear || "") ||
    details.deathYear !== (person.deathYear || "") ||
    details.notes !== (person.notes || "")

  const parents = getParents(person.id, data.relationships)
    .map((id) => personById(data.people, id))
    .filter((p): p is Person => !!p)
  const children = getChildren(person.id, data.relationships)
    .map((id) => personById(data.people, id))
    .filter((p): p is Person => !!p)
  const spouseRels = getSpouseRelationships(person.id, data.relationships)

  const handleSaveDetails = () => {
    onUpdatePerson(person.id, {
      birthYear: details.birthYear.trim() || undefined,
      deathYear: details.deathYear.trim() || undefined,
      notes: details.notes.trim() || undefined,
    })
  }

  const handleAddSource = () => {
    if (!srcType.trim()) return
    onAddSource(person.id, {
      type: srcType.trim(),
      year: srcYear.trim() || undefined,
      location: srcLoc.trim() || undefined,
    })
    setSrcType("")
    setSrcYear("")
    setSrcLoc("")
  }

  return (
    <div className={styles.detailPanel}>
      <button className={styles.closeBtn} onClick={onClose}>✕</button>
      <h2>{person.name}</h2>
      {person.label && <div className={styles.sub}>{person.label}</div>}
      <div className={styles.sub}>{formatYears(person)}</div>

      <label className={styles.confirmRow}>
        <input
          type="checkbox"
          checked={person.confirmed}
          onChange={(e) => onUpdatePerson(person.id, { confirmed: e.target.checked })}
        />
        Confirmed by source review
      </label>

      <div className={styles.sectionLabel}>Details</div>
      <div className={styles.formStack}>
        <input
          placeholder="Birth (e.g. 1801 or 27/12/1761)"
          value={details.birthYear}
          onChange={(e) => setDetails((d) => ({ ...d, birthYear: e.target.value }))}
        />
        <input
          placeholder="Death"
          value={details.deathYear}
          onChange={(e) => setDetails((d) => ({ ...d, deathYear: e.target.value }))}
        />
        <textarea
          placeholder="Notes (occupation, census, uncertainty, etc.)"
          rows={3}
          value={details.notes}
          onChange={(e) => setDetails((d) => ({ ...d, notes: e.target.value }))}
        />
        {dirty && (
          <button className={`${styles.ghost} ${styles.selfStart}`} onClick={handleSaveDetails}>
            Save details
          </button>
        )}
      </div>

      <div className={styles.sectionLabel}>Relationships</div>
      {parents.length === 0 && children.length === 0 && spouseRels.length === 0 ? (
        <div className={styles.emptyNote}>No relationships linked yet.</div>
      ) : (
        <div className={styles.relationsList}>
          {spouseRels.map((r) => {
            const spouse = personById(data.people, otherSpouse(r, person.id))
            if (!spouse) return null
            const meta = [r.marriedYear, r.location].filter(Boolean).join(", ")
            return (
              <div key={r.id}>
                <span className={styles.relTag}>Spouse</span>
                {spouse.name}
                {meta && <span className={styles.emptyNote}> — married {meta}</span>}
              </div>
            )
          })}
          {parents.map((p) => (
            <div key={p.id}>
              <span className={styles.relTag}>Parent</span>
              {p.name}
            </div>
          ))}
          {children.map((c) => (
            <div key={c.id}>
              <span className={styles.relTag}>Child</span>
              {c.name}
            </div>
          ))}
        </div>
      )}

      <div className={styles.sectionLabel}>Sources ({person.sources.length})</div>
      {person.sources.length === 0 ? (
        <div className={styles.emptyNote}>No sources attached yet.</div>
      ) : (
        person.sources.map((s, i) => (
          <div key={i} className={styles.sourceItem}>
            <div className={styles.srcType}>{s.type}</div>
            <div className={styles.srcMeta}>{s.year || "Year unknown"} · {s.location || "Location unknown"}</div>
          </div>
        ))
      )}
      <div className={styles.formStack}>
        <input
          placeholder="Source type, e.g. Marriage Certificate"
          value={srcType}
          onChange={(e) => setSrcType(e.target.value)}
        />
        <input placeholder="Year" value={srcYear} onChange={(e) => setSrcYear(e.target.value)} />
        <input placeholder="Location" value={srcLoc} onChange={(e) => setSrcLoc(e.target.value)} />
        <button className={`${styles.ghost} ${styles.selfStart}`} onClick={handleAddSource}>
          + Add source
        </button>
      </div>
    </div>
  )
}

export default PersonDetailPanel
