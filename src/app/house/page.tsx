"use client"

import { useMemo } from "react"
import { useStoredState } from "@/components/interviewPrep/useStoredState"
import EditorHeader from "@/components/weatherboards/editorHeader"
import HouseCalculator from "@/components/house/houseCalculator"
import { DEFAULT_HOUSE, houseFromData, HouseProject } from "@/components/house/houseTypes"

const HOUSE_SCRATCH_KEY = "house.scratch.v1"

/** The House calculator, kept in this browser for now (saved houses come
 * next). Its cladding goes to a real, saved weatherboard project. */
export default function HousePage() {
  const [stored, setStored, loaded] = useStoredState<HouseProject>(HOUSE_SCRATCH_KEY, DEFAULT_HOUSE)
  // read defensively — whatever an older version left in storage
  const house = useMemo(() => houseFromData(stored), [stored])

  if (!loaded) return <p style={{ padding: "3rem 1rem", textAlign: "center", opacity: 0.75 }}>Loading…</p>

  return (
    <HouseCalculator
      house={house}
      setHouse={(update) => setStored((prev) => update(houseFromData(prev)))}
      header={
        <EditorHeader
          backHref="/calculators"
          backLabel="← All calculators"
          name={house.name}
          onRename={(name) => setStored((prev) => ({ ...houseFromData(prev), name: name.trim() || "My house" }))}
          badge="This browser"
          status="Kept in this browser for now — saving houses to open on other devices is coming."
        />
      }
    />
  )
}
