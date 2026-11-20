"use client"

import { RefObject, useCallback, useMemo, useRef, useState } from "react"
import type { ExploreCamera } from "@/components/diagramExplorer/diagramExplorer"
import { CameraFrame, CameraState, FIT_CAMERA, panCamera, pivotOn, zoomCameraAt } from "./perspective"

/** A 3D view's flying camera: what DiagramExplorer's zoom and pan do to
 * it (`explore`, its `camera` prop), and where it is (`camera`, for the
 * scene). Screen points are mapped onto the drawing through the <svg>'s
 * own transform, so the point under the cursor or fingers stays put.
 * Gestures land at most once a frame — each one rebuilds the scene.
 * `frameRef` holds the drawn scene's camera frame (its directions and
 * what it's looking at), to move it from. */
export function useFlyCamera(
  svgRef: RefObject<SVGSVGElement | null>,
  frameRef: RefObject<CameraFrame | null>,
): { camera: CameraState; explore: ExploreCamera; beforeTurn: () => void } {
  const [camera, setCamera] = useState<CameraState>(FIT_CAMERA)
  const latest = useRef(camera)
  const frame = useRef(0)

  const update = useCallback(
    (change: (c: CameraState, f: CameraFrame) => CameraState) => {
      const drawn = frameRef.current
      if (!drawn) return
      // the drawn scene's directions; what it's looking at as of the
      // latest gesture (which may not be drawn yet)
      latest.current = change(latest.current, { ...drawn, look: latest.current.look ?? drawn.look })
      if (frame.current) return
      frame.current = requestAnimationFrame(() => {
        frame.current = 0
        setCamera(latest.current)
      })
    },
    [frameRef],
  )

  const zoom = useCallback(
    (k: number, clientX: number, clientY: number) => {
      const ctm = svgRef.current?.getScreenCTM()
      if (!ctm) return
      const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse())
      update((c, f) => zoomCameraAt(c, f, k, [p.x, p.y]))
    },
    [svgRef, update],
  )
  const pan = useCallback(
    (dx: number, dy: number) => {
      const ctm = svgRef.current?.getScreenCTM()
      if (!ctm || !ctm.a) return
      update((c, f) => panCamera(c, f, dx / ctm.a, dy / ctm.d))
    },
    [svgRef, update],
  )
  const reset = useCallback(() => {
    if (frame.current) cancelAnimationFrame(frame.current)
    frame.current = 0
    latest.current = FIT_CAMERA
    setCamera(FIT_CAMERA)
  }, [])

  /** call as a turn starts: turning then swings round the surface in the
   * middle of the screen (no change to what's on screen) */
  const lastTurn = useRef(0)
  const beforeTurn = useCallback(() => {
    // once a turn: the moves of one drag come well inside this of each other
    const now = performance.now()
    const fresh = now - lastTurn.current > 250
    lastTurn.current = now
    const drawn = frameRef.current
    if (!fresh || !drawn) return
    // only between gestures: mid-zoom the drawn frame's behind
    if (frame.current) return
    const next = pivotOn(latest.current, drawn)
    if (next === latest.current) return
    latest.current = next
    setCamera(next)
  }, [frameRef])

  const moved = camera.zoom !== 1 || camera.look !== null
  const explore = useMemo(() => ({ zoom, pan, reset, moved }), [zoom, pan, reset, moved])
  return { camera, explore, beforeTurn }
}
