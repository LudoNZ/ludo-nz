"use client"

import { useEffect, useRef, useState } from "react"
import { houseFromData, HouseProject } from "./houseTypes"
import styles from "./house.module.scss"

/** a house as a file: everything in it, as JSON */
export const houseToJson = (h: HouseProject) => JSON.stringify({ kind: "ludo-house", version: 1, house: h }, null, 1)

/** a file's house (a bare house, or one wrapped as `houseToJson` writes it), made whole; null if it isn't one */
export function houseFromJson(text: string): HouseProject | null {
  try {
    const d = JSON.parse(text)
    const raw = d && typeof d === "object" && d.kind === "ludo-house" ? d.house : d
    if (!raw || typeof raw !== "object" || !raw.floor) return null
    return houseFromData(raw)
  } catch {
    return null
  }
}

/** Save the house to a file, or open one over it — to move a house between
 * browsers, keep a copy, or start from one drawn up elsewhere (by hand, or
 * by a script reading a set of plans). In development, the page also has
 * `window.ludoHouse.get()` / `.set(house)` for driving it from the console. */
const HouseFile: React.FC<{ house: HouseProject; setHouse: (update: (h: HouseProject) => HouseProject) => void }> = ({ house, setHouse }) => {
  const input = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const latest = useRef(house)
  latest.current = house

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return
    const w = window as unknown as { ludoHouse?: unknown }
    w.ludoHouse = {
      get: () => JSON.parse(JSON.stringify(latest.current)),
      set: (h: unknown) => {
        const next = houseFromJson(typeof h === "string" ? h : JSON.stringify(h))
        if (next) setHouse(() => next)
        return !!next
      },
    }
    return () => {
      delete w.ludoHouse
    }
  }, [setHouse])

  const save = () => {
    const blob = new Blob([houseToJson(house)], { type: "application/json" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `${house.name.replace(/[^\w\- ]+/g, "").trim() || "house"}.house.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  return (
    <div className={styles.toolbar}>
      <button type="button" className={styles.link} onClick={save}>
        Save to a file
      </button>
      <button type="button" className={styles.link} onClick={() => input.current?.click()}>
        Open a file over this house…
      </button>
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        hidden
        aria-label="A house file to open"
        onChange={async (e) => {
          const f = e.target.files?.[0]
          e.target.value = ""
          if (!f) return
          const next = houseFromJson(await f.text())
          if (!next) {
            setMsg(`${f.name} isn't a house file.`)
            return
          }
          setHouse(() => next)
          setMsg(`Opened ${f.name}.`)
        }}
      />
      {msg && <span className={styles.muted}>{msg}</span>}
    </div>
  )
}

export default HouseFile
