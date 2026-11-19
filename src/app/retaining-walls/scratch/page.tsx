"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/context/auth"
import Button from "@/components/button/button"
import { useStoredState } from "@/components/interviewPrep/useStoredState"
import EditorHeader from "@/components/weatherboards/editorHeader"
import { DEFAULT_WALL, SCRATCH_STORAGE_KEY, wallFromData, WallProject } from "@/components/retainingWall/wallProject"
import { newProjectId, projectHref, ProjectLocation, saveProjectSoon } from "@/components/retainingWall/wallProjectStore"
import { activityProject, logWallActivity, logWallMilestone, scratchBrowserId } from "@/components/retainingWall/wallActivity"
import RetainingWallEditor from "../retainingWallEditor"

/** The scratch wall: a calculator with nothing to set up. Edits stay in
 * this browser (localStorage); save it as a project to keep it properly
 * and open it on other devices. */
export default function ScratchWallPage() {
  const auth = useAuth()
  const router = useRouter()
  const [stored, setStored, loaded] = useStoredState<WallProject>(SCRATCH_STORAGE_KEY, DEFAULT_WALL)
  const [saving, setSaving] = useState<ProjectLocation["kind"] | null>(null)
  const [error, setError] = useState<string | null>(null)

  // read defensively — whatever an older version left in storage
  const wall = useMemo(() => wallFromData(stored), [stored])

  const saveAsProject = async (kind: ProjectLocation["kind"]) => {
    const uid = auth?.currentUser?.uid
    if (kind === "private" && !uid) return
    const location: ProjectLocation = kind === "private" ? { kind, uid: uid as string } : { kind }
    setSaving(kind)
    setError(null)
    try {
      const id = newProjectId(location)
      await saveProjectSoon(location, id, "My retaining wall", wall)
      logWallMilestone(activityProject(location, id, "My retaining wall"), "create", "Saved the scratch wall as a project", auth?.currentUser ?? null)
      if (navigator.onLine) router.push(projectHref(id))
      else window.location.assign(projectHref(id))
    } catch (err) {
      console.error("Saving scratch wall as a project failed", err)
      setError("Couldn't save it as a project — try again in a moment.")
      setSaving(null)
    }
  }

  // the editor reads its starting wall once, so hold off mounting it
  // until whatever was stored in this browser has been read back
  if (!loaded) return <p style={{ padding: "3rem 1rem", textAlign: "center", opacity: 0.75 }}>Loading…</p>

  return (
    <RetainingWallEditor
      initial={wall}
      onChange={(next) => setStored(() => next)}
      onProposalPrinted={(label) =>
        logWallMilestone({ kind: "scratch", id: scratchBrowserId(), name: "Scratch wall", ownerUid: null }, "proposal", label, auth?.currentUser ?? null)
      }
      onActivity={(activity) =>
        logWallActivity({ kind: "scratch", id: scratchBrowserId(), name: "Scratch wall", ownerUid: null }, activity, auth?.currentUser ?? null)
      }
      header={
        <EditorHeader
          backHref="/retaining-walls"
          name="Scratch wall"
          badge="This browser"
          status={error ?? "Stays in this browser only — save it as a project to open it on other devices."}
          actions={
            <>
              <Button size="small" onClick={() => saveAsProject("public")} disabled={saving !== null}>
                {saving === "public" ? "Saving…" : "Save as public project"}
              </Button>
              {auth?.currentUser && (
                <Button size="small" variant="secondary" onClick={() => saveAsProject("private")} disabled={saving !== null}>
                  {saving === "private" ? "Saving…" : "Save as private project"}
                </Button>
              )}
            </>
          }
        />
      }
    />
  )
}
