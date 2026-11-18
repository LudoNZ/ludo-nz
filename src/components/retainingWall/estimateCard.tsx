"use client"

import { describeAge, Estimate, EstimateSettings, ExtraLine, formatNzd, newPriceId } from "./pricing"
import styles from "./estimateCard.module.scss"

const qtyText = (q: number) => (Number.isInteger(q) ? String(q) : q.toFixed(q < 10 ? 2 : 1))

/** The wall priced up: every quantity from the calculator times its price
 * from the library, with markup, contingency and GST, and any extra lines
 * typed in by hand. Flags lines with no price and prices that haven't
 * been confirmed in the last three months. Cost is what it costs you;
 * price is what goes on the proposal (cost plus markup). */
const EstimateCard: React.FC<{
  estimate: Estimate
  settings: EstimateSettings
  onChange: (next: EstimateSettings) => void
  onOpenLibrary: (onlyStale?: boolean) => void
  onOpenProposal: () => void
  libraryNote?: string | null
}> = ({ estimate, settings, onChange, onOpenLibrary, onOpenProposal, libraryNote }) => {
  const set = (patch: Partial<EstimateSettings>) => onChange({ ...settings, ...patch })
  const setExtra = (id: string, patch: Partial<ExtraLine>) =>
    set({ extraLines: settings.extraLines.map((x) => (x.id === id ? { ...x, ...patch } : x)) })
  const pct = (key: "markupPct" | "contingencyPct" | "gstPct", label: string) => (
    <label className={styles.pct}>
      <span>{label}</span>
      <span className={styles.pctInput}>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step={1}
          value={settings[key]}
          onChange={(e) => {
            const n = Number(e.target.value)
            if (e.target.value.trim() !== "" && n >= 0) set({ [key]: n })
          }}
        />
        %
      </span>
    </label>
  )
  const margin = estimate.priceSubtotal > 0 ? (estimate.markup / estimate.priceSubtotal) * 100 : 0
  const missing = estimate.lines.filter((l) => l.unitCost === null)

  return (
    <div className={styles.card} id="rw-estimate">
      <div className={styles.header}>
        <h3>Price estimate</h3>
        <div className={styles.headerButtons}>
          <button type="button" className={styles.secondary} onClick={() => onOpenLibrary()}>
            Price library
          </button>
          <button type="button" className={styles.primary} onClick={onOpenProposal}>
            Create proposal
          </button>
        </div>
      </div>

      {libraryNote && <p className={styles.note}>{libraryNote}</p>}
      {missing.length > 0 && (
        <div className={styles.alertMissing}>
          <span>
            ⚠ No price in the library for {missing.map((l) => l.description.toLowerCase()).join(", ")} — {missing.length === 1 ? "it's" : "they're"} left out of
            the total.
          </span>
          <button type="button" className={styles.secondary} onClick={() => onOpenLibrary()}>
            Add prices
          </button>
        </div>
      )}
      {estimate.staleCount > 0 && (
        <div className={styles.alertStale}>
          <span>
            ⚠ {estimate.staleCount} price{estimate.staleCount === 1 ? " used here hasn't" : "s used here haven't"} been confirmed in the last 3 months.
          </span>
          <button type="button" className={styles.secondary} onClick={() => onOpenLibrary(true)}>
            Review prices
          </button>
        </div>
      )}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col" className={styles.num}>
                Qty
              </th>
              <th scope="col" className={styles.num}>
                Rate
              </th>
              <th scope="col" className={styles.num}>
                Cost
              </th>
              <th scope="col" className={styles.num}>
                Price
              </th>
            </tr>
          </thead>
          <tbody>
            {estimate.lines
              .filter((l) => !l.manual)
              .map((l) => (
                <tr key={l.key} className={l.stale ? styles.staleRow : l.unitCost === null ? styles.missingRow : undefined}>
                  <td>
                    <div className={styles.desc}>{l.description}</div>
                    {l.detail && <div className={styles.detail}>{l.detail}</div>}
                    {l.candidates.length > 1 || (!l.item && l.candidates.length > 0) ? (
                      <select
                        className={styles.itemPicker}
                        value={l.item?.id ?? ""}
                        aria-label={`Price for ${l.description}`}
                        onChange={(e) => set({ itemChoice: { ...settings.itemChoice, [l.key]: e.target.value } })}
                      >
                        {!l.item && <option value="">Pick a price…</option>}
                        {l.candidates.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} — {formatNzd(c.price)}/{c.unit}
                          </option>
                        ))}
                      </select>
                    ) : (
                      l.item && <div className={styles.detail}>{l.item.name}</div>
                    )}
                    {l.item && l.stale && <div className={styles.staleNote}>⚠ {describeAge(l.item)}</div>}
                    {!l.item && (
                      <div className={styles.missingNote}>
                        {l.candidates.length ? "No price for this size in the library — pick one above or add it" : "No price in the library"}
                      </div>
                    )}
                  </td>
                  <td className={styles.num}>
                    {qtyText(l.quantity)} {l.unit}
                  </td>
                  <td className={styles.num}>{l.unitCost !== null ? formatNzd(l.unitCost) : "—"}</td>
                  <td className={styles.num}>{l.unitCost !== null ? formatNzd(l.cost) : "—"}</td>
                  <td className={styles.num}>{l.unitCost !== null ? formatNzd(l.cost * estimate.sellFactor) : "—"}</td>
                </tr>
              ))}
            {settings.extraLines.map((x) => (
              <tr key={x.id} className={styles.extraRow}>
                <td>
                  <input
                    className={styles.extraDesc}
                    value={x.description}
                    placeholder="Description (e.g. digger hire, spoil removal)"
                    aria-label="Extra item description"
                    onChange={(e) => setExtra(x.id, { description: e.target.value })}
                  />
                  <button type="button" className={styles.removeExtra} onClick={() => set({ extraLines: settings.extraLines.filter((e) => e.id !== x.id) })}>
                    Remove
                  </button>
                </td>
                <td className={styles.num}>
                  <span className={styles.extraQty}>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step={1}
                      value={x.quantity}
                      aria-label="Quantity"
                      onChange={(e) => {
                        const n = Number(e.target.value)
                        if (e.target.value.trim() !== "" && n >= 0) setExtra(x.id, { quantity: n })
                      }}
                    />
                    <input value={x.unit} placeholder="unit" aria-label="Unit" onChange={(e) => setExtra(x.id, { unit: e.target.value })} />
                  </span>
                </td>
                <td className={styles.num}>
                  <input
                    className={styles.extraRate}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={0.01}
                    value={x.unitPrice}
                    aria-label="Rate, excl GST"
                    onChange={(e) => {
                      const n = Number(e.target.value)
                      if (e.target.value.trim() !== "" && n >= 0) setExtra(x.id, { unitPrice: n })
                    }}
                  />
                </td>
                <td className={styles.num}>{formatNzd(x.unitPrice * x.quantity)}</td>
                <td className={styles.num}>{formatNzd(x.unitPrice * x.quantity * estimate.sellFactor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        className={styles.addExtra}
        onClick={() => set({ extraLines: [...settings.extraLines, { id: newPriceId(), description: "", quantity: 1, unit: "each", unitPrice: 0 }] })}
      >
        + Add an item
      </button>

      <div className={styles.options}>
        {pct("markupPct", "Markup")}
        {pct("contingencyPct", "Contingency")}
        {pct("gstPct", "GST")}
        <label className={styles.check}>
          <input type="checkbox" checked={settings.includeFixings} onChange={(e) => set({ includeFixings: e.target.checked })} /> Fixings allowance
        </label>
        <label className={styles.check}>
          <input type="checkbox" checked={settings.includeDrainage} onChange={(e) => set({ includeDrainage: e.target.checked })} /> Drainage
        </label>
      </div>

      <dl className={styles.totals}>
        <div>
          <dt>Cost (materials and labour)</dt>
          <dd>{formatNzd(estimate.costSubtotal)}</dd>
        </div>
        <div>
          <dt>
            Markup {settings.markupPct}%<small> ({margin.toFixed(1)}% margin)</small>
          </dt>
          <dd>{formatNzd(estimate.markup)}</dd>
        </div>
        <div>
          <dt>Contingency {settings.contingencyPct}%</dt>
          <dd>{formatNzd(estimate.contingency)}</dd>
        </div>
        <div className={styles.subtotal}>
          <dt>Total excl GST</dt>
          <dd>{formatNzd(estimate.totalExGst)}</dd>
        </div>
        <div>
          <dt>GST {settings.gstPct}%</dt>
          <dd>{formatNzd(estimate.gst)}</dd>
        </div>
        <div className={styles.grand}>
          <dt>Total incl GST</dt>
          <dd>{formatNzd(estimate.totalIncGst)}</dd>
        </div>
      </dl>
    </div>
  )
}

export default EstimateCard
