"use client"

import { useEffect, useState } from "react"
import { Modal } from "@/app/elements/Modal/modal"
import Button from "@/components/button/button"
import { CalcSettings, DEFAULT_CALC_SETTINGS, WallSpecRow } from "@/components/retainingWall/calcSettings"
import { SOIL_LABELS } from "@/components/retainingWall/retainingWallCalc"
import { saveCalcSettings, SavedCalcSettings } from "@/components/retainingWall/retainingWallData"
import styles from "./settingsPanel.module.scss"

const NumField: React.FC<{ label: string; value: number; step: number; onChange: (v: number) => void }> = ({
  label,
  value,
  step,
  onChange,
}) => (
  <div className={styles.field}>
    <label>{label}</label>
    <input type="number" step={step} inputMode="decimal" value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} />
  </div>
)

/** Edits every tunable number the calculator runs on (see CalcSettings) —
 * the reference table plus the construction/labour constants around it.
 * Deliberately doesn't include the 1.5m engineer-design cutoff, which
 * stays fixed regardless of what's edited here (see
 * retainingWallCalc.ts's ENGINEER_HEIGHT_LIMIT_M). "Apply" only affects
 * the current session; "Save as new preset" additionally persists it
 * publicly so it can be picked again later, from here or from a saved
 * design that used it. */
const SettingsPanel: React.FC<{
  isOpen: boolean
  onClose: () => void
  activeSettings: CalcSettings
  activeName: string
  presets: SavedCalcSettings[]
  onApply: (settings: CalcSettings, name: string) => void
}> = ({ isOpen, onClose, activeSettings, activeName, presets, onApply }) => {
  const [draft, setDraft] = useState<CalcSettings>(activeSettings)
  const [draftName, setDraftName] = useState(activeName)
  const [showSaveInput, setShowSaveInput] = useState(false)
  const [savingName, setSavingName] = useState("")
  const [saving, setSaving] = useState(false)

  // re-sync from whatever's actually active every time the panel opens, so
  // it never starts from stale edits left over from a previous open
  useEffect(() => {
    if (isOpen) {
      setDraft(activeSettings)
      setDraftName(activeName)
      setShowSaveInput(false)
      setSavingName("")
    }
  }, [isOpen, activeSettings, activeName])

  const updateRow = (index: number, patch: Partial<WallSpecRow>) =>
    setDraft((d) => ({ ...d, referenceTable: d.referenceTable.map((r, i) => (i === index ? { ...r, ...patch } : r)) }))

  const updateField = <K extends keyof CalcSettings>(key: K, value: CalcSettings[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const handlePresetSelect = (id: string) => {
    if (id === "default") {
      setDraft(DEFAULT_CALC_SETTINGS)
      setDraftName("Default")
      return
    }
    const preset = presets.find((p) => p.id === id)
    if (preset) {
      setDraft(preset.settings)
      setDraftName(preset.name)
    }
  }

  const handleApply = () => {
    onApply(draft, draftName)
    onClose()
  }

  const handleSaveAsPreset = async () => {
    const name = savingName.trim()
    if (!name) return
    setSaving(true)
    try {
      await saveCalcSettings(name, draft)
      onApply(draft, name)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isActive={isOpen} closeModal={onClose}>
      <div className={styles.content}>
        <div className={styles.header}>
          <h2>Calculation settings</h2>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <p className={styles.note}>
          Editing &quot;{draftName}&quot;. The 1.5m engineer-design cutoff always applies regardless
          of these settings — everything else here (spacing, embedment, post size, board/labour
          rates) is yours to tune.
        </p>

        <div className={styles.field}>
          <label htmlFor="presetSelect">Start from</label>
          <select id="presetSelect" defaultValue="" onChange={(e) => e.target.value && handlePresetSelect(e.target.value)}>
            <option value="" disabled>
              Choose a preset…
            </option>
            <option value="default">Default</option>
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <h3>Reference table</h3>
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Soil</th>
                <th>Up to</th>
                <th>Post size</th>
                <th>Max spacing (m)</th>
                <th>Embedment ratio</th>
              </tr>
            </thead>
            <tbody>
              {draft.referenceTable.map((row, i) => (
                <tr key={`${row.soil}-${row.maxHeightM}`}>
                  <td>{SOIL_LABELS[row.soil]}</td>
                  <td>{row.maxHeightM}m</td>
                  <td>
                    <select value={row.postSizeLabel} onChange={(e) => updateRow(i, { postSizeLabel: e.target.value })}>
                      <option value="100 x 100mm">100 x 100mm</option>
                      <option value="150 x 150mm">150 x 150mm</option>
                    </select>
                  </td>
                  <td>
                    <input
                      type="number"
                      step={0.05}
                      inputMode="decimal"
                      value={row.maxSpacingM}
                      onChange={(e) => updateRow(i, { maxSpacingM: Number(e.target.value) || 0 })}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step={0.01}
                      inputMode="decimal"
                      value={row.embedmentRatio}
                      onChange={(e) => updateRow(i, { embedmentRatio: Number(e.target.value) || 0 })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3>Construction constants</h3>
        <div className={styles.scalarGrid}>
          <NumField
            label="Gravel base allowance (m)"
            value={draft.gravelBaseAllowanceM}
            step={0.01}
            onChange={(v) => updateField("gravelBaseAllowanceM", v)}
          />
          <NumField
            label="Hole diameter multiplier"
            value={draft.holeDiameterMultiplier}
            step={0.1}
            onChange={(v) => updateField("holeDiameterMultiplier", v)}
          />
          <NumField
            label="Board course height (m)"
            value={draft.boardCourseHeightM}
            step={0.01}
            onChange={(v) => updateField("boardCourseHeightM", v)}
          />
          <NumField
            label="Standard board length (m)"
            value={draft.standardBoardLengthM}
            step={0.1}
            onChange={(v) => updateField("standardBoardLengthM", v)}
          />
          <NumField
            label="Backfill thickness (m)"
            value={draft.backfillThicknessM}
            step={0.01}
            onChange={(v) => updateField("backfillThicknessM", v)}
          />
        </div>

        <h3>Labour rates</h3>
        <div className={styles.scalarGrid}>
          <NumField label="Setup (hr)" value={draft.setupHours} step={0.25} onChange={(v) => updateField("setupHours", v)} />
          <NumField label="Per post (hr)" value={draft.hoursPerPost} step={0.25} onChange={(v) => updateField("hoursPerPost", v)} />
          <NumField label="Per board (hr)" value={draft.hoursPerBoard} step={0.05} onChange={(v) => updateField("hoursPerBoard", v)} />
          <NumField
            label="Per m³ backfill (hr)"
            value={draft.hoursPerM3Backfill}
            step={0.05}
            onChange={(v) => updateField("hoursPerM3Backfill", v)}
          />
        </div>

        {showSaveInput ? (
          <div className={styles.saveRow}>
            <input
              type="text"
              placeholder="Preset name"
              value={savingName}
              onChange={(e) => setSavingName(e.target.value)}
              maxLength={100}
              className={styles.nameInput}
            />
            <Button size="small" onClick={handleSaveAsPreset} disabled={saving}>
              {saving ? "Saving…" : "Save preset"}
            </Button>
            <Button size="small" variant="secondary" onClick={() => setShowSaveInput(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className={styles.actions}>
            <Button size="small" onClick={handleApply}>
              Apply for this session
            </Button>
            <Button size="small" variant="secondary" onClick={() => setShowSaveInput(true)}>
              Save as new preset…
            </Button>
            <Button
              size="small"
              variant="secondary"
              onClick={() => {
                setDraft(DEFAULT_CALC_SETTINGS)
                setDraftName("Default")
              }}
            >
              Reset to default
            </Button>
          </div>
        )}
      </div>
    </Modal>
  )
}

export default SettingsPanel
