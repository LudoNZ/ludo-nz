"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useAuth } from "@/context/auth"
import { StairInput } from "@/components/stairs/stairs"
import { loadSiteProject, ProjectLocation, saveSiteProject, siteProjectHref } from "@/components/site/siteProjectStore"
import StairsPage from "./stairsPage"
import StairProjectsPage from "./stairProjectsPage"
import styles from "./stairsPage.module.scss"

const SAVE_DELAY_MS = 1000

type State =
  | { kind: "loading" }
  | { kind: "missing"; text: string }
  | { kind: "ready"; location: ProjectLocation; projectName: string; stairName: string; onWall: boolean; input: StairInput }

/** The stairs calculator on one stair of a site project
 * (/stairs?site=…&stair=…): the same stair as in the project, and every
 * change saved back to it. Where it sits — and so its rise — is set in
 * the project, against the wall. */
const LinkedStairs: React.FC<{ projectId: string; stairId: string }> = ({ projectId, stairId }) => {
  const auth = useAuth()
  const [state, setState] = useState<State>({ kind: "loading" })
  const [status, setStatus] = useState<"saved" | "unsaved" | "saving" | "failed">("saved")
  const pending = useRef<StairInput | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const locationRef = useRef<ProjectLocation | null>(null)

  useEffect(() => {
    if (!auth || auth.authLoading) return
    let cancelled = false
    const uid = auth.currentUser?.uid
    ;(async () => {
      const candidates: ProjectLocation[] = [{ kind: "public" }, ...(uid ? [{ kind: "private" as const, uid }] : [])]
      for (const loc of candidates) {
        try {
          const found = await loadSiteProject(loc, projectId)
          if (cancelled) return
          if (!found) continue
          const n = found.site.stairs.findIndex((s) => s.id === stairId)
          if (n < 0) {
            setState({ kind: "missing", text: "That stair isn't in the site project any more." })
            return
          }
          const st = found.site.stairs[n]
          locationRef.current = loc
          setState({ kind: "ready", location: loc, projectName: found.name, stairName: st.label || `Stairs ${n + 1}`, onWall: st.top === "onWall", input: st.input })
          return
        } catch (err) {
          if (cancelled) return
          if (navigator.onLine) console.error("Loading site project failed", err)
        }
      }
      if (!cancelled) setState({ kind: "missing", text: "That site project doesn't exist, or it's someone else's private project." })
    })()
    return () => {
      cancelled = true
    }
  }, [auth, auth?.authLoading, auth?.currentUser, projectId, stairId])

  // saves just this stair's inputs into the project as it is now (loaded
  // fresh, so the rest of the project isn't put back as it was)
  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const input = pending.current
    const loc = locationRef.current
    if (!input || !loc) return
    pending.current = null
    setStatus("saving")
    try {
      const found = await loadSiteProject(loc, projectId)
      const stair = found?.site.stairs.find((s) => s.id === stairId)
      if (!found || !stair) throw new Error("stair gone")
      const site = { ...found.site, stairs: found.site.stairs.map((s) => (s.id === stairId ? { ...s, input: { ...input, totalRise: s.input.totalRise } } : s)) }
      await saveSiteProject(loc, projectId, found.name, site)
      setStatus(pending.current ? "unsaved" : "saved")
    } catch (err) {
      console.error("Saving the stair failed", err)
      pending.current = pending.current ?? input
      setStatus("failed")
    }
  }, [projectId, stairId])

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (pending.current) e.preventDefault()
    }
    window.addEventListener("beforeunload", warn)
    return () => {
      window.removeEventListener("beforeunload", warn)
      void flush()
    }
  }, [flush])

  if (state.kind !== "ready")
    return (
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "3rem 1rem", textAlign: "center" }}>
        <p style={{ opacity: 0.75, marginBottom: "1rem" }}>{state.kind === "loading" ? "Loading…" : state.text}</p>
        {state.kind !== "loading" && <Link href="/stairs">All stairs →</Link>}
      </div>
    )

  const change = (input: StairInput) => {
    setState({ ...state, input })
    pending.current = input
    setStatus("unsaved")
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS)
  }

  return (
    <StairsPage
      value={state.input}
      onChange={change}
      riseNote="Set by the site project: from where the stair finishes at the bottom to the top of the wall"
      extraTopTread={state.onWall}
      header={
        <div className={styles.linked}>
          <h1>Stairs Calculator — {state.stairName}</h1>
          <p className={styles.linkedBanner}>
            Part of the site project{" "}
            <Link href={siteProjectHref(projectId)}>
              <strong>{state.projectName}</strong>
            </Link>
            . Changes here save to that stair in the project. Where it sits on the wall, and so its rise, is set in the
            project.
            <span className={styles.linkedStatus}>
              {status === "failed" ? "Couldn't save — it'll try again on the next change" : status === "unsaved" ? "Unsaved changes…" : status === "saving" ? "Saving…" : "All changes saved"}
              {state.location.kind === "public" && " · a public project: anyone with the link can edit it"}
            </span>
          </p>
        </div>
      }
    />
  )
}

const StairsRoute = () => {
  const params = useSearchParams()
  const site = params.get("site")
  const stair = params.get("stair")
  if (site && stair) return <LinkedStairs key={`${site}/${stair}`} projectId={site} stairId={stair} />
  return <StairProjectsPage />
}

export default StairsRoute
