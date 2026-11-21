/** A shaded 3D model of a floor frame: piles, bearers (or walls), ledger,
 * rims, joists, blocking and nogs, and what's on top — sheets, or the
 * deck's boards — each its own solid, drawn the same way as the stairs
 * (see stairs/stairRender3d.ts's sceneFromSolids).
 *
 * World axes, in mm: x east (= plan x), y north (= −plan y), z up (0 =
 * the ground; between walls, the top of the wall plates). Pure. */

import type { CameraState } from "../render3d/perspective"
import { sceneFromSolids, Solid, StairRenderScene, worldBox } from "../stairs/stairRender3d"
import { FrameLayout, FrameMember } from "./frame"

export type FrameRenderMember = "piles" | "walls" | "bearers" | "ledger" | "joists" | "blocking" | "covering"

export const FRAME_MEMBER_LABELS: Record<FrameRenderMember, string> = {
  piles: "Piles",
  walls: "Walls",
  bearers: "Bearers",
  ledger: "Ledger",
  joists: "Joists",
  blocking: "Blocking / nogs",
  covering: "Flooring",
}

/** a deck board on top, in plan mm: along `start`..`end` on its run
 * axis, across `rowStart`..`rowEnd` */
export interface RenderBoard {
  start: number
  end: number
  rowStart: number
  rowEnd: number
}

export interface FrameRenderInput {
  frame: FrameLayout
  /** the deck's boards, and which plan axis they run along */
  boards?: { list: RenderBoard[]; runsAlong: "x" | "y" }
}

const COLORS = {
  pile: "#8f7a50",
  bearer: "#b39760",
  joist: "#cbb37a",
  rim: "#c2a86e",
  ledger: "#9aa3ad",
  blocking: "#bfa56c",
  wall: "#c9c9c4",
  sheet: "#e3cf9c",
  board: "#a8693f",
}

/** Which parts this frame has, in the order they're listed. */
export function frameRenderMembers({ frame, boards }: FrameRenderInput): FrameRenderMember[] {
  const has = (k: FrameMember["kind"]) => frame.members.some((m) => m.kind === k)
  const out: FrameRenderMember[] = []
  if (frame.piles.length) out.push("piles")
  if (has("wall")) out.push("walls")
  if (has("bearer")) out.push("bearers")
  if (has("ledger")) out.push("ledger")
  out.push("joists")
  if (has("blocking") || has("nog")) out.push("blocking")
  if (frame.sheets.length || boards?.list.length) out.push("covering")
  return out
}

/** `base`: where its zero is in the world (a house's floor framing, set under
 * its floor) — without it, the ground (and walls between which it spans
 * stand on the lawn) */
export function frameSolids({ frame, boards }: FrameRenderInput, hidden: ReadonlySet<FrameRenderMember>, base?: number): Solid[] {
  const solids: Solid[] = []
  const put = (k: FrameRenderMember, s: Solid | null) => s && !hidden.has(k) && solids.push(s)
  const { toPlan } = frame
  // between walls, the walls stand on the lawn
  const lift = base ?? (frame.input.support === "walls" ? 600 : 0)
  /** a plan rectangle (frame u/v ranges) as a world box */
  const uvBox = (u0: number, u1: number, v0: number, v1: number, z0: number, z1: number, color: string) => {
    const a = toPlan(u0, v0)
    const b = toPlan(u1, v1)
    return worldBox(Math.min(a.x, b.x), Math.max(a.x, b.x), -Math.max(a.y, b.y), -Math.min(a.y, b.y), z0 + lift, z1 + lift, color)
  }
  const memberBox = (m: FrameMember, color: string) => {
    const h = m.thick / 2
    return m.runs === "u" ? uvBox(m.from, m.to, m.at - h, m.at + h, m.zTop - m.depth, m.zTop, color) : uvBox(m.at - h, m.at + h, m.from, m.to, m.zTop - m.depth, m.zTop, color)
  }
  const KIND: Record<FrameMember["kind"], [FrameRenderMember, string]> = {
    wall: ["walls", COLORS.wall],
    bearer: ["bearers", COLORS.bearer],
    ledger: ["ledger", COLORS.ledger],
    rim: ["joists", COLORS.rim],
    joist: ["joists", COLORS.joist],
    blocking: ["blocking", COLORS.blocking],
    nog: ["blocking", COLORS.blocking],
  }
  for (const m of frame.members) {
    const [k, color] = KIND[m.kind]
    put(k, memberBox(m, color))
  }
  const half = 62.5
  for (const p of frame.piles) {
    const c = toPlan(p.u, p.v)
    // from a little way into the ground up to the bearer's underside
    put("piles", worldBox(c.x - half, c.x + half, -c.y - half, -c.y + half, -150 + (base ?? 0), p.aboveGround + (base ?? 0), COLORS.pile))
  }
  const top = frame.floorTop
  const under = frame.joistTop
  for (const s of frame.sheets) put("covering", uvBox(s.u0 + 1, s.u1 - 1, s.v0 + 1, s.v1 - 1, under, top, COLORS.sheet))
  if (boards)
    for (const b of boards.list) {
      const [x0, x1, y0, y1] = boards.runsAlong === "x" ? [b.start, b.end, b.rowStart, b.rowEnd] : [b.rowStart, b.rowEnd, b.start, b.end]
      put("covering", worldBox(x0, x1, -y1, -y0, under + lift, top + lift, COLORS.board))
    }
  return solids
}

export interface FrameRenderOptions {
  azimuthDeg: number
  elevationDeg: number
  hidden: ReadonlySet<FrameRenderMember>
  camera?: CameraState
}

/** square-on is looking at the frame from the south (the plan's bottom
 * edge), across the joists' ends or along them */
export function buildFrameScene(input: FrameRenderInput, options: FrameRenderOptions): StairRenderScene | null {
  const solids = frameSolids(input, options.hidden)
  return sceneFromSolids(solids, ((-90 + options.azimuthDeg) * Math.PI) / 180, (options.elevationDeg * Math.PI) / 180, options.camera)
}
