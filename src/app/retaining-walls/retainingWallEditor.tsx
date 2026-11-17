"use client"

import { ReactNode, useEffect, useMemo, useRef, useState } from "react"
import Button from "@/components/button/button"
import SpecCard from "@/components/structures/specCard"
import LaborSummary from "@/components/structures/laborSummary"
import { formatM, formatM3 } from "@/components/structures/format"
import {
  ElevationIcon,
  MaterialsIcon,
  OrderIcon,
  PlanViewIcon,
  PostHoleIcon,
  SettingsIcon,
  SlidersIcon,
  TopIcon,
} from "@/components/icons/icons"
import WallProfileDiagram from "@/components/retainingWall/wallProfileDiagram"
import BoardOrderCard from "@/components/retainingWall/boardOrderCard"
import WallPlanView from "@/components/retainingWall/wallPlanView"
import NumField from "@/components/weatherboards/numField"
import { BoardHighlight, boardRowsByWall, buildWallProfile, ControlPoints, DepthPoints, RunSpacing, segmentBayCounts, WallOrderRows } from "@/components/retainingWall/postProfile"
import { overridesForWall, PartialBoardOrder, PlacedBoardOrder, WallProject } from "@/components/retainingWall/wallProject"
import {
  PlanPoint,
  RetainedSide,
  segmentLabel,
  segmentLengths,
  setSegmentLength,
  totalLength,
} from "@/components/retainingWall/wallPlan"
import { boardStockLengths, CalcSettings, findReferenceRow, POST_SIZE_OPTIONS } from "@/components/retainingWall/calcSettings"
import { ENGINEER_HEIGHT_LIMIT_M, SOIL_LABELS, SoilType } from "@/components/retainingWall/retainingWallCalc"
import { SavedCalcSettings, subscribeToCalcSettingsList } from "@/components/retainingWall/retainingWallData"
import BoardEndsModal from "./boardEndsModal"
import StepEditor from "./stepEditor"
import SectionRail, { RailSection } from "./sectionRail"
import ReferenceTableModal from "./referenceTableModal"
import SettingsPanel from "./settingsPanel"
import styles from "./retainingWallEditor.module.scss"

const SOIL_TYPES = Object.keys(SOIL_LABELS) as SoilType[]
/** common hire/contractor auger diameters, offered as suggestions — any
 * size can still be typed */
const AUGER_SIZES_MM = [200, 250, 300, 350, 400, 450, 500, 600]

/** The retaining wall calculator itself, with no idea where its wall is
 * kept: it starts from `initial` (read once, on mount — the caller mounts
 * it only once the wall has loaded), owns the wall from then on, and
 * reports every change up through `onChange`. The pages around it decide
 * what a change means — autosave to a project, or stash in this browser. */
const RetainingWallEditor: React.FC<{
  initial: WallProject
  onChange: (wall: WallProject) => void
  header: ReactNode
}> = ({ initial, onChange, header }) => {
  // the wall's shape seen from above: an open run of straight walls (A,
  // B, C…) joined at corners. Total wall length is just this unfolded.
  const [planPoints, setPlanPoints] = useState<PlanPoint[]>(initial.planPoints)
  // which side of the wall (walking it from A onward) the ground is held
  // back on — decides which face the elevations are looking at
  const [retainedSide, setRetainedSide] = useState<RetainedSide>(initial.retainedSide)
  // which run's elevation is showing, or the whole wall unfolded flat
  const [elevationView, setElevationView] = useState<number | "all">("all")
  const [retainedHeight, setRetainedHeight] = useState(String(initial.retainedHeightM))
  const [soil, setSoil] = useState<SoilType>(initial.soil)
  const [rlDatum, setRlDatum] = useState(String(initial.rlDatumM))
  // mm, the auger the holes are being drilled with; blank = size each
  // hole off its own post (the calc settings' multiplier) instead
  const [augerDiameter, setAugerDiameter] = useState(initial.augerDiameterMm ? String(initial.augerDiameterMm) : "")
  // one post size / one hole depth for the whole wall, replacing what the
  // reference table would work out post by post; blank = calculated
  const [postSizeOverride, setPostSizeOverride] = useState(initial.postSizeOverride ?? "")
  const [holeDepth, setHoleDepth] = useState(initial.holeDepthOverrideMm ? String(initial.holeDepthOverrideMm) : "")
  // per wall: a hand-set post count or spacing; null = the table's
  const [runSpacing, setRunSpacing] = useState<(RunSpacing | null)[]>(initial.runSpacing)
  // the board order as actually placed: counts pinned per stock length
  const [boardOrderFixed, setBoardOrderFixed] = useState<Record<string, number>>(initial.boardOrderFixed)
  // an order for part of the job — chosen walls and rows — see BoardOrderCard
  const [boardOrderPartial, setBoardOrderPartial] = useState<PartialBoardOrder>(initial.boardOrderPartial)
  // boards picked out on the elevation from the order card (not saved)
  const [boardHighlight, setBoardHighlight] = useState<BoardHighlight[]>([])
  // walls whose top steps at the posts, by wall; and the bay heights set by hand
  const [steppedWalls, setSteppedWalls] = useState<boolean[]>(initial.steppedWalls)
  const [bayCourses, setBayCourses] = useState<Record<string, number>>(initial.bayCourses)
  const [boardOrdersPlaced, setBoardOrdersPlaced] = useState<PlacedBoardOrder[]>(initial.boardOrdersPlaced)
  const [showReferenceTable, setShowReferenceTable] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  const [calcSettings, setCalcSettings] = useState<CalcSettings>(initial.calcSettings)
  const [calcSettingsName, setCalcSettingsName] = useState(initial.calcSettingsName)
  const [presets, setPresets] = useState<SavedCalcSettings[]>([])

  // keyed by post index — a post with an entry here is "set by hand"; every
  // other post rakes (linearly interpolates) between whichever of these
  // bracket it. When the post layout changes they follow their posts
  // rather than being wiped — see the alignedCounts effect below.
  const [controlPoints, setControlPoints] = useState<ControlPoints>(initial.controlPoints)
  // hole depths set by hand, keyed by post index the same way — so they
  // follow their posts along with the hand-set levels
  const [depthPoints, setDepthPoints] = useState<DepthPoints>(initial.depthPoints)
  // whole-wall option, not per-post — an extra flat board laid over the
  // top board/post tops for a finished look and to protect end grain
  const [topCapEnabled, setTopCapEnabled] = useState(initial.topCapEnabled)
  // whole-wall option: the top board goes on as a full board following
  // the rake, and the level boards under it are cut down to suit
  const [rakedTopBoard, setRakedTopBoard] = useState(initial.rakedTopBoard)
  // whole-wall option: end boards measured to the outside face of the end
  // post, or to its centre — chosen in its own modal (see BoardEndsModal)
  const [boardsToPostOutside, setBoardsToPostOutside] = useState(initial.boardsToPostOutside)
  const [showBoardEnds, setShowBoardEnds] = useState(false)
  // once the job is set up: every input goes read only until unlocked,
  // so nothing about the wall gets changed by accident
  const [locked, setLocked] = useState(initial.locked)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const groundInputRef = useRef<HTMLInputElement>(null)
  const topInputRef = useRef<HTMLInputElement>(null)
  const topAfterInputRef = useRef<HTMLInputElement>(null)
  const depthInputRef = useRef<HTMLInputElement>(null)
  const depthModeRef = useRef<HTMLSelectElement>(null)

  useEffect(() => {
    const unsubscribe = subscribeToCalcSettingsList(setPresets, () => {})
    return () => unsubscribe()
  }, [])


  const wallLengthM = totalLength(planPoints)
  const segmentLengthsM = segmentLengths(planPoints)
  const retainedHeightM = parseFloat(retainedHeight)
  const rlDatumM = parseFloat(rlDatum) || 0
  const augerDiameterParsed = parseFloat(augerDiameter)
  const augerDiameterMm = augerDiameterParsed > 0 ? augerDiameterParsed : null
  const holeDepthParsed = parseFloat(holeDepth)
  const holeDepthOverrideMm = holeDepthParsed > 0 ? holeDepthParsed : null
  const overrides = overridesForWall({ augerDiameterMm, postSizeOverride: postSizeOverride || null, holeDepthOverrideMm, runSpacing, rakedTopBoard, depthPoints, boardsToPostOutside, steppedWalls, bayCourses })

  // report the wall upward whenever anything saveable actually changes.
  // The first pass only records what the wall looked like on mount
  // (nothing has changed yet — reporting would mark a freshly opened
  // project as edited); it's also skipped while the height box is
  // mid-edit and unparseable, so a half-typed number never gets saved.
  const lastReported = useRef<string | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  useEffect(() => {
    if (!(retainedHeightM > 0)) return
    const wall: WallProject = {
      planPoints,
      retainedSide,
      retainedHeightM,
      soil,
      rlDatumM,
      augerDiameterMm,
      postSizeOverride: postSizeOverride || null,
      holeDepthOverrideMm,
      runSpacing,
      boardOrderFixed,
      boardOrderPartial,
      boardOrdersPlaced,
      steppedWalls,
      bayCourses,
      controlPoints,
      depthPoints,
      topCapEnabled,
      rakedTopBoard,
      boardsToPostOutside,
      locked,
      calcSettings,
      calcSettingsName,
    }
    const json = JSON.stringify(wall)
    const previous = lastReported.current
    lastReported.current = json
    if (previous === null || previous === json) return
    onChangeRef.current(wall)
  }, [planPoints, retainedSide, retainedHeightM, soil, rlDatumM, augerDiameterMm, postSizeOverride, holeDepthOverrideMm, runSpacing, boardOrderFixed, boardOrderPartial, boardOrdersPlaced, steppedWalls, bayCourses, controlPoints, depthPoints, topCapEnabled, rakedTopBoard, boardsToPostOutside, locked, calcSettings, calcSettingsName])

  // Hand-set levels and depths are keyed by post index, so whenever the
  // post layout changes — a wall reshaped, a post added, different soil,
  // height or calculation settings — they have to follow their posts.
  // `alignedCounts` is the layout (bays per wall) the keys currently
  // match. When the layout moves on, everything on walls whose post count
  // is unchanged from the start of the wall, or from the end, is kept
  // (shifted to its post's new number); only posts inside the walls that
  // actually changed are let go, since those posts have all moved.
  const [heightEditing, setHeightEditing] = useState(false)
  const bayCountsKey = retainedHeightM > 0 ? segmentBayCounts(segmentLengthsM, retainedHeightM, soil, calcSettings, runSpacing).join(",") : null
  const alignedCounts = useRef<string | null>(bayCountsKey)
  useEffect(() => {
    if (bayCountsKey === null || heightEditing) return
    if (alignedCounts.current === null || alignedCounts.current === bayCountsKey) {
      alignedCounts.current = bayCountsKey
      return
    }
    const before = alignedCounts.current.split(",").map(Number)
    const after = bayCountsKey.split(",").map(Number)
    alignedCounts.current = bayCountsKey
    let prefix = 0
    while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix++
    let suffix = 0
    while (
      suffix < before.length - prefix &&
      suffix < after.length - prefix &&
      before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
    )
      suffix++
    const sum = (counts: number[]) => counts.reduce((t, n) => t + n, 0)
    const keepUpTo = sum(before.slice(0, prefix)) // last post of the unchanged walls at the start
    const keepFrom = sum(before) - sum(before.slice(before.length - suffix)) // first post of the unchanged walls at the end
    const shiftBy = sum(after) - sum(before)
    const follow = <T,>(points: Record<number, T>): Record<number, T> => {
      const next: Record<number, T> = {}
      for (const [key, value] of Object.entries(points)) {
        const i = Number(key)
        if (i <= keepUpTo) next[i] = value as T
        else if (i >= keepFrom) next[i + shiftBy] = value as T
      }
      return next
    }
    setControlPoints(follow)
    setDepthPoints(follow)
    // bay heights are keyed by the bay's left post, so the last bay of
    // the unchanged walls at the start is the one *before* keepUpTo
    setBayCourses((counts) => {
      const next: Record<string, number> = {}
      for (const [key, value] of Object.entries(counts)) {
        const i = Number(key)
        if (i < keepUpTo) next[key] = value
        else if (i >= keepFrom) next[String(i + shiftBy)] = value
      }
      return next
    })
    setSelectedIndex(null)
  }, [bayCountsKey, heightEditing])

  const profile = !isNaN(retainedHeightM)
    ? buildWallProfile(segmentLengthsM, retainedHeightM, soil, controlPoints, topCapEnabled, rlDatumM, calcSettings, overrides)
    : null

  const boardStocks = useMemo(() => boardStockLengths(calcSettings), [calcSettings])
  // every facing and top-board piece, by wall and by row, for the order.
  // Keyed on the pieces themselves, so the order card only re-plans when
  // the cut list really changes.
  const orderWallsJson = profile ? JSON.stringify(boardRowsByWall(profile)) : "[]"
  const orderWalls = useMemo(() => JSON.parse(orderWallsJson) as WallOrderRows[], [orderWallsJson])

  // a run that no longer exists (corner removed, design swapped) falls
  // back to the whole-wall view rather than pointing at nothing
  const shownSegment = elevationView !== "all" && profile && elevationView < profile.segments.length ? elevationView : null
  // looking at the wall's face from the low side: with the ground held
  // back on the left of travel, A's start is on the viewer's left;
  // retained on the right, the viewer is round the other side and the
  // whole thing reads right-to-left
  const mirrored = retainedSide === "right"
  // the materials cards follow the elevation: the whole wall under "All",
  // or just the one run being looked at
  const totals = profile ? (shownSegment !== null ? profile.segmentTotals[shownSegment] : profile) : null
  const forWall = shownSegment !== null ? ` — Wall ${segmentLabel(shownSegment)}` : ""
  const postList = (indices: number[]) => indices.map((i) => `#${i + 1}`).join(", ")
  const mmRange = (minM: number, maxM: number) => {
    const lo = Math.round(minM * 1000)
    const hi = Math.round(maxM * 1000)
    return lo === hi ? `${lo}mm` : `${lo}–${hi}mm`
  }

  const handlePlanChange = (next: PlanPoint[]) => {
    // keep each wall's own settings (hand-set spacing, stepping) with that
    // wall when a corner is added (the wall it splits goes back to the
    // table / unstepped) or removed (the two walls it joined merge into
    // one on the defaults)
    if (next.length !== planPoints.length) {
      const changed = next.findIndex((p, i) => !planPoints[i] || p.xM !== planPoints[i].xM || p.yM !== planPoints[i].yM)
      const at = changed === -1 ? next.length : changed
      const seg = Math.max(0, at - 1)
      const remap = <T,>(list: T[], blank: T): T[] =>
        (next.length > planPoints.length
          ? [...list.slice(0, seg), blank, blank, ...list.slice(seg + 1)]
          : at === 0
            ? list.slice(1)
            : [...list.slice(0, seg), blank, ...list.slice(seg + 2)]
        ).slice(0, next.length - 1)
      if (runSpacing.some(Boolean)) setRunSpacing(remap(runSpacing, null))
      if (steppedWalls.some(Boolean)) setSteppedWalls(remap(steppedWalls, false))
    }
    setPlanPoints(next)
  }

  /** Sets (or, with null, clears) one wall's hand-set spacing. Hand-set
   * levels follow their posts — see the alignedCounts effect. */
  const applyRunSpacing = (segmentIndex: number, spacing: RunSpacing | null) => {
    if (!profile) return
    setRunSpacing(Array.from({ length: profile.segments.length }, (_, i) => (i === segmentIndex ? spacing : (runSpacing[i] ?? null))))
  }

  // stepping: per wall, or every wall at once from the whole-wall view
  const stepTarget = profile ? (shownSegment !== null ? shownSegment : profile.segments.length === 1 ? 0 : null) : null
  const setSteppedFor = (segmentIndex: number | null, on: boolean) => {
    if (!profile) return
    setSteppedWalls(Array.from({ length: profile.segments.length }, (_, i) => (segmentIndex === null || i === segmentIndex ? on : Boolean(steppedWalls[i]))))
  }
  const steppedCount = profile ? profile.segments.filter((seg) => seg.stepped).length : 0
  const setStepCounts = (segmentIndex: number, counts: number[]) => {
    if (!profile) return
    const seg = profile.segments[segmentIndex]
    setBayCourses((current) => {
      const next = { ...current }
      counts.forEach((c, j) => {
        next[String(seg.startPostIndex + j)] = c
      })
      return next
    })
  }
  const resetStepCounts = (segmentIndex: number) => {
    if (!profile) return
    const seg = profile.segments[segmentIndex]
    setBayCourses((current) => {
      const next = { ...current }
      for (let i = seg.startPostIndex; i < seg.endPostIndex; i++) delete next[String(i)]
      return next
    })
  }

  const selectedPost = profile && selectedIndex !== null ? profile.posts[selectedIndex] : null
  // for a corner post: the wall that ends on it (the one after it is the next letter)
  const cornerBefore = selectedPost?.isCorner && profile ? profile.segments.find((seg) => seg.endPostIndex === selectedPost.index)?.index ?? null : null
  const allBlocked = profile ? profile.posts.length === profile.engineerPostIndices.length : false
  const someBlocked = profile ? profile.engineerPostIndices.length > 0 : false

  const referenceRow = profile
    ? findReferenceRow(calcSettings, Math.min(Math.max(...profile.posts.map((p) => p.retainedHeightM)), ENGINEER_HEIGHT_LIMIT_M), soil)
    : null

  const handleSaveControlPoint = () => {
    if (selectedIndex === null || !groundInputRef.current || !topInputRef.current) return
    const groundAbs = parseFloat(groundInputRef.current.value)
    const topAbs = parseFloat(topInputRef.current.value)
    if (isNaN(groundAbs) || isNaN(topAbs)) return
    const post = profile?.posts[selectedIndex]
    // a corner can have a different top for the wall on each side of it
    const afterAbs = post?.isCorner && topAfterInputRef.current ? parseFloat(topAfterInputRef.current.value) : NaN
    const topAfterM = isNaN(afterAbs) ? null : afterAbs - rlDatumM
    const split = topAfterM !== null && Math.abs(topAfterM - (topAbs - rlDatumM)) > 0.0005
    // only a level that was actually changed makes this a hand-set post
    const levelsChanged =
      !post ||
      Math.abs(groundAbs - rlDatumM - post.groundLevelM) > 0.0005 ||
      Math.abs(topAbs - rlDatumM - post.topBeforeM) > 0.0005 ||
      (topAfterM !== null && Math.abs(topAfterM - post.topAfterM) > 0.0005)
    if (levelsChanged || post?.isControlPoint)
      setControlPoints((cp) => ({
        ...cp,
        [selectedIndex]: {
          groundLevelM: groundAbs - rlDatumM,
          topLevelM: topAbs - rlDatumM,
          ...(split ? { topAfterLevelM: topAfterM as number } : {}),
        },
      }))

    const mode = depthModeRef.current?.value
    const depthMm = parseFloat(depthInputRef.current?.value ?? "")
    setDepthPoints((dp) => {
      const next = { ...dp }
      if ((mode === "lone" || mode === "rake") && depthMm > 0) next[selectedIndex] = { depthM: depthMm / 1000, mode }
      else delete next[selectedIndex]
      return next
    })
  }

  const handleClearControlPoint = () => {
    if (selectedIndex === null) return
    setControlPoints((cp) => {
      const next = { ...cp }
      delete next[selectedIndex]
      return next
    })
  }

  const handleApplySettings = (settings: CalcSettings, name: string) => {
    if (locked) return
    setCalcSettings(settings)
    setCalcSettingsName(name)
  }

  // where the side panel can jump to — it leaves out any that aren't on
  // the page right now (no results until the wall has a height, say)
  const railSections: RailSection[] = [
    { id: "rw-top", label: "Top", icon: <TopIcon /> },
    { id: "rw-inputs", label: "Wall & ground", icon: <SlidersIcon /> },
    { id: "rw-posts-holes", label: "Posts & holes", icon: <PostHoleIcon /> },
    { id: "rw-plan", label: "Plan", icon: <PlanViewIcon /> },
    { id: "rw-elevation", label: "Elevation", icon: <ElevationIcon /> },
    { id: "rw-materials", label: "Materials", icon: <MaterialsIcon /> },
    { id: "rw-order", label: "Board order", icon: <OrderIcon /> },
  ]

  return (
    <div className={styles.retainingWallsPage} id="rw-top">
      <SectionRail sections={railSections} />
      {header}
      <div className={styles.headerRow}>
        <div>
          <p className={styles.intro}>
            A rough DIY materials and labour estimate for a straightforward timber post-and-board
            retaining wall. Enter your wall length, retained height, and ground conditions to start,
            shape the wall in the plan — add corners and drag them into place — then tap any post in
            an elevation to set its own ground level and top level by hand; posts in between rake
            (slope evenly) between whichever posts you&apos;ve set.
          </p>
        </div>
        <div className={styles.headerActions}>
          <Button size="small" variant={locked ? "primary" : "secondary"} onClick={() => setLocked((l) => !l)}>
            {locked ? "🔒 Locked — unlock" : "🔓 Lock"}
          </Button>
          <Button size="icon" variant="secondary" onClick={() => setShowSettings(true)} ariaLabel="Calculation settings" disabled={locked}>
            <SettingsIcon />
          </Button>
        </div>
      </div>

      {locked && (
        <p className={styles.lockedNote}>
          🔒 This wall is locked: its shape and settings are read only, so nothing gets changed by accident. You can still
          look around — switch elevations, tap posts, open the reference table — and the board order at the bottom
          stays editable. Unlock it to make changes.
        </p>
      )}

      <p className={styles.settingsHint}>
        Using &quot;{calcSettingsName}&quot; calculation settings.{" "}
        <button type="button" className={styles.inlineLink} onClick={() => setShowSettings(true)} disabled={locked}>
          Change
        </button>
      </p>

      <fieldset disabled={locked} className={styles.lockable} id="rw-inputs">
      <form className={styles.form} onSubmit={(e) => e.preventDefault()}>
        <div className={styles.field}>
          <label htmlFor="wallLength">{planPoints.length > 2 ? "Total wall length (m)" : "Wall length (m)"}</label>
          {planPoints.length > 2 ? (
            // with corners, each wall's own length is set in the plan
            <input id="wallLength" type="text" readOnly value={wallLengthM.toFixed(2)} title="Set each wall's length in the plan below" />
          ) : (
            <NumField
              id="wallLength"
              min={0.1}
              step={0.1}
              value={Number(wallLengthM.toFixed(3))}
              onChange={(v) => handlePlanChange(setSegmentLength(planPoints, 0, v))}
            />
          )}
        </div>
        <div className={styles.field}>
          <label htmlFor="retainedHeight">Retained height (m)</label>
          <input
            id="retainedHeight"
            type="number"
            min={0.1}
            step={0.1}
            inputMode="decimal"
            value={retainedHeight}
            onChange={(e) => {
              setRetainedHeight(e.target.value)
            }}
            // half-typed heights ("1" on the way to "1.25") can land in a
            // different band of the table and change the post layout for
            // a moment — hold off re-aligning hand-set posts until done
            onFocus={() => setHeightEditing(true)}
            onBlur={() => setHeightEditing(false)}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="soil">Soil type</label>
          <select
            id="soil"
            value={soil}
            onChange={(e) => {
              setSoil(e.target.value as SoilType)
            }}
          >
            {SOIL_TYPES.map((s) => (
              <option key={s} value={s}>
                {SOIL_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor="boardHeight">Board height (mm)</label>
          {/* part of this project's calculation settings, surfaced here
              because it's changed job to job; it doesn't move any posts,
              so hand-set levels are left alone */}
          <NumField
            id="boardHeight"
            min={50}
            step={10}
            value={Math.round(calcSettings.boardCourseHeightM * 1000)}
            onChange={(v) => {
              if (v >= 50 && v <= 500) setCalcSettings((settings) => ({ ...settings, boardCourseHeightM: v / 1000 }))
            }}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="rlDatum">RL datum (0 = relative)</label>
          <input
            id="rlDatum"
            type="number"
            step={0.001}
            inputMode="decimal"
            value={rlDatum}
            onChange={(e) => setRlDatum(e.target.value)}
          />
        </div>
      </form>
      </fieldset>

      <h3 className={styles.overridesHeading} id="rw-posts-holes">
        Posts and holes
      </h3>
      <p className={styles.overridesHint}>
        Leave a box on Auto to have it worked out post by post from the reference table and each post&apos;s own
        height, or set it to use the same value for every post on the wall.
      </p>
      <fieldset disabled={locked} className={styles.lockable}>
      <form className={styles.form} onSubmit={(e) => e.preventDefault()}>
        <div className={styles.field}>
          <label htmlFor="postSize">Post size</label>
          <select id="postSize" value={postSizeOverride} onChange={(e) => setPostSizeOverride(e.target.value)}>
            <option value="">Auto — from the table</option>
            {POST_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                All {size}
              </option>
            ))}
            {postSizeOverride && !POST_SIZE_OPTIONS.includes(postSizeOverride) && (
              <option value={postSizeOverride}>All {postSizeOverride}</option>
            )}
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor="holeDepth">Hole depth (mm)</label>
          <input
            id="holeDepth"
            type="number"
            min={100}
            step={50}
            inputMode="numeric"
            placeholder="Auto — by post height"
            value={holeDepth}
            onChange={(e) => setHoleDepth(e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="augerDiameter">Auger size (mm)</label>
          <input
            id="augerDiameter"
            type="number"
            min={50}
            step={25}
            inputMode="numeric"
            list="augerSizes"
            placeholder={`Auto — ${calcSettings.holeDiameterMultiplier} × post`}
            value={augerDiameter}
            onChange={(e) => setAugerDiameter(e.target.value)}
          />
          <datalist id="augerSizes">
            {AUGER_SIZES_MM.map((mm) => (
              <option key={mm} value={mm} />
            ))}
          </datalist>
        </div>
      </form>
      </fieldset>

      <button type="button" className={styles.referenceLink} onClick={() => setShowReferenceTable(true)}>
        View the reference table this calculator uses →
      </button>

      <ReferenceTableModal
        isOpen={showReferenceTable}
        onClose={() => setShowReferenceTable(false)}
        referenceTable={calcSettings.referenceTable}
        activeRow={referenceRow}
      />
      <BoardEndsModal
        isOpen={showBoardEnds}
        onClose={() => setShowBoardEnds(false)}
        toOutside={boardsToPostOutside}
        onChange={(toOutside) => {
          if (!locked) setBoardsToPostOutside(toOutside)
        }}
        endPostWidthM={profile?.posts[0]?.widthM ?? null}
        wallCount={profile?.segments.length ?? 1}
      />
      <SettingsPanel
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        activeSettings={calcSettings}
        activeName={calcSettingsName}
        presets={presets}
        onApply={handleApplySettings}
      />

      <div className={styles.diagramCard} id="rw-plan">
        <div className={styles.diagramCardHeader}>
          <h3>Plan</h3>
        </div>
        <WallPlanView
          points={planPoints}
          retainedSide={retainedSide}
          profile={profile}
          selectedSegment={shownSegment}
          selectedPostIndex={selectedIndex}
          onChange={handlePlanChange}
          onRetainedSideChange={setRetainedSide}
          onSelectSegment={setElevationView}
          onSetBayCount={(segmentIndex, bayCount) => applyRunSpacing(segmentIndex, { bayCount })}
          readOnly={locked}
        />
      </div>

      {!profile ? (
        <p className={styles.hint}>Enter a wall length and retained height to see a materials estimate.</p>
      ) : (
        <>
          {someBlocked && (
            <div className={styles.engineerWarning}>
              <h2>⚠ {allBlocked ? "This needs a chartered engineer" : "Part of this wall needs a chartered engineer"}</h2>
              <p>
                {allBlocked
                  ? `Every post here retains more than ${ENGINEER_HEIGHT_LIMIT_M.toFixed(1)}m of ground.`
                  : `Post${profile.engineerPostIndices.length > 1 ? "s" : ""} ${profile.engineerPostIndices.map((i) => `#${i + 1}`).join(", ")} ${profile.engineerPostIndices.length > 1 ? "retain" : "retains"} more than ${ENGINEER_HEIGHT_LIMIT_M.toFixed(1)}m.`}{" "}
                Under the New Zealand Building Code, a wall retaining more than {ENGINEER_HEIGHT_LIMIT_M.toFixed(1)}m of
                ground needs specific design by a chartered professional engineer, and almost always a building consent.
                {allBlocked ? " This tool won't generate a materials spec for that height." : " Those posts (shown in red) are excluded from the materials list below — everything else is unaffected."}
              </p>
            </div>
          )}

          <div className={styles.diagramCard} id="rw-elevation">
            <div className={styles.diagramCardHeader}>
              <h3>
                {shownSegment !== null
                  ? `Elevation — Wall ${segmentLabel(shownSegment)}`
                  : profile.segments.length > 1
                    ? "Elevation — whole wall, unfolded"
                    : "Elevation"}
              </h3>
              <fieldset disabled={locked} className={`${styles.elevationOptions} ${styles.lockable}`}>
                <button type="button" className={styles.optionButton} onClick={() => setShowBoardEnds(true)}>
                  Board ends: {boardsToPostOutside ? "outside of post" : "post centre"}
                </button>
                {stepTarget === null ? (
                  <button
                    type="button"
                    className={styles.optionButton}
                    title="Step the top at the posts, on every wall at once — or pick a wall to do it for that one"
                    onClick={() => setSteppedFor(null, steppedCount < profile.segments.length)}
                  >
                    Step the top: {steppedCount === 0 ? "off" : steppedCount === profile.segments.length ? "all walls" : `${steppedCount} of ${profile.segments.length} walls`}
                  </button>
                ) : (
                  <label className={styles.topCapToggle} title="Step the boards at the posts instead of cutting them to the rake">
                    <input type="checkbox" checked={profile.segments[stepTarget].stepped} onChange={(e) => setSteppedFor(stepTarget, e.target.checked)} />
                    <span>Step the top{profile.segments.length > 1 ? ` (wall ${segmentLabel(stepTarget)})` : ""}</span>
                  </label>
                )}
                <label className={styles.topCapToggle}>
                  <input type="checkbox" checked={rakedTopBoard} onChange={(e) => setRakedTopBoard(e.target.checked)} />
                  <span>Rake the top board</span>
                </label>
                <label className={styles.topCapToggle}>
                  <input type="checkbox" checked={topCapEnabled} onChange={(e) => setTopCapEnabled(e.target.checked)} />
                  <span>Add top cap</span>
                </label>
              </fieldset>
            </div>
            {profile.segments.length > 1 && (
              <div className={styles.elevationTabs} role="tablist" aria-label="Elevation to view">
                <button
                  type="button"
                  role="tab"
                  aria-selected={shownSegment === null}
                  className={shownSegment === null ? styles.elevationTabActive : styles.elevationTab}
                  onClick={() => setElevationView("all")}
                >
                  All
                </button>
                {profile.segments.map((seg) => (
                  <button
                    key={seg.index}
                    type="button"
                    role="tab"
                    aria-selected={shownSegment === seg.index}
                    className={shownSegment === seg.index ? styles.elevationTabActive : styles.elevationTab}
                    onClick={() => setElevationView(seg.index)}
                  >
                    {segmentLabel(seg.index)} · {seg.lengthM.toFixed(2)} m
                  </button>
                ))}
              </div>
            )}
            <fieldset disabled={locked} className={`${styles.spacingRows} ${styles.lockable}`}>
              {/* one wall at a time: with several walls, the whole-wall view
                  leaves the post counts to the plan's own table */}
              {(shownSegment !== null ? [profile.segments[shownSegment]] : profile.segments.length === 1 ? profile.segments : []).map((seg) => {
                const bays = seg.endPostIndex - seg.startPostIndex
                const tooWide = seg.postSpacingM > seg.tableMaxSpacingM + 1e-6
                const setSpacing = runSpacing[seg.index]?.maxSpacingM
                return (
                  <div key={seg.index} className={styles.spacingRow}>
                    <span className={styles.spacingName}>
                      {profile.segments.length > 1 ? `Wall ${segmentLabel(seg.index)}` : "Posts"}
                    </span>
                    <span className={styles.stepper}>
                      <button
                        type="button"
                        aria-label={`One post fewer${profile.segments.length > 1 ? ` on wall ${segmentLabel(seg.index)}` : ""}`}
                        disabled={bays <= 1}
                        onClick={() => applyRunSpacing(seg.index, { bayCount: bays - 1 })}
                      >
                        −
                      </button>
                      <span>{bays + 1} posts</span>
                      <button
                        type="button"
                        aria-label={`One post more${profile.segments.length > 1 ? ` on wall ${segmentLabel(seg.index)}` : ""}`}
                        onClick={() => applyRunSpacing(seg.index, { bayCount: bays + 1 })}
                      >
                        +
                      </button>
                    </span>
                    <span className={tooWide ? styles.spacingWarn : undefined}>
                      at {Math.round(seg.postSpacingM * 1000)}mm centres
                      {tooWide ? ` ⚠ over the table’s ${Math.round(seg.tableMaxSpacingM * 1000)}mm max` : ""}
                    </span>
                    <label className={styles.spacingField}>
                      Max spacing (mm)
                      <input
                        key={`${seg.index}-${setSpacing ?? "auto"}`}
                        type="number"
                        min={200}
                        step={50}
                        inputMode="numeric"
                        placeholder={`Auto — ${Math.round(seg.tableMaxSpacingM * 1000)}`}
                        defaultValue={setSpacing ? Math.round(setSpacing * 1000) : ""}
                        onBlur={(e) => {
                          const mm = parseFloat(e.target.value)
                          if (mm >= 200) {
                            if (mm / 1000 !== setSpacing) applyRunSpacing(seg.index, { maxSpacingM: mm / 1000 })
                          } else if (setSpacing) applyRunSpacing(seg.index, null)
                          else e.target.value = ""
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.currentTarget.blur()
                        }}
                      />
                    </label>
                    {seg.spacingOverridden && (
                      <button type="button" className={styles.inlineLink} onClick={() => applyRunSpacing(seg.index, null)}>
                        Clear — back to the table ({seg.tableBayCount + 1} posts)
                      </button>
                    )}
                  </div>
                )
              })}
            </fieldset>
            {stepTarget !== null && profile.segments[stepTarget].stepped && (
              <fieldset disabled={locked} className={styles.lockable}>
                <StepEditor
                  wallName={profile.segments.length > 1 ? `wall ${segmentLabel(stepTarget)}` : "the wall"}
                  bays={profile.bays
                    .filter((bay) => bay.leftIndex >= profile.segments[stepTarget].startPostIndex && bay.rightIndex <= profile.segments[stepTarget].endPostIndex)
                    .map((bay) => ({ leftPost: bay.leftIndex + 1, rightPost: bay.rightIndex + 1, courses: bay.stepCourseCount ?? 0 }))}
                  courseHeightMm={Math.round(calcSettings.boardCourseHeightM * 1000)}
                  edited={profile.segments[stepTarget].stepsEdited}
                  onSetCounts={(counts) => setStepCounts(stepTarget, counts)}
                  onReset={() => resetStepCounts(stepTarget)}
                />
              </fieldset>
            )}
            {profile.segments.length > 1 && shownSegment === null && steppedCount > 0 && (
              <p className={styles.viewNote}>Pick a wall above to move its steps or set its bay heights.</p>
            )}
            <WallProfileDiagram
              profile={profile}
              settings={calcSettings}
              topCapEnabled={topCapEnabled}
              selectedIndex={selectedIndex}
              onSelectPost={setSelectedIndex}
              segmentIndex={shownSegment}
              mirrored={mirrored}
              highlight={boardHighlight}
            />
            <p className={styles.viewNote}>
              Seen from the low side, facing the retained ground
              {profile.segments.length > 1 &&
                (shownSegment !== null
                  ? ` — corner to corner along wall ${segmentLabel(shownSegment)}.`
                  : ` — walls ${mirrored ? "run right to left" : "run left to right"} from A, each corner flattened out.`)}
              {profile.segments.length === 1 && "."}
            </p>
          </div>

          {selectedPost && (
            <div className={styles.editPanel} key={selectedPost.index}>
              <h3>Post #{selectedPost.index + 1}</h3>
              <fieldset disabled={locked} className={styles.lockable}>
              <div className={styles.editFields}>
                <div className={styles.field}>
                  <label>Ground level {rlDatumM !== 0 ? "(RL)" : "(m)"}</label>
                  <input
                    ref={groundInputRef}
                    type="number"
                    step={0.001}
                    inputMode="decimal"
                    defaultValue={(rlDatumM + selectedPost.groundLevelM).toFixed(3)}
                  />
                </div>
                <div className={styles.field}>
                  <label>
                    {selectedPost.isCorner ? `Top — wall ${segmentLabel(cornerBefore ?? 0)} comes up to` : "Top of post"}{" "}
                    {rlDatumM !== 0 ? "(RL)" : "(m)"}
                  </label>
                  <input
                    ref={topInputRef}
                    type="number"
                    step={0.001}
                    inputMode="decimal"
                    defaultValue={(rlDatumM + selectedPost.topBeforeM).toFixed(3)}
                  />
                </div>
                {selectedPost.isCorner && (
                  <div className={styles.field}>
                    <label>
                      Top — wall {segmentLabel((cornerBefore ?? 0) + 1)} starts at {rlDatumM !== 0 ? "(RL)" : "(m)"}
                    </label>
                    <input
                      ref={topAfterInputRef}
                      type="number"
                      step={0.001}
                      inputMode="decimal"
                      defaultValue={(rlDatumM + selectedPost.topAfterM).toFixed(3)}
                    />
                  </div>
                )}
              </div>
              <div className={styles.editFields}>
                <div className={styles.field}>
                  <label htmlFor="postDepth">Hole depth below ground (mm)</label>
                  <input
                    id="postDepth"
                    ref={depthInputRef}
                    type="number"
                    min={50}
                    step={50}
                    inputMode="numeric"
                    defaultValue={Math.round(selectedPost.embedmentM * 1000)}
                    onChange={() => {
                      // typing a depth means setting it — default to just this post
                      if (depthModeRef.current && depthModeRef.current.value === "auto") depthModeRef.current.value = "lone"
                    }}
                  />
                </div>
                <div className={styles.field}>
                  <label htmlFor="postDepthMode">Depth applies to</label>
                  <select id="postDepthMode" ref={depthModeRef} defaultValue={selectedPost.depthSet ?? "auto"}>
                    <option value="auto">Worked out — not set by hand</option>
                    <option value="lone">This post only</option>
                    <option value="rake">Rake point — holes between rake to the next one</option>
                  </select>
                </div>
              </div>
              <p className={styles.cornerNote}>
                Depth is from this post&apos;s ground level to the bottom of its hole, gravel base pad included
                {selectedPost.embedmentM < selectedPost.tableEmbedmentM - 1e-6
                  ? ` — ⚠ shallower than the ${Math.round(selectedPost.tableEmbedmentM * 1000)}mm the reference table gives for this post.`
                  : ` (the reference table gives ${Math.round(selectedPost.tableEmbedmentM * 1000)}mm for this post).`}{" "}
                A rake point works like a hand-set top: the hole bottoms of the posts between two rake points sit on a
                straight line between them, with the wall&apos;s end posts holding their own worked-out depth.
              </p>
              </fieldset>
              {selectedPost.isCorner && (
                <p className={styles.cornerNote}>
                  Corner post — a facing board can&apos;t run through it, so a joint is forced here. Corners are set
                  in the plan. The two walls can meet at different heights: set a different top on each side and the
                  step happens at this post, which stands at the taller of the two
                  {Math.abs(selectedPost.topBeforeM - selectedPost.topAfterM) > 0.0005
                    ? ` — ${Math.round((selectedPost.topLevelM - selectedPost.groundLevelM) * 1000)} mm of post above ground here.`
                    : "."}
                </p>
              )}
              <div className={styles.editActions}>
                <Button size="small" onClick={handleSaveControlPoint} disabled={locked}>
                  Save
                </Button>
                {selectedPost.isControlPoint && (
                  <Button size="small" variant="secondary" onClick={handleClearControlPoint} disabled={locked}>
                    Reset to raked
                  </Button>
                )}
                <Button size="small" variant="secondary" onClick={() => setSelectedIndex(null)}>
                  Close
                </Button>
              </div>
            </div>
          )}

          {!allBlocked && totals && (
            <>
              {profile.segments.length > 1 && (
                <p className={styles.breakdownNote}>
                  {shownSegment !== null
                    ? `Materials below are for wall ${segmentLabel(shownSegment)} only (posts ${postList(totals.postIndices) || "none"}). A corner post is counted with the wall it finishes, so the walls add up to the whole-wall figures — pick “All” above for those.`
                    : "Materials below are for the whole wall. Pick a wall above (or tap it in the plan) to see just that wall’s share."}
                </p>
              )}
              <div className={styles.resultsGrid} id="rw-materials">
                <SpecCard
                  title={`Posts${forWall}`}
                  rows={[
                    ...totals.postsBySize.map((s) => ({ label: s.sizeLabel, value: `${s.count}` })),
                    {
                      label: augerDiameterMm ? "Hole diameter (auger)" : "Hole diameter",
                      value: totals.holeDiametersM.map((d) => `${Math.round(d * 1000)}mm`).join(" / ") || "—",
                    },
                    {
                      label: holeDepthOverrideMm ? "Hole depth (set)" : "Hole depth",
                      value: totals.postIndices.length ? mmRange(totals.minHoleDepthM, totals.maxHoleDepthM) : "—",
                    },
                    { label: "Concrete, net of posts", value: formatM3(totals.totalConcreteVolumeM3) },
                    { label: "Concrete + 10% waste", value: formatM3(totals.totalConcreteVolumeM3 * 1.1) },
                    { label: "Gravel base pads", value: formatM3(totals.totalGravelBaseVolumeM3) },
                    { label: "Total drilled volume", value: formatM3(totals.totalFillVolumeM3) },
                  ]}
                  note={`${totals.augerTooSmall ? "⚠ That auger is too small for at least one post here — the post won't fit down the hole. " : ""}${totals.shallowHolePostIndices.length ? `⚠ The set hole depth is shallower than the reference table gives for post${totals.shallowHolePostIndices.length > 1 ? "s" : ""} ${postList(totals.shallowHolePostIndices)}. ` : ""}${totals.undersizedPostIndices.length ? `⚠ The set post size is smaller than the reference table gives for post${totals.undersizedPostIndices.length > 1 ? "s" : ""} ${postList(totals.undersizedPostIndices)}. ` : ""}Hole depth is from the post's ground level to the bottom of the hole, gravel base pad included. Concrete is each hole above its gravel base pad, less the post’s own volume — the figure to order from, before the 10% allowance for over-dug holes and spillage. Embeds deeper than a simple fence post — it has to resist the retained soil's push over its whole buried length, not just wind load.`}
                />
                <SpecCard
                  title={`Boards${forWall}`}
                  rows={[
                    { label: "Facing boards (pieces)", value: `${totals.boards.count}` },
                    { label: "Facing — joins", value: `${totals.boards.joints.length}` },
                    ...(rakedTopBoard ? [{ label: "Facing — cut down to the rake", value: `${totals.boards.rakeCutCount}` }] : []),
                    { label: rakedTopBoard ? "Top board, raked (pieces)" : "Top/perimeter board (pieces)", value: `${totals.topBoard.count}` },
                    { label: "Top board — joins", value: `${totals.topBoard.joints.length}` },
                    ...(totals.topCap
                      ? [
                          { label: "Top cap (pieces)", value: `${totals.topCap.count}` },
                          { label: "Top cap — joins", value: `${totals.topCap.joints.length}` },
                        ]
                      : []),
                    {
                      label: "Total fixed length, all layers",
                      value: formatM(totals.boards.totalLengthM + totals.topBoard.totalLengthM + (totals.topCap?.totalLengthM ?? 0)),
                    },
                    ...totals.boardOrder.map((o) => ({ label: `Suggested order — ${formatM(o.lengthM, 1)} lengths`, value: `${o.count}` })),
                    ...totals.topCapOrder.map((o) => ({ label: `Top cap, suggested — ${formatM(o.lengthM, 1)} lengths`, value: `${o.count}` })),
                    {
                      label: "Lengths available",
                      value: boardStockLengths(calcSettings)
                        .map((l) => `${l}`)
                        .join(" / ") + " m",
                    },
                  ]}
                  note={`${rakedTopBoard ? "The top board is a full board laid on the rake of the wall; the level boards run up to its underside and the ones that meet it are cut down along their length to suit. It's measured along the slope, and joined at any post where the rake changes. " : ""}Every layer is planned as real cut pieces. A board runs on over as many posts as the longest available length allows and only ever ends on a post; it always breaks at a corner or an excluded bay. ${boardsToPostOutside ? "Lengths are post centre to post centre, except at the two ends of each wall, where the board runs on to the outside face of the end post" : "Lengths are post centre to post centre, including at the ends of each wall"} — change that under “Board ends” above the elevation. Where a wall is too long for one board, each row's joins are staggered onto different posts than the row below — see the join marks on the elevation. The order is worked out with longest pieces first, cutting shorter pieces from offcuts where they fit, and no allowance for saw cuts or waste.${shownSegment !== null ? " Ordered wall by wall, offcuts can't be shared between walls, so the walls' orders can add up to more than the whole-wall order." : ""} Change the available lengths in the calculation settings.`}
                />
                <SpecCard
                  title={`Drainage backfill${forWall}`}
                  rows={[{ label: "Volume", value: formatM3(totals.totalBackfillVolumeM3) }]}
                  note={`Compacted free-draining gravel behind the facing boards, ${Math.round(calcSettings.backfillThicknessM * 1000)}mm thick.`}
                />
                <LaborSummary
                  estimate={totals.labor}
                  infillLabel="Backfill placement (drainage gravel)"
                  title={shownSegment !== null ? `Rough labour estimate${forWall}` : undefined}
                  hideSetup={shownSegment !== null}
                />
              </div>
              {/* deliberately not locked: the order is worked on after the
                  wall is set up, which is exactly when it's locked */}
              <div id="rw-order">
              <BoardOrderCard
                walls={orderWalls}
                stockLengthsM={boardStocks}
                fixed={boardOrderFixed}
                onChange={setBoardOrderFixed}
                partial={boardOrderPartial}
                onPartialChange={setBoardOrderPartial}
                placed={boardOrdersPlaced}
                onPlacedChange={setBoardOrdersPlaced}
                onHighlight={setBoardHighlight}
              />
              </div>
              <p className={styles.disclaimer}>
                Rule-of-thumb estimate for straightforward ground and access — not an engineered design. Ground
                conditions vary a lot in practice; if in doubt, especially near a boundary, driveway, or structure,
                get a professional opinion before you dig.
              </p>
            </>
          )}
        </>
      )}
    </div>
  )
}

export default RetainingWallEditor
