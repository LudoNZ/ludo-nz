"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useAuth } from "@/context/auth"
import Button from "@/components/button/button"
import {
  DeckLocation,
  newDeckId,
  newProjectId,
  saveDeck,
  saveProject,
  StoredDeck,
  StoredProject,
  subscribeToDecks,
} from "@/components/decking/data"
import { useProjectsList } from "@/components/decking/useProjectsList"
import { defaultDeckConfig, defaultDeckProject, formatLength } from "@/components/decking/types"
import styles from "./deckingPage.module.scss"

const DeckCard: React.FC<{ deck: StoredDeck }> = ({ deck }) => (
  <Link href={`/decking/${deck.id}`} className={styles.card}>
    <h3>{deck.name}</h3>
    <div className={styles.meta}>
      {formatLength(deck.width)} wide · {formatLength(deck.sideA)} / {formatLength(deck.sideB)}
    </div>
  </Link>
)

const ProjectCard: React.FC<{ project: StoredProject }> = ({ project }) => {
  const totalBoards = project.stock.reduce((sum, s) => sum + s.quantity, 0)
  return (
    <Link href={`/decking/projects/${project.id}`} className={styles.card}>
      <h3>{project.name}</h3>
      <div className={styles.meta}>{totalBoards} board(s) in the shared pool</div>
    </Link>
  )
}

/** No login required to use this page at all — public decks (no owner,
 * anyone can see/create/edit) are always shown; your own private decks
 * (visible only to you) sit above them once you're signed in. Which one
 * "Add deck" creates follows the same rule: private while logged in,
 * public otherwise — see handleAddDeck. */
const DeckingPage = () => {
  const auth = useAuth()
  const router = useRouter()
  const [privateDecks, setPrivateDecks] = useState<StoredDeck[]>([])
  const [privateLoaded, setPrivateLoaded] = useState(false)
  const [publicDecks, setPublicDecks] = useState<StoredDeck[]>([])
  const [publicLoaded, setPublicLoaded] = useState(false)
  const [creating, setCreating] = useState(false)
  const [creatingProject, setCreatingProject] = useState(false)
  const { privateProjects, publicProjects, loaded: projectsLoaded } = useProjectsList()

  // public decks are always visible, logged in or not
  useEffect(() => {
    const unsubscribe = subscribeToDecks({ kind: "public" }, (data) => {
      setPublicDecks(data)
      setPublicLoaded(true)
    })
    return () => unsubscribe()
  }, [])

  useEffect(() => {
    if (!auth || auth.authLoading) return // still resolving — wait rather than flash an empty list
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

  if (!auth || auth.authLoading) {
    return (
      <div className={styles.deckingPage}>
        <p className={styles.loading}>Loading…</p>
      </div>
    )
  }

  const handleAddDeck = async () => {
    setCreating(true)
    const location: DeckLocation = auth.currentUser ? { kind: "private", uid: auth.currentUser.uid } : { kind: "public" }
    const id = newDeckId(location)
    const count = privateDecks.length + publicDecks.length
    await saveDeck(location, { id, ...defaultDeckConfig(`Deck ${count + 1}`) })
    router.push(`/decking/${id}`)
  }

  const handleAddProject = async () => {
    setCreatingProject(true)
    const location: DeckLocation = auth.currentUser ? { kind: "private", uid: auth.currentUser.uid } : { kind: "public" }
    const id = newProjectId(location)
    const count = privateProjects.length + publicProjects.length
    await saveProject(location, { id, ...defaultDeckProject(`Project ${count + 1}`) })
    router.push(`/decking/projects/${id}`)
  }

  return (
    <div className={styles.deckingPage}>
      <h1>Decking</h1>
      <p className={styles.subtitle}>
        Lay out decking boards across a deck with a raked end, with joins landing on joists and
        staggered between rows.
      </p>

      {auth.currentUser ? (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Your decks</h2>
          {privateLoaded && (
            <div className={styles.grid}>
              {privateDecks.map((deck) => (
                <DeckCard key={deck.id} deck={deck} />
              ))}
            </div>
          )}
        </section>
      ) : (
        <p className={styles.loginHint}>
          <Link href="/login">Log in</Link> for your own private decks — or just add one below, public for now.
        </p>
      )}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Public decks</h2>
        <p className={styles.hint}>No login needed — visible and editable by anyone.</p>
        {publicLoaded && (
          <div className={styles.grid}>
            {publicDecks.map((deck) => (
              <DeckCard key={deck.id} deck={deck} />
            ))}
          </div>
        )}
      </section>

      <Button size="large" onClick={handleAddDeck} disabled={creating}>
        {creating ? "Creating…" : auth.currentUser ? "Add deck" : "Add a public deck"}
      </Button>

      {/* Projects: a shared board stockpile a handful of decks can draw
          from together instead of each tracking a separate stock list —
          see a deck's own "Project" field (in its edit form) to join one. */}
      {projectsLoaded && auth.currentUser && privateProjects.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Your projects</h2>
          <div className={styles.grid}>
            {privateProjects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        </section>
      )}

      {projectsLoaded && publicProjects.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Public projects</h2>
          <div className={styles.grid}>
            {publicProjects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        </section>
      )}

      <Button size="medium" variant="secondary" onClick={handleAddProject} disabled={creatingProject}>
        {creatingProject ? "Creating…" : "+ New project"}
      </Button>
    </div>
  )
}

export default DeckingPage
