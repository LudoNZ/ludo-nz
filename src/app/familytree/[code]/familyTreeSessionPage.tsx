"use client"

import React, { useCallback, useEffect, useState } from "react"
import styles from "./familyTreeSessionPage.module.scss"
import Link from "next/link"
import { firestore } from "../../../../firebase/client"
import { doc, onSnapshot, updateDoc } from "firebase/firestore"
import FamilyTreeView from "@/components/familyTree/familyTreeView"
import { FamilyTreeData, Person, Relationship, Source, newId } from "@/components/familyTree/types"

interface FamilyTreeSessionPageProps {
  code: string
}

const FamilyTreeSessionPage: React.FC<FamilyTreeSessionPageProps> = ({ code }) => {
  const [data, setData] = useState<FamilyTreeData | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState("")
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const sessionDoc = doc(firestore, "familyTreeSessions", code)
    const unsub = onSnapshot(
      sessionDoc,
      (snap) => {
        if (!snap.exists()) {
          setNotFound(true)
          return
        }
        const snapData = snap.data()
        setData({
          people: (snapData.people || []) as Person[],
          relationships: (snapData.relationships || []) as Relationship[],
        })
      },
      () => setError("Failed to load family tree")
    )
    return () => unsub()
  }, [code])

  const persist = useCallback(
    async (updates: Partial<{ people: Person[]; relationships: Relationship[] }>) => {
      try {
        await updateDoc(doc(firestore, "familyTreeSessions", code), updates)
      } catch {
        setError("Failed to save change. Please try again.")
      }
    },
    [code]
  )

  const handleAddPerson = useCallback(
    (person: Person) => {
      if (!data) return
      persist({ people: [...data.people, person] })
    },
    [data, persist]
  )

  const handleUpdatePerson = useCallback(
    (personId: string, updates: Partial<Person>) => {
      if (!data) return
      persist({ people: data.people.map((p) => (p.id === personId ? { ...p, ...updates } : p)) })
    },
    [data, persist]
  )

  const handleAddSource = useCallback(
    (personId: string, source: Source) => {
      if (!data) return
      persist({
        people: data.people.map((p) =>
          p.id === personId ? { ...p, sources: [...p.sources, source] } : p
        ),
      })
    },
    [data, persist]
  )

  const handleAddParentChild = useCallback(
    (parent: string, child: string) => {
      if (!data) return
      const exists = data.relationships.some(
        (r) => r.type === "parent-child" && r.parent === parent && r.child === child
      )
      if (exists) return
      persist({
        relationships: [...data.relationships, { id: newId("pc"), type: "parent-child", parent, child }],
      })
    },
    [data, persist]
  )

  const handleAddSpouse = useCallback(
    (personA: string, personB: string, marriedYear?: string, location?: string) => {
      if (!data) return
      const exists = data.relationships.some(
        (r) =>
          r.type === "spouse" &&
          ((r.personA === personA && r.personB === personB) || (r.personA === personB && r.personB === personA))
      )
      if (exists) return
      persist({
        relationships: [
          ...data.relationships,
          { id: newId("sp"), type: "spouse", personA, personB, marriedYear, location },
        ],
      })
    },
    [data, persist]
  )

  const handleCopyCode = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  if (notFound) {
    return (
      <div className={styles.sessionPage}>
        <div className={styles.notFound}>
          <h2>Tree Not Found</h2>
          <p>The session code &quot;{code}&quot; doesn&apos;t exist or has expired.</p>
          <Link href="/familytree" className={styles.backLink}>← Back to Family Tree</Link>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className={styles.sessionPage}>
        <p className={styles.loading}>Loading family tree...</p>
      </div>
    )
  }

  return (
    <div className={styles.sessionPage}>
      <div className={styles.topBar}>
        <div className={styles.codeBadge}>
          Session <span className={styles.code}>{code}</span>
          <button className={styles.copyBtn} onClick={handleCopyCode}>
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <Link href="/familytree" className={styles.backLink}>← Back to Family Tree</Link>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <FamilyTreeView
        data={data}
        onAddPerson={handleAddPerson}
        onUpdatePerson={handleUpdatePerson}
        onAddSource={handleAddSource}
        onAddParentChild={handleAddParentChild}
        onAddSpouse={handleAddSpouse}
      />
    </div>
  )
}

export default FamilyTreeSessionPage
