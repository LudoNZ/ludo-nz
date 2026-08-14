"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { useAuth } from "@/context/auth"
import Button from "@/components/button/button"
import BoardStockPanel from "@/components/decking/boardStockPanel"
import {
  deleteProject,
  newDeckId,
  saveDeck,
  saveProject,
  setDeckProject,
  StoredDeck,
  StoredProject,
  subscribeToDecks,
} from "@/components/decking/data"
import { computeProjectStockAllocation } from "@/components/decking/projectStock"
import { useProjectsList } from "@/components/decking/useProjectsList"
import { defaultDeckConfig, formatLength } from "@/components/decking/types"
import { TrashIcon } from "@/components/icons/icons"
import styles from "./projectDetailPage.module.scss"

/** Same no-login-required rules as a deck's own detail page: a public
 * project is fully editable by anyone, a private one only ever shows up
 * in your own subscription. Delete is the one action Firestore itself
 * refuses on a public project. */
const ProjectDetailPage = () => {
  const auth = useAuth()
  const router = useRouter()
  const params = useParams<{ projectId: string }>()
  const { projects, loaded: projectsLoaded } = useProjectsList()
  const [publicDecks, setPublicDecks] = useState<StoredDeck[]>([])
  const [publicLoaded, setPublicLoaded] = useState(false)
  const [privateDecks, setPrivateDecks] = useState<StoredDeck[]>([])
  const [privateLoaded, setPrivateLoaded] = useState(false)
  const [nameDraft, setNameDraft] = useState<string | null>(null)
  const [addDeckId, setAddDeckId] = useState("")
  const [creatingDeck, setCreatingDeck] = useState(false)

  useEffect(() => {
    const unsubscribe = subscribeToDecks({ kind: "public" }, (data) => {
      setPublicDecks(data)
      setPublicLoaded(true)
    })
    return () => unsubscribe()
  }, [])

  useEffect(() => {
    if (!auth || auth.authLoading) return
    if (!auth.currentUser) {
      setPrivateDecks([])
      setPrivateLoaded(true)
      return
    }
    const unsubscribe = subscribeToDecks({ kind: "private", uid: auth.currentUser.uid }, (data) => {
      setPrivateDecks(data)
      setPrivateLoaded(true)
    })
    return () => unsubscribe()
  }, [auth, auth?.authLoading, auth?.currentUser])

  const loaded = publicLoaded && privateLoaded && projectsLoaded
  const project = projects.find((p) => p.id === params.projectId)
  const allDecks = useMemo(() => [...privateDecks, ...publicDecks], [privateDecks, publicDecks])

  const memberDecks = useMemo(
    () =>
      project
        ? allDecks
            .filter((d) => d.projectId === project.id)
            .sort((a, b) => a.projectOrder - b.projectOrder || a.id.localeCompare(b.id))
        : [],
    [project, allDecks]
  )

  const effectiveStockByDeck = useMemo(() => {
    if (!project) return null
    return computeProjectStockAllocation(
      project.stock,
      memberDecks.map((d) => ({ id: d.id, config: d, projectOrder: d.projectOrder }))
    )
  }, [project, memberDecks])

  // decks eligible to join: same location as the project, not already a
  // member here (picking one just moves it here, even from another
  // project — reparenting is allowed any time, same as from a deck's own
  // edit form)
  const addableDecks = project
    ? allDecks.filter((d) => {
        if (d.projectId === project.id) return false
        if (project.location.kind !== d.location.kind) return false
        return project.location.kind === "public" || (d.location.kind === "private" && d.location.uid === project.location.uid)
      })
    : []

  if (!loaded) {
    return (
      <div className={styles.detailPage}>
        <p className={styles.loading}>Loading…</p>
      </div>
    )
  }

  if (!project) {
    return (
      <div className={styles.detailPage}>
        <p className={styles.loading}>Project not found.</p>
      </div>
    )
  }

  // saveProject wants every field except updatedAt — strip location/
  // updatedAt off the live project rather than hand-listing fields, same
  // reasoning as deckDetailPage.tsx's saveDeckWith.
  const saveProjectWith = (overrides: Partial<Omit<StoredProject, "id" | "updatedAt" | "location">>) => {
    const { location, ...projectOnly } = project
    const rest: Partial<StoredProject> = { ...projectOnly }
    delete rest.updatedAt
    return saveProject(location, { ...(rest as Omit<StoredProject, "updatedAt" | "location">), ...overrides })
  }

  const commitName = () => {
    if (nameDraft !== null && nameDraft.trim() && nameDraft !== project.name) {
      saveProjectWith({ name: nameDraft.trim() })
    }
    setNameDraft(null)
  }

  const moveDeck = (deckId: string, direction: "up" | "down") => {
    const idx = memberDecks.findIndex((d) => d.id === deckId)
    const swapIdx = direction === "up" ? idx - 1 : idx + 1
    if (idx < 0 || swapIdx < 0 || swapIdx >= memberDecks.length) return
    const a = memberDecks[idx]
    const b = memberDecks[swapIdx]
    setDeckProject(a.location, a.id, project.id, b.projectOrder)
    setDeckProject(b.location, b.id, project.id, a.projectOrder)
  }

  const removeDeck = (deck: StoredDeck) => setDeckProject(deck.location, deck.id, null, deck.projectOrder)

  const handleAddExisting = () => {
    const deck = addableDecks.find((d) => d.id === addDeckId)
    if (!deck) return
    const nextOrder = Math.max(0, ...memberDecks.map((d) => d.projectOrder)) + 1
    setDeckProject(deck.location, deck.id, project.id, nextOrder)
    setAddDeckId("")
  }

  const handleNewDeckInProject = async () => {
    setCreatingDeck(true)
    const id = newDeckId(project.location)
    const nextOrder = Math.max(0, ...memberDecks.map((d) => d.projectOrder)) + 1
    await saveDeck(project.location, {
      id,
      ...defaultDeckConfig(`Deck ${memberDecks.length + 1}`),
      projectId: project.id,
      projectOrder: nextOrder,
    })
    router.push(`/decking/${id}`)
  }

  const handleDeleteProject = async () => {
    if (project.location.kind !== "private") return // Firestore refuses this on a public project anyway
    if (
      confirm(
        `Delete "${project.name}"? Member decks aren't deleted — they just go back to tracking their own stock. This can't be undone.`
      )
    ) {
      await deleteProject(project.location, project.id)
      router.push("/decking")
    }
  }

  return (
    <div className={styles.detailPage}>
      <div className={styles.headerRow}>
        <h1>
          <input
            className={styles.nameInput}
            value={nameDraft ?? project.name}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur()
              if (e.key === "Escape") setNameDraft(null)
            }}
            aria-label="Project name"
          />
          {project.location.kind === "public" && <span className={styles.publicBadge}>Public</span>}
        </h1>
        {project.location.kind === "private" && (
          <Button size="icon" variant="danger" onClick={handleDeleteProject} ariaLabel="Delete project">
            <TrashIcon />
          </Button>
        )}
      </div>

      <section>
        <h2>Shared board stock</h2>
        <p className={styles.hint}>
          Every deck below draws from this pool — earlier decks in the list claim first when more
          than one wants the same length. Reorder them to change who gets priority.
        </p>
        <BoardStockPanel
          stock={project.stock}
          onChange={(stock) => saveProjectWith({ stock })}
          reportTitle={`Board stock — ${project.name}`}
        />
      </section>

      <section>
        <h2>Decks in this project ({memberDecks.length})</h2>
        {memberDecks.length === 0 ? (
          <p className={styles.hint}>No decks yet — add an existing one or start a new one below.</p>
        ) : (
          <div className={styles.deckList}>
            {memberDecks.map((deck, i) => {
              const share = effectiveStockByDeck?.get(deck.id) ?? []
              const boards = share.reduce((sum, s) => sum + s.quantity, 0)
              const lineal = share.reduce((sum, s) => sum + s.length * s.quantity, 0)
              return (
                <div key={deck.id} className={styles.deckRow}>
                  <div className={styles.deckOrder}>
                    <button type="button" onClick={() => moveDeck(deck.id, "up")} disabled={i === 0} aria-label="Move up">
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => moveDeck(deck.id, "down")}
                      disabled={i === memberDecks.length - 1}
                      aria-label="Move down"
                    >
                      ▼
                    </button>
                  </div>
                  <Link href={`/decking/${deck.id}`} className={styles.deckName}>
                    {deck.name}
                  </Link>
                  <span className={styles.deckShare}>
                    {boards} board(s) · {formatLength(lineal)} current share
                  </span>
                  <button type="button" className={styles.removeBtn} onClick={() => removeDeck(deck)}>
                    Remove
                  </button>
                </div>
              )
            })}
          </div>
        )}

        <div className={styles.addRow}>
          {addableDecks.length > 0 && (
            <>
              <select value={addDeckId} onChange={(e) => setAddDeckId(e.target.value)} aria-label="Add an existing deck">
                <option value="">Add an existing deck…</option>
                {addableDecks.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                    {d.projectId ? " (currently in another project)" : ""}
                  </option>
                ))}
              </select>
              <Button size="small" variant="secondary" onClick={handleAddExisting} disabled={!addDeckId}>
                Add
              </Button>
            </>
          )}
          <Button size="small" variant="secondary" onClick={handleNewDeckInProject} disabled={creatingDeck}>
            {creatingDeck ? "Creating…" : "+ New deck in this project"}
          </Button>
        </div>
      </section>
    </div>
  )
}

export default ProjectDetailPage
