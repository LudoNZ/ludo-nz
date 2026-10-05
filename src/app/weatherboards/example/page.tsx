"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/context/auth"
import Button from "@/components/button/button"
import { useStoredState } from "@/components/interviewPrep/useStoredState"
import EditorHeader from "@/components/weatherboards/editorHeader"
import WeatherboardEditor from "@/components/weatherboards/weatherboardEditor"
import { DEFAULT_PROJECT, EXAMPLE_STORAGE_KEY } from "@/components/weatherboards/data"
import { newProjectId, ProjectLocation, saveProject } from "@/components/weatherboards/projectStore"
import { WeatherboardProject } from "@/components/weatherboards/types"

/** The built-in example. Edits stay in this browser (localStorage); save
 * a copy to turn it into a real, shareable project. */
export default function ExampleProjectPage() {
  const auth = useAuth()
  const router = useRouter()
  const [project, setProject] = useStoredState<WeatherboardProject>(EXAMPLE_STORAGE_KEY, DEFAULT_PROJECT)
  const [saving, setSaving] = useState<ProjectLocation["kind"] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const saveCopy = async (kind: ProjectLocation["kind"]) => {
    const uid = auth?.currentUser?.uid
    if (kind === "private" && !uid) return
    const location: ProjectLocation = kind === "private" ? { kind, uid: uid as string } : { kind }
    setSaving(kind)
    setError(null)
    try {
      const id = newProjectId(location)
      await saveProject(location, id, "Example house (copy)", project)
      router.push(`/weatherboards/${id}`)
    } catch (err) {
      console.error("Saving example copy failed", err)
      setError("Couldn't save a copy — try again in a moment.")
      setSaving(null)
    }
  }

  return (
    <WeatherboardEditor
      project={project}
      setProject={setProject}
      header={
        <EditorHeader
          name="Example house"
          badge="Example"
          status={error ?? "Edits to the example stay in this browser."}
          actions={
            <>
              <Button size="small" onClick={() => saveCopy("public")} disabled={saving !== null}>
                {saving === "public" ? "Saving…" : "Save as public project"}
              </Button>
              {auth?.currentUser && (
                <Button size="small" variant="secondary" onClick={() => saveCopy("private")} disabled={saving !== null}>
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
