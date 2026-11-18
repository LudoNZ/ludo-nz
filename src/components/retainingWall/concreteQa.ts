import { holeConcreteM3, type ProfilePost } from "./postProfile"

/** m³ of concrete for one hole drilled `depthM` deep: the hole above its
 * gravel base pad, less the post's own section (which stops short of the
 * pad by any stand-off) — the same sum the plan
 * uses (see buildWallProfile), so a hole dug exactly to plan gives back
 * exactly the planned figure. */
export function concreteForDepthM3(post: ProfilePost, depthM: number, gravelBaseM: number, standoffM = 0): number {
  return holeConcreteM3(post.holeDiameterM, depthM, gravelBaseM, standoffM, post.sizeLabel)
}

/** The measurements with one pile's depth (mm) set. null, nothing usable,
 * or a depth back at the plan's means the hole matches the plan, so the
 * entry is dropped rather than kept. */
export function setMeasuredDepth(measuredMm: Record<string, number>, post: ProfilePost, mm: number | null): Record<string, number> {
  const next = { ...measuredMm }
  if (mm === null || !(mm > 0) || Math.round(mm) === Math.round(post.embedmentM * 1000)) delete next[post.index]
  else next[post.index] = Math.round(mm)
  return next
}
