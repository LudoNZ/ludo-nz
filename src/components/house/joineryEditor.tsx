"use client"

import { useEffect, useState } from "react"
import { DEFAULT_JOINERY_TYPES, fitIn, freeGap, headsUsed, houseHeadOf, JoineryType, joineryTypesOf } from "./joinery"
import JoineryModal, { JoineryDraft } from "./joineryModal"
import { FloorPlan, HOUSE_JOINERY, HouseJoinery, HouseProject, newHouseId } from "./houseTypes"

/** A wall something's being put on, or changed on: an outside wall (its
 * cladding wall, x from its start as the weatherboards keep it) or an
 * inside wall line (x from its start). `at`: along it where it was placed;
 * `drawn`: a rectangle dragged out instead (z off the floor). */
export type JoineryTarget = {
  wallName: string
  length: number
  /** the units already on it (not the one being changed) */
  taken: { id: string; x0: number; x1: number }[]
  at: number
  /** how high up it was placed, off the floor (where known): low down, a door; up the wall, a window */
  z?: number
  drawn?: { x0: number; x1: number; z0: number; z1: number }
  /** a unit already there, to change */
  editId?: string
} & ({ where: "outside"; wallId: string; floor: number } | { where: "inside"; storey: 0 | 1; lineId: string })

/** Placing windows and doors, wherever they're placed from (a wall's
 * elevation, the plan, the 3D view): `placing` on and off (W, not while
 * typing; Escape: off), `open` a wall to put one on (or change one), and
 * the pop-up to show. */
export function useJoineryEditor(
  house: HouseProject,
  setHouse: (u: (h: HouseProject) => HouseProject) => void,
  /** the storey's floor plan, for inside doors */
  setPlanOf: (storey: number) => (u: (f: FloorPlan) => FloorPlan) => void,
  /** each outside wall's floor, up from the ground floor */
  floorOf: (wallId: string) => number,
) {
  const [placing, setPlacing] = useState(false)
  const [open, setOpen] = useState<{ target: JoineryTarget; draft: JoineryDraft } | null>(null)

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (open || e.ctrlKey || e.metaKey || e.altKey || (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)))) return
      if (e.key === "w" || e.key === "W") setPlacing((v) => !v)
      else if (e.key === "Escape") setPlacing(false)
    }
    window.addEventListener("keydown", key)
    return () => window.removeEventListener("keydown", key)
  }, [open])

  const types = joineryTypesOf(house)
  const houseHead = houseHeadOf(house)
  const nextCode = (kind: "window" | "door") => {
    const p = kind === "door" ? "D" : "W"
    const used = new Set((house.joinery ?? []).map((j) => j.code))
    for (let k = 1; ; k++) {
      const c = `${p}${String(k).padStart(2, "0")}`
      if (!used.has(c)) return c
    }
  }

  /** the pop-up for a wall: a new unit like the last one laid (or the usual first type), or the one being changed */
  const openOn = (target: JoineryTarget) => {
    const where = target.where
    if (target.editId) {
      const id = target.editId
      if (target.where === "outside") {
        const j = (house.joinery ?? []).find((x) => x.id === id)
        if (!j) return
        const head = j.sill - target.floor + j.height
        const kind = j.sill - target.floor < 100 ? "door" : "window"
        setOpen({ target, draft: { where, id, typeId: j.typeId ?? null, kind, code: j.code ?? "", name: j.name ?? "", x: j.x, width: j.width, height: j.height, head } })
      } else {
        const plan = target.storey === 1 ? house.upper?.plan : house.floor
        const d = plan?.doors.find((x) => x.id === id)
        if (!d) return
        setOpen({ target, draft: { where, id, typeId: d.typeId ?? null, kind: "door", code: "", name: d.name ?? "", x: d.atMm - d.widthMm / 2, width: d.widthMm, height: d.heightMm, head: d.heightMm } })
      }
      return
    }
    const mine = types.filter((t) => t.where === where)
    const last = house.lastJoinery?.[where]
    const gap = freeGap(target.taken, target.length, target.at)
    // drawn: its own size, as the nearest kind (from the floor, a door)
    const dr = target.drawn
    const drawnKind = dr ? (where === "inside" || dr.z0 < 100 ? "door" : "window") : where === "inside" ? "door" : !last && target.z !== undefined ? (target.z < 700 ? "door" : "window") : null
    const pick =
      (last && (!drawnKind || last.kind === drawnKind) && { id: last.typeId, kind: last.kind, width: last.width, height: last.height, head: last.head }) ||
      ((t) => t && { id: t.id, kind: t.kind, width: t.width, height: t.height, head: t.kind === "door" ? t.height : (t.headMm ?? houseHead) })(
        mine.find((t) => (!drawnKind || t.kind === drawnKind) && fitIn(gap, t.width, target.at) !== null) ?? mine.find((t) => !drawnKind || t.kind === drawnKind) ?? DEFAULT_JOINERY_TYPES[0],
      )!
    const draft: JoineryDraft = dr
      ? {
          where,
          typeId: pick.id,
          kind: drawnKind!,
          code: "",
          name: "",
          x: dr.x0,
          width: dr.x1 - dr.x0,
          height: drawnKind === "door" ? dr.z1 : dr.z1 - dr.z0,
          head: dr.z1,
        }
      : { where, typeId: pick.id, kind: pick.kind, code: "", name: "", x: fitIn(gap, pick.width, target.at) ?? Math.round((target.at - pick.width / 2) / 10) * 10, width: pick.width, height: pick.height, head: pick.head }
    // (drawn to a type's size, near enough: that type)
    if (dr) {
      const t = mine.find((x) => x.kind === draft.kind && Math.abs(x.width - draft.width) <= 30 && Math.abs(x.height - draft.height) <= 30)
      draft.typeId = t?.id ?? (pick.kind === draft.kind && pick.width === draft.width && pick.height === draft.height ? pick.id : null)
    }
    if (where === "outside") draft.code = nextCode(draft.kind)
    setOpen({ target, draft })
  }

  const save = (d: JoineryDraft) => {
    if (!open) return
    const t = open.target
    if (t.where === "outside") {
      const sill = d.kind === "door" ? t.floor : t.floor + d.head - d.height
      const j: HouseJoinery = {
        id: d.id ?? `${HOUSE_JOINERY}${newHouseId()}`,
        wallId: t.wallId,
        ...(d.typeId ? { typeId: d.typeId } : {}),
        x: d.x,
        sill,
        width: d.width,
        height: d.height,
        ...(d.code.trim() ? { code: d.code.trim() } : {}),
        ...(d.name.trim() ? { name: d.name.trim() } : {}),
      }
      setHouse((h) => ({ ...h, joinery: d.id ? (h.joinery ?? []).map((x) => (x.id === d.id ? j : x)) : [...(h.joinery ?? []), j] }))
    } else {
      const door = { id: d.id ?? newHouseId(), wallId: t.lineId, ...(d.typeId ? { typeId: d.typeId } : {}), ...(d.name.trim() ? { name: d.name.trim() } : {}), atMm: d.x + d.width / 2, widthMm: d.width, heightMm: d.height }
      setPlanOf(t.storey)((f) => ({ ...f, doors: d.id ? f.doors.map((x) => (x.id === d.id ? door : x)) : [...f.doors, door] }))
    }
    // the next one starts the same
    setHouse((h) => ({ ...h, lastJoinery: { ...(h.lastJoinery ?? {}), [d.where]: { typeId: d.typeId, kind: d.kind, width: d.width, height: d.height, head: d.head } } }))
    setOpen(null)
  }
  const remove = () => {
    if (!open?.draft.id) return
    const id = open.draft.id
    const t = open.target
    if (t.where === "outside") setHouse((h) => ({ ...h, joinery: (h.joinery ?? []).filter((x) => x.id !== id) }))
    else setPlanOf(t.storey)((f) => ({ ...f, doors: f.doors.filter((x) => x.id !== id) }))
    setOpen(null)
  }
  const saveType = (ty: JoineryType) =>
    setHouse((h) => {
      const list = joineryTypesOf(h)
      return { ...h, joineryTypes: list.some((x) => x.id === ty.id) ? list.map((x) => (x.id === ty.id ? ty : x)) : [...list, ty] }
    })

  const modal = open && (
    <JoineryModal
      key={`${open.target.where}${open.draft.id ?? open.draft.x}`}
      draft={open.draft}
      wallName={open.target.wallName}
      length={open.target.length}
      gap={freeGap(open.target.taken, open.target.length, open.draft.x + open.draft.width / 2)}
      types={types.filter((t) => t.where === open.target.where)}
      houseHead={houseHead}
      heads={headsUsed(house, floorOf)}
      last={house.lastJoinery?.[open.target.where]}
      nextCode={nextCode}
      onSave={save}
      onSaveType={saveType}
      onDelete={open.draft.id ? remove : undefined}
      onCancel={() => setOpen(null)}
    />
  )
  return { placing, setPlacing, open: openOn, modal, houseHead, heads: headsUsed(house, floorOf) }
}
