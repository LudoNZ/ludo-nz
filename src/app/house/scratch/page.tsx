"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/context/auth"
import Button from "@/components/button/button"
import { useStoredState } from "@/components/interviewPrep/useStoredState"
import EditorHeader from "@/components/weatherboards/editorHeader"
import HouseCalculator from "@/components/house/houseCalculator"
import { DEFAULT_HOUSE, houseFromData, HouseProject } from "@/components/house/houseTypes"
import { houseProjectHref, newHouseProjectId, ProjectLocation, saveHouseProjectSoon } from "@/components/house/houseProjectStore"
import { HOUSE_SCRATCH_KEY } from "../houseProjectsPage"

/** The scratch house: the calculator with nothing to set up. Kept in this
 * browser; save it as a house to keep it properly and open it elsewhere. */
export default function ScratchHousePage() {
  const auth = useAuth()
  const router = useRouter()
  const [stored, setStored, loaded] = useStoredState<HouseProject>(HOUSE_SCRATCH_KEY, DEFAULT_HOUSE)
  const [saving, setSaving] = useState<ProjectLocation["kind"] | null>(null)
  const [error, setError] = useState<string | null>(null)
  // read defensively — whatever an older version left in storage
  const house = useMemo(() => houseFromData(stored), [stored])

  const saveAsProject = async (kind: ProjectLocation["kind"]) => {
    const uid = auth?.currentUser?.uid
    if (kind === "private" && !uid) return
    const location: ProjectLocation = kind === "private" ? { kind, uid: uid as string } : { kind }
    setSaving(kind)
    setError(null)
    try {
      const id = newHouseProjectId(location)
      await saveHouseProjectSoon(location, id, house.name, house)
      if (navigator.onLine) router.push(houseProjectHref(id))
      else window.location.assign(houseProjectHref(id))
    } catch (err) {
      console.error("Saving the scratch house failed", err)
      setError("Couldn't save it as a house — try again in a moment.")
      setSaving(null)
    }
  }

  if (!loaded) return <p style={{ padding: "3rem 1rem", textAlign: "center", opacity: 0.75 }}>Loading…</p>

  return (
    <HouseCalculator
      house={house}
      setHouse={(update) => setStored((prev) => update(houseFromData(prev)))}
      header={
        <EditorHeader
          backHref="/house"
          backLabel="← All houses"
          name={house.name}
          onRename={(name) => setStored((prev) => ({ ...houseFromData(prev), name: name.trim() || "My house" }))}
          badge="This browser"
          status={error ?? "Stays in this browser only — save it to open it on other devices."}
          actions={
            <>
              <Button size="small" onClick={() => saveAsProject("public")} disabled={saving !== null}>
                {saving === "public" ? "Saving…" : "Save as public house"}
              </Button>
              {auth?.currentUser && (
                <Button size="small" variant="secondary" onClick={() => saveAsProject("private")} disabled={saving !== null}>
                  {saving === "private" ? "Saving…" : "Save as private house"}
                </Button>
              )}
            </>
          }
        />
      }
    />
  )
}
