"use client"

import React, { useState } from "react"
import styles from "./familyTree.module.scss"
import { Gender, Person, newId } from "./types"

interface AddPersonModalProps {
  onClose: () => void
  onSubmit: (person: Person) => void
}

export const AddPersonModal: React.FC<AddPersonModalProps> = ({ onClose, onSubmit }) => {
  const [name, setName] = useState("")
  const [label, setLabel] = useState("")
  const [birthYear, setBirthYear] = useState("")
  const [deathYear, setDeathYear] = useState("")
  const [notes, setNotes] = useState("")
  const [gender, setGender] = useState<Gender | "">("")
  const [error, setError] = useState("")

  const handleSubmit = () => {
    if (!name.trim()) {
      setError("Enter a name")
      return
    }
    onSubmit({
      id: newId("person"),
      name: name.trim(),
      label: label.trim() || undefined,
      birthYear: birthYear.trim() || undefined,
      deathYear: deathYear.trim() || undefined,
      notes: notes.trim() || undefined,
      confirmed: false,
      sources: [],
      gender: gender || undefined,
    })
  }

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modal}>
        <h3>Add person</h3>
        {error && <p className={styles.modalError}>{error}</p>}
        <div className={styles.field}>
          <label>Full name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Thomas Whitfield" />
        </div>
        <div className={styles.field}>
          <label>Relation label (optional)</label>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Great x 5 Grandmother" />
        </div>
        <div className={styles.field}>
          <label>Birth (optional)</label>
          <input value={birthYear} onChange={(e) => setBirthYear(e.target.value)} placeholder="1930 or 27/12/1930" />
        </div>
        <div className={styles.field}>
          <label>Death (optional, leave blank if unknown)</label>
          <input value={deathYear} onChange={(e) => setDeathYear(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label>Gender (optional — used for maternal/paternal grouping)</label>
          <select value={gender} onChange={(e) => setGender(e.target.value as Gender | "")}>
            <option value="">Unspecified</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
          </select>
        </div>
        <div className={styles.field}>
          <label>Notes (optional)</label>
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className={styles.modalActions}>
          <button className={styles.ghost} onClick={onClose}>Cancel</button>
          <button className={styles.primary} onClick={handleSubmit}>Add person</button>
        </div>
      </div>
    </div>
  )
}

interface AddRelationshipModalProps {
  people: Person[]
  onClose: () => void
  onSubmitParentChild: (parent: string, child: string) => void
  onSubmitSpouse: (personA: string, personB: string, marriedYear?: string, location?: string) => void
}

export const AddRelationshipModal: React.FC<AddRelationshipModalProps> = ({
  people,
  onClose,
  onSubmitParentChild,
  onSubmitSpouse,
}) => {
  const [type, setType] = useState<"parent-child" | "spouse">("parent-child")
  const [parent, setParent] = useState(people[0]?.id || "")
  const [child, setChild] = useState(people[0]?.id || "")
  const [personA, setPersonA] = useState(people[0]?.id || "")
  const [personB, setPersonB] = useState(people[0]?.id || "")
  const [marriedYear, setMarriedYear] = useState("")
  const [location, setLocation] = useState("")
  const [error, setError] = useState("")

  const handleSubmit = () => {
    if (type === "parent-child") {
      if (!parent || !child || parent === child) {
        setError("Choose two different people")
        return
      }
      onSubmitParentChild(parent, child)
    } else {
      if (!personA || !personB || personA === personB) {
        setError("Choose two different people")
        return
      }
      onSubmitSpouse(personA, personB, marriedYear.trim() || undefined, location.trim() || undefined)
    }
  }

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modal}>
        <h3>Add relationship</h3>
        <div className={styles.typeToggle}>
          <button
            className={type === "parent-child" ? styles.typeToggleBtnActive : styles.typeToggleBtn}
            onClick={() => { setType("parent-child"); setError("") }}
          >
            Parent &amp; Child
          </button>
          <button
            className={type === "spouse" ? styles.typeToggleBtnActive : styles.typeToggleBtn}
            onClick={() => { setType("spouse"); setError("") }}
          >
            Spouse / Partner
          </button>
        </div>
        {error && <p className={styles.modalError}>{error}</p>}
        {type === "parent-child" ? (
          <>
            <div className={styles.field}>
              <label>Parent</label>
              <select value={parent} onChange={(e) => setParent(e.target.value)}>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label>Child</label>
              <select value={child} onChange={(e) => setChild(e.target.value)}>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </>
        ) : (
          <>
            <div className={styles.field}>
              <label>Person A</label>
              <select value={personA} onChange={(e) => setPersonA(e.target.value)}>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label>Person B</label>
              <select value={personB} onChange={(e) => setPersonB(e.target.value)}>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label>Married year (optional)</label>
              <input value={marriedYear} onChange={(e) => setMarriedYear(e.target.value)} placeholder="e.g. 1822" />
            </div>
            <div className={styles.field}>
              <label>Location (optional)</label>
              <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Dundee" />
            </div>
          </>
        )}
        <div className={styles.modalActions}>
          <button className={styles.ghost} onClick={onClose}>Cancel</button>
          <button className={styles.primary} onClick={handleSubmit}>
            {type === "parent-child" ? "Link parent & child" : "Link spouses"}
          </button>
        </div>
      </div>
    </div>
  )
}
