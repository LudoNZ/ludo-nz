"use client"

import DraftNumberInput from "@/app/stairs/draftNumberInput"
import { FrameInput, FrameSupport, SHEET_PRESETS, SUPPORT_LABELS } from "./frame"
import { BEARER_SIZES, JOIST_SIZES } from "./frameTables"
import styles from "./frameForm.module.scss"

const PILE_SPACINGS = [900, 1000, 1200, 1300, 1500, 1800]
const BOARD_THICKNESSES = [19, 22, 25, 32, 40]
const SPACINGS = [400, 450, 600]

/** The frame's settings: what holds it up, joist and bearer sizes, how
 * high, and (under a floor) the sheets. `mode` "deck" leaves out walls,
 * spacing (the deck sets it) and sheets. `children` go first — the
 * floor's own size, say. */
const FrameForm: React.FC<{
  value: FrameInput
  onChange: (next: FrameInput) => void
  mode: "floor" | "deck"
  /** names for the two ends of the joists, for where the ledger goes */
  endLabels?: { start: string; end: string }
  children?: React.ReactNode
}> = ({ value, onChange, mode, endLabels = { start: "Top edge", end: "Bottom edge" }, children }) => {
  const set = <K extends keyof FrameInput>(k: K, v: FrameInput[K]) => onChange({ ...value, [k]: v })
  const supports: FrameSupport[] = mode === "deck" ? ["bearers", "ledger"] : ["walls", "bearers", "ledger"]
  const walls = value.support === "walls"
  const sheetIndex = SHEET_PRESETS.findIndex((p) => p.sheet.kind === value.sheet.kind && p.sheet.lengthMm === value.sheet.lengthMm && p.sheet.thicknessMm === value.sheet.thicknessMm)

  return (
    <div className={styles.form}>
      {children}
      <div className={styles.field}>
        <label htmlFor="frame-support">What holds it up</label>
        <select id="frame-support" value={value.support} onChange={(e) => set("support", e.target.value as FrameSupport)}>
          {supports.map((s) => (
            <option key={s} value={s}>
              {SUPPORT_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      {mode === "floor" && (
        <div className={styles.field}>
          <label htmlFor="frame-spacing">Joist spacing</label>
          <select id="frame-spacing" value={value.joistSpacing} onChange={(e) => set("joistSpacing", Number(e.target.value))}>
            {SPACINGS.map((s) => (
              <option key={s} value={s}>
                {s} mm centres
              </option>
            ))}
          </select>
        </div>
      )}
      <div className={styles.field}>
        <label htmlFor="frame-joist">Joist size</label>
        {!walls && <span className={styles.hint}>Bigger joists span further, so fewer bearers</span>}
        <select id="frame-joist" value={value.joistSize ?? ""} onChange={(e) => set("joistSize", e.target.value || null)}>
          {walls && <option value="">Smallest that spans</option>}
          {JOIST_SIZES.map((s) => (
            <option key={s} value={s}>
              {s.replace("mm", " mm")}
            </option>
          ))}
        </select>
      </div>
      {walls ? (
        <div className={styles.field}>
          <label htmlFor="frame-hangers">Joist ends</label>
          <select id="frame-hangers" value={value.hangers ? "hangers" : "onTop"} onChange={(e) => set("hangers", e.target.value === "hangers")}>
            <option value="onTop">Sitting on top (skew-nailed)</option>
            <option value="hangers">Hung with joist hangers</option>
          </select>
        </div>
      ) : (
        <>
          {value.support === "ledger" && (
            <div className={styles.field}>
              <label htmlFor="frame-ledger">Ledger along</label>
              <span className={styles.hint}>The edge against the house</span>
              <select id="frame-ledger" value={value.ledgerEnd} onChange={(e) => set("ledgerEnd", e.target.value === "end" ? "end" : "start")}>
                <option value="start">{endLabels.start}</option>
                <option value="end">{endLabels.end}</option>
              </select>
            </div>
          )}
          <div className={styles.field}>
            <label htmlFor="frame-height">Height (mm)</label>
            <span className={styles.hint}>Ground to the top of the {mode === "deck" ? "decking" : "floor"}</span>
            <DraftNumberInput id="frame-height" min={100} max={5000} step={10} value={value.heightMm} onValue={(v) => set("heightMm", v)} />
          </div>
          <div className={styles.field}>
            <label htmlFor="frame-bearer">Bearer size</label>
            <select id="frame-bearer" value={value.bearerSize ?? ""} onChange={(e) => set("bearerSize", e.target.value || null)}>
              <option value="">Smallest that spans 1.3 m</option>
              {BEARER_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s.replace("mm", " mm")}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="frame-piles">Piles apart, at most</label>
            <select id="frame-piles" value={value.maxPileSpacingMm ?? ""} onChange={(e) => set("maxPileSpacingMm", e.target.value ? Number(e.target.value) : null)}>
              <option value="">As far as the bearer spans</option>
              {PILE_SPACINGS.map((s) => (
                <option key={s} value={s}>
                  {s} mm
                </option>
              ))}
            </select>
          </div>
        </>
      )}
      {mode === "floor" ? (
        <div className={styles.field}>
          <label htmlFor="frame-sheet">Flooring</label>
          <select
            id="frame-sheet"
            value={sheetIndex < 0 ? 0 : sheetIndex}
            onChange={(e) => set("sheet", { ...SHEET_PRESETS[Number(e.target.value)].sheet })}
          >
            {SHEET_PRESETS.map((p, i) => (
              <option key={p.label} value={i}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className={styles.field}>
          <label htmlFor="frame-board">Decking thickness</label>
          <select id="frame-board" value={value.boardThicknessMm} onChange={(e) => set("boardThicknessMm", Number(e.target.value))}>
            {BOARD_THICKNESSES.map((t) => (
              <option key={t} value={t}>
                {t} mm
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}

export default FrameForm
