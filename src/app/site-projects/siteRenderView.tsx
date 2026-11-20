"use client"

import { useCallback, useDeferredValue, useMemo, useState } from "react"
import DiagramExplorer from "@/components/diagramExplorer/diagramExplorer"
import { buildSiteScene } from "@/components/site/siteRender3d"
import type { SiteWall, StairPlacement } from "@/components/site/siteProject"
import renderStyles from "@/components/retainingWall/wallRenderView.module.scss"
import styles from "./siteView.module.scss"

/** Every wall and stair on the site in 3D, from a camera you can swing
 * all the way round and tilt (drag it, or use the sliders). */
const SiteRenderView: React.FC<{
  walls: SiteWall[]
  placements: { wall: SiteWall; placement: StairPlacement }[]
}> = ({ walls, placements }) => {
  const [azimuthDeg, setAzimuthDeg] = useState(-30)
  const [elevationDeg, setElevationDeg] = useState(30)
  const handleOrbit = useCallback((dx: number, dy: number) => {
    setAzimuthDeg((a) => {
      const next = a - dx * 0.4
      return next > 180 ? next - 360 : next < -180 ? next + 360 : next
    })
    setElevationDeg((e) => Math.min(75, Math.max(5, e + dy * 0.3)))
  }, [])
  // a wall being dragged on the plan catches up here when there's time
  const shownWalls = useDeferredValue(walls)
  const shownPlacements = useDeferredValue(placements)
  const scene = useMemo(() => buildSiteScene(shownWalls, shownPlacements, { azimuthDeg, elevationDeg }), [shownWalls, shownPlacements, azimuthDeg, elevationDeg])

  return (
    <section className={styles.card} id="site-3d">
      <h2>3D view — the whole site</h2>
      {scene ? (
        <div className={renderStyles.renderRoot}>
          <DiagramExplorer label="Site 3D view" onOrbit={handleOrbit}>
            <svg viewBox={`${scene.viewBox.x} ${scene.viewBox.y} ${scene.viewBox.w} ${scene.viewBox.h}`} className={renderStyles.svg} role="img" aria-label="3D view of every wall and stair on the site">
              <rect x={scene.viewBox.x} y={scene.viewBox.y} width={scene.viewBox.w} height={scene.viewBox.h} fill="#eef3f7" />
              {scene.polygons.map((p, i) => (
                <polygon key={i} points={p.points} fill={p.fill} stroke={p.stroke} strokeWidth={scene.strokeW} strokeLinejoin="round" />
              ))}
            </svg>
          </DiagramExplorer>
          <div className={renderStyles.controls}>
            <label className={renderStyles.slider}>
              <span>Turn</span>
              <input type="range" min={-180} max={180} step={1} value={Math.round(azimuthDeg)} onChange={(e) => setAzimuthDeg(Number(e.target.value))} />
            </label>
            <label className={renderStyles.slider}>
              <span>Tilt</span>
              <input type="range" min={5} max={75} step={1} value={Math.round(elevationDeg)} onChange={(e) => setElevationDeg(Number(e.target.value))} />
            </label>
          </div>
          <p className={styles.hint}>
            Each wall&apos;s levels are taken as on one datum, so set walls that meet to the same levels in their own
            calculators. Posts, boards and stairs only — each wall&apos;s own 3D view has the footings and every board.
          </p>
        </div>
      ) : (
        <p className={styles.hint}>Add a wall with a height to see it here.</p>
      )}
    </section>
  )
}

export default SiteRenderView
