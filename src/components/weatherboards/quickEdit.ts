/** Quick-form walls: a wall created from the "+ Add wall" form and still
 * edited through it. Pure, no React.
 *
 * The wall itself is the source of truth — the form shown for it is
 * read back off the wall (`formFromWall`), so a dimension edited on the
 * elevation or moved by a link shows up in the form. Each form change
 * rebuilds the wall in place (`applyQuickForm`), keeping its id, its
 * break point ids (so links to its ridge survive), its bottom edge and
 * corners, and any windows that have been pinned by hand. */

import { applyLinks, measureKey } from "./measures"
import { buildQuickWall, layoutOpenings, QuickWallForm, shapeDefaults } from "./quickWall"
import { Wall, WeatherboardProject } from "./types"

export const formFromWall = (wall: Wall): QuickWallForm => {
  const meta = wall.quick ?? { shape: "rectangle", windowWidthMm: 1200, windowHeightMm: 1200, headMm: 2100 }
  const b = wall.top.breaks[0]
  const base: QuickWallForm = {
    shape: meta.shape,
    name: wall.name,
    widthMm: wall.lengthMm,
    heightMm: wall.top.left,
    ridgeMm: 0,
    highMm: 0,
    rakeStartMm: 0,
    windows: (wall.openings ?? []).length,
    windowWidthMm: meta.windowWidthMm,
    windowHeightMm: meta.windowHeightMm,
    headMm: meta.headMm,
    links: {},
    shapeLocked: !!meta.shapeLocked,
  }
  const defaults = shapeDefaults(base, meta.shape)
  return {
    ...defaults,
    ridgeMm: meta.shape === "gable" && b ? b.y : defaults.ridgeMm,
    highMm: meta.shape === "skillion" || meta.shape === "partRake" ? wall.top.right : defaults.highMm,
    rakeStartMm: meta.shape === "partRake" && b ? b.x : defaults.rakeStartMm,
    links: {
      width: wall.links?.width,
      height: wall.links?.heightL,
      ridge: meta.shape === "gable" && b ? wall.links?.[`break:${b.id}`] : undefined,
    },
  }
}

/** Builds (or rebuilds) wall `id` from the form and puts it in the
 * elevation — appended if new — then re-applies links project-wide.
 *
 * Links: width and the left height follow the form's links; a
 * rectangle's or gable's right height, and where a part-way rake starts,
 * share the left height; a gable ridge follows the form's ridge link. A
 * skillion's high end keeps whatever link it already had. */
export const applyQuickForm = (
  project: WeatherboardProject,
  elevationId: string,
  form: QuickWallForm,
  id: string,
): WeatherboardProject => {
  const existing = project.elevations.find((e) => e.id === elevationId)?.walls.find((w) => w.id === id)
  const built = buildQuickWall(form, id)

  // keep the old break point's id so anything linked to it stays linked
  const oldBreak = existing?.top.breaks[0]
  const top = oldBreak && built.top.breaks[0] ? { ...built.top, breaks: [{ ...built.top.breaks[0], id: oldBreak.id }] } : built.top
  const brk = top.breaks[0]

  const height = form.links.height ?? measureKey(id, "heightL")
  const links: Record<string, string> = {}
  if (form.links.width) links.width = form.links.width
  if (form.links.height) links.heightL = form.links.height
  if (form.shape === "rectangle" || form.shape === "gable") links.heightR = height
  else if (existing?.links?.heightR && existing.links.heightR !== measureKey(id, "heightL")) links.heightR = existing.links.heightR
  if (brk && form.shape === "partRake") links[`break:${brk.id}`] = height
  if (brk && form.shape === "gable" && form.links.ridge) links[`break:${brk.id}`] = form.links.ridge

  let wall: Wall = {
    ...built,
    top,
    bottom: existing?.bottom ?? built.bottom,
    leftEnd: existing?.leftEnd ?? built.leftEnd,
    rightEnd: existing?.rightEnd ?? built.rightEnd,
    coverMm: existing?.coverMm ?? null,
    corners: existing?.corners,
    quick: {
      shape: form.shape,
      windowWidthMm: form.windowWidthMm,
      windowHeightMm: form.windowHeightMm,
      headMm: form.headMm,
      shapeLocked: form.shapeLocked,
    },
  }
  if (!wall.corners?.length) delete wall.corners
  if (Object.keys(links).length) wall.links = links

  // hand-placed windows stay exactly where they are; the rest are laid
  // out fresh at the form's size around them
  const pinned = (existing?.openings ?? []).filter((o) => !o.auto)
  wall = {
    ...wall,
    openings: layoutOpenings({ ...wall, openings: pinned }, form.windows, {
      width: form.windowWidthMm,
      height: form.windowHeightMm,
      head: form.headMm,
    }),
  }

  return applyLinks({
    ...project,
    elevations: project.elevations.map((e) =>
      e.id !== elevationId
        ? e
        : { ...e, walls: existing ? e.walls.map((w) => (w.id === id ? wall : w)) : [...e.walls, wall] },
    ),
  })
}

/** "More options": the wall leaves the quick form for the full editor. */
export const detachQuick = (wall: Wall): Wall => {
  const { quick: _q, ...rest } = wall
  void _q
  return rest
}
