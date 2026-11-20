"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/context/auth"
import Button from "@/components/button/button"
import { useStoredState } from "@/components/interviewPrep/useStoredState"
import EditorHeader from "@/components/weatherboards/editorHeader"
import { DEFAULT_INPUT, StairInput } from "@/components/stairs/stairs"
import { stairInputFromData } from "@/components/stairs/stairData"
import { newStairProjectId, ProjectLocation, saveStairProjectSoon, stairProjectHref } from "@/components/stairs/stairProjectStore"
import StairsPage from "../stairsPage"
import { STAIR_SCRATCH_KEY } from "../stairProjectsPage"

/** The scratch stair: the calculator with nothing to set up. Kept in this
 * browser; save it as a stair to keep it properly and open it elsewhere. */
export default function ScratchStairPage() {
  const auth = useAuth()
  const router = useRouter()
  const [stored, setStored, loaded] = useStoredState<StairInput>(STAIR_SCRATCH_KEY, DEFAULT_INPUT)
  const [saving, setSaving] = useState<ProjectLocation["kind"] | null>(null)
  const [error, setError] = useState<string | null>(null)
  // read defensively — whatever an older version left in storage
  const input = useMemo(() => stairInputFromData(stored), [stored])

  const saveAsProject = async (kind: ProjectLocation["kind"]) => {
    const uid = auth?.currentUser?.uid
    if (kind === "private" && !uid) return
    const location: ProjectLocation = kind === "private" ? { kind, uid: uid as string } : { kind }
    setSaving(kind)
    setError(null)
    try {
      const id = newStairProjectId(location)
      await saveStairProjectSoon(location, id, "My stair", input)
      if (navigator.onLine) router.push(stairProjectHref(id))
      else window.location.assign(stairProjectHref(id))
    } catch (err) {
      console.error("Saving the scratch stair failed", err)
      setError("Couldn't save it as a stair — try again in a moment.")
      setSaving(null)
    }
  }

  if (!loaded) return <p style={{ padding: "3rem 1rem", textAlign: "center", opacity: 0.75 }}>Loading…</p>

  return (
    <StairsPage
      value={input}
      onChange={(next) => setStored(() => next)}
      header={
        <EditorHeader
          backHref="/stairs"
          backLabel="← All stairs"
          name="Scratch stair"
          badge="This browser"
          status={error ?? "Stays in this browser only — save it to open it on other devices."}
          actions={
            <>
              <Button size="small" onClick={() => saveAsProject("public")} disabled={saving !== null}>
                {saving === "public" ? "Saving…" : "Save as public stair"}
              </Button>
              {auth?.currentUser && (
                <Button size="small" variant="secondary" onClick={() => saveAsProject("private")} disabled={saving !== null}>
                  {saving === "private" ? "Saving…" : "Save as private stair"}
                </Button>
              )}
            </>
          }
        />
      }
    />
  )
}
