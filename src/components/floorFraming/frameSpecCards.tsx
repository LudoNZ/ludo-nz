"use client"

import SpecCard from "@/components/structures/specCard"
import { FrameLayout, sheetLabel } from "./frame"

const m = (mm: number) => `${(mm / 1000).toFixed(2)} m`
const hr = (h: number) => `${h.toFixed(1)} hr`
const sz = (label: string | null) => (label ?? "—").replace("mm", "").replace(" x ", " × ") + " mm"

/** The frame's results as cards: joists, what holds them up, blocking and
 * nogs, the flooring sheets, and the labour. */
const FrameSpecCards: React.FC<{ frame: FrameLayout }> = ({ frame: f }) => {
  const joists = f.members.filter((x) => x.kind === "joist")
  const rims = f.members.filter((x) => x.kind === "rim")
  const ledger = f.members.filter((x) => x.kind === "ledger")
  const bearers = f.members.filter((x) => x.kind === "bearer")
  const blocking = f.members.filter((x) => x.kind === "blocking")
  const nogs = f.members.filter((x) => x.kind === "nog")
  const longest = Math.max(0, ...joists.map((j) => j.to - j.from))
  const pieces = joists.reduce((a, j) => a + j.pieces.length, 0)
  const walls = f.input.support === "walls"
  const deck = f.input.covering === "decking"
  const tallest = Math.max(0, ...f.piles.map((p) => p.aboveGround))

  return (
    <>
      <SpecCard
        title="Joists"
        rows={[
          { label: "Size", value: `${sz(f.joistSize)} SG8 ${f.treatment}` },
          { label: "Count", value: `${joists.length}` },
          { label: "Spacing", value: `${f.actualSpacingMm} mm${f.input.firstBaySpacing ? ` (first bay ${f.input.firstBaySpacing})` : ""}` },
          { label: "Longest", value: m(longest) },
          { label: walls ? "Span" : "Longest span between bearers", value: `${f.joistSpanM.toFixed(2)} m of ${f.joistMaxSpanM} m` },
          ...(pieces > joists.length ? [{ label: "Pieces (joined over bearers)", value: `${pieces}` }] : []),
          ...(rims.length ? [{ label: "Rim joists", value: `${rims.length}, ${m(rims.reduce((a, r) => a + r.to - r.from, 0))}` }] : []),
        ]}
        note={`Rule-of-thumb ${deck ? "deck (wet in service)" : "floor"} span table at ${f.input.joistSpacing} mm centres — joists are re-spaced evenly to fit, never wider than that.`}
        noteToggle
      />
      {walls ? (
        <SpecCard
          title={f.input.hangers ? "Joist hangers" : "On the walls"}
          rows={
            f.input.hangers
              ? [
                  { label: "Hangers", value: `${f.hangerCount}` },
                  { label: "Hanger nails", value: `${f.hangerCount * 10}` },
                ]
              : [{ label: "Skew nails", value: `${f.skewNails}` }]
          }
          note={f.input.hangers ? "A hanger at each end of every joist." : "Two nails skew-nailed at each end of every joist, into the top plate below."}
        />
      ) : (
        <SpecCard
          title={ledger.length ? "Ledger, bearers and piles" : "Bearers and piles"}
          rows={[
            ...(ledger.length
              ? [
                  { label: "Ledger", value: `${f.joistDepth} × 45 mm H3.2, ${m(ledger.reduce((a, l) => a + l.to - l.from, 0))}` },
                  { label: "Ledger bolts (M12)", value: `${f.ledgerBolts}` },
                  { label: "Joist hangers", value: `${f.hangerCount}` },
                ]
              : []),
            { label: "Bearers", value: `${bearers.length} × ${sz(f.bearerSize)}` },
            { label: "Loaded dimension", value: `${f.loadedDimensionM.toFixed(2)} m` },
            { label: "Piles", value: `${f.piles.length} at up to ${f.pileSpacingMm} mm` },
            { label: "Tallest out of the ground", value: `${Math.round(tallest)} mm` },
          ]}
          note={`125 × 125 H5 piles, ${450} mm into the ground in concrete; bearers span up to ${f.bearerMaxSpanM} m between piles at this loaded dimension.${ledger.length ? " The ledger is bolted to the house through 12 mm spacers, and the joists are hung off it." : ""}`}
          noteToggle
        />
      )}
      {(blocking.length > 0 || nogs.length > 0) && (
        <SpecCard
          title="Blocking and nogs"
          rows={[
            ...(blocking.length ? [{ label: "Blocking pieces", value: `${blocking.length}` }] : []),
            ...(nogs.length ? [{ label: "Nogs under sheet edges", value: `${nogs.length}` }] : []),
            { label: "Nails", value: `${f.blockingNails}` },
          ]}
          note="Solid blocking stops long joists rolling; square-edged ply wants a nog under each long edge between joists."
          noteToggle
        />
      )}
      {!deck && (
        <SpecCard
          title="Flooring"
          rows={[
            { label: "Sheets", value: `${f.sheetCount}` },
            { label: "Type", value: sheetLabel(f.input.sheet) },
            { label: "Pieces laid", value: `${f.sheets.length} (${f.sheets.filter((s) => s.cut).length} cut)` },
            { label: "Screws", value: `${f.sheetScrews}` },
          ]}
          note="Laid long edge across the joists, every other row starting on a half sheet so the ends stagger, every end landing on a joist. Offcuts are used where they fit."
          noteToggle
        />
      )}
      <SpecCard
        title="Labour"
        rows={[
          { label: "Setup", value: hr(f.labour.setupHours) },
          ...(f.labour.pileHours ? [{ label: "Piles", value: hr(f.labour.pileHours) }] : []),
          ...(f.labour.bearerHours ? [{ label: "Bearers", value: hr(f.labour.bearerHours) }] : []),
          ...(f.labour.ledgerHours ? [{ label: "Ledger", value: hr(f.labour.ledgerHours) }] : []),
          { label: "Joists", value: hr(f.labour.joistHours) },
          ...(f.labour.hangerHours ? [{ label: "Hangers", value: hr(f.labour.hangerHours) }] : []),
          ...(f.labour.blockingHours ? [{ label: "Blocking", value: hr(f.labour.blockingHours) }] : []),
          ...(f.labour.sheetHours ? [{ label: "Flooring", value: hr(f.labour.sheetHours) }] : []),
          { label: "Total", value: hr(f.labour.totalHours) },
        ]}
      />
    </>
  )
}

export default FrameSpecCards
