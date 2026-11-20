"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/context/auth"
import Button from "@/components/button/button"
import { useStoredState } from "@/components/interviewPrep/useStoredState"
import EditorHeader from "@/components/weatherboards/editorHeader"
import { DEFAULT_FLOOR, FloorInput } from "@/components/floorFraming/floorData"
import { floorInputFromData } from "@/components/floorFraming/floorData"
import { newFloorProjectId, ProjectLocation, saveFloorProjectSoon, floorProjectHref } from "@/components/floorFraming/floorProjectStore"
import FloorFramingPage from "../floorFramingPage"
import { FLOOR_SCRATCH_KEY } from "../floorProjectsPage"

/** The scratch floor: the calculator with nothing to set up. Kept in this
 * browser; save it as a floor to keep it properly and open it elsewhere. */
export default function ScratchFloorPage() {
  const auth = useAuth()
  const router = useRouter()
  const [stored, setStored, loaded] = useStoredState<FloorInput>(FLOOR_SCRATCH_KEY, DEFAULT_FLOOR)
  const [saving, setSaving] = useState<ProjectLocation["kind"] | null>(null)
  const [error, setError] = useState<string | null>(null)
  // read defensively — whatever an older version left in storage
  const input = useMemo(() => floorInputFromData(stored), [stored])

  const saveAsProject = async (kind: ProjectLocation["kind"]) => {
    const uid = auth?.currentUser?.uid
    if (kind === "private" && !uid) return
    const location: ProjectLocation = kind === "private" ? { kind, uid: uid as string } : { kind }
    setSaving(kind)
    setError(null)
    try {
      const id = newFloorProjectId(location)
      await saveFloorProjectSoon(location, id, "My floor", input)
      if (navigator.onLine) router.push(floorProjectHref(id))
      else window.location.assign(floorProjectHref(id))
    } catch (err) {
      console.error("Saving the scratch floor failed", err)
      setError("Couldn't save it as a floor — try again in a moment.")
      setSaving(null)
    }
  }

  if (!loaded) return <p style={{ padding: "3rem 1rem", textAlign: "center", opacity: 0.75 }}>Loading…</p>

  return (
    <FloorFramingPage
      value={input}
      onChange={(next) => setStored(() => next)}
      header={
        <EditorHeader
          backHref="/floor-framing"
          backLabel="← All floors"
          name="Scratch floor"
          badge="This browser"
          status={error ?? "Stays in this browser only — save it to open it on other devices."}
          actions={
            <>
              <Button size="small" onClick={() => saveAsProject("public")} disabled={saving !== null}>
                {saving === "public" ? "Saving…" : "Save as public floor"}
              </Button>
              {auth?.currentUser && (
                <Button size="small" variant="secondary" onClick={() => saveAsProject("private")} disabled={saving !== null}>
                  {saving === "private" ? "Saving…" : "Save as private floor"}
                </Button>
              )}
            </>
          }
        />
      }
    />
  )
}
