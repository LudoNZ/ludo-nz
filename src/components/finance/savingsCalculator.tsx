"use client"

import { useMemo, useState } from "react"
import SpecCard from "@/components/structures/specCard"
import GrowthChart from "./growthChart"
import NumberField from "./numberField"
import styles from "./finance.module.scss"
import {
  Compounding,
  ContributionFrequency,
  TAX_OPTIONS,
  effectiveAnnualRate,
  nzd,
  projectSavings,
  toTodaysDollars,
} from "./finance"

const FREQUENCIES: { id: ContributionFrequency; label: string; perYear: number }[] = [
  { id: "none", label: "None", perYear: 0 },
  { id: "weekly", label: "Weekly", perYear: 52 },
  { id: "fortnightly", label: "Fortnightly", perYear: 26 },
  { id: "monthly", label: "Monthly", perYear: 12 },
]

const COMPOUNDING: { id: Compounding; label: string }[] = [
  { id: "daily", label: "Daily" },
  { id: "monthly", label: "Monthly" },
  { id: "quarterly", label: "Quarterly" },
  { id: "sixmonthly", label: "Six-monthly" },
  { id: "annually", label: "Annually" },
]

/** Kiwibank accounts. Rates are a snapshot (Nov 2026) and change without
 * notice — check the Kiwibank app before relying on them. */
const PRESETS: { label: string; rate: number; compounding: Compounding; hint: string; tax?: number }[] = [
  { label: "Online Call", rate: 1.75, compounding: "monthly", hint: "Instant access, no bonus conditions" },
  { label: "PIE Online Call", rate: 1.75, compounding: "monthly", hint: "Taxed at your PIR, max 28%", tax: 28 },
  { label: "Notice Saver 90 days", rate: 2.75, compounding: "monthly", hint: "90 days' notice, $2,000 minimum" },
  { label: "Term deposit 2 yr", rate: 4.15, compounding: "annually", hint: "Fixed for the term; interest paid annually" },
]

/** NZ bank-style compound savings calculator: initial lump + regular
 * deposits, daily accrual credited per compounding period, less RWT. */
const SavingsCalculator = () => {
  const [initial, setInitial] = useState(10000)
  const [contribution, setContribution] = useState(200)
  const [frequency, setFrequency] = useState<ContributionFrequency>("fortnightly")
  const [ratePct, setRatePct] = useState(3.5)
  const [compounding, setCompounding] = useState<Compounding>("monthly")
  const [years, setYears] = useState(10)
  const [rwtPct, setRwtPct] = useState(30)
  const [inflationPct, setInflationPct] = useState(2)
  const [showTable, setShowTable] = useState(false)

  const points = useMemo(
    () => projectSavings({ initial, contribution, frequency, ratePct, compounding, years, rwtPct, inflationPct }),
    [initial, contribution, frequency, ratePct, compounding, years, rwtPct, inflationPct],
  )
  const end = points[points.length - 1]
  const netInterest = end.grossInterest - end.tax
  const real = toTodaysDollars(end.balance, end.year, inflationPct)
  const perYear = FREQUENCIES.find((f) => f.id === frequency)!.perYear * (frequency === "none" ? 0 : contribution)

  return (
    <section className={styles.calculator}>
      <p className={styles.intro}>
        Interest accrues daily and is credited — after tax — at the end of each compounding period, the way
        Kiwibank runs its savings accounts and term deposits. The buttons fill in Kiwibank rates (Nov 2026
        snapshot — check the app for today&apos;s rate).
      </p>

      <div className={styles.presets}>
        {PRESETS.map((p) => (
          <button
            key={p.label}
            className={styles.presetButton}
            title={p.hint}
            onClick={() => {
              setRatePct(p.rate)
              setCompounding(p.compounding)
              if (p.tax !== undefined) setRwtPct(p.tax)
              else if (rwtPct === 28) setRwtPct(30)
            }}
          >
            {p.label} · {p.rate}%
          </button>
        ))}
      </div>

      <div className={styles.formGrid}>
        <NumberField label="Starting balance" prefix="$" value={initial} onChange={setInitial} step={500} />
        <div className={styles.field}>
          <label>Regular deposit</label>
          <div className={styles.inline}>
            <NumberField
              bare
              prefix="$"
              value={contribution}
              onChange={setContribution}
              step={10}
              disabled={frequency === "none"}
            />
            <select value={frequency} onChange={(e) => setFrequency(e.target.value as ContributionFrequency)}>
              {FREQUENCIES.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <NumberField label="Interest rate" suffix="% p.a." value={ratePct} onChange={setRatePct} step={0.05} max={20} />
        <div className={styles.field}>
          <label>Compounding</label>
          <select value={compounding} onChange={(e) => setCompounding(e.target.value as Compounding)}>
            {COMPOUNDING.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <NumberField label="Term" suffix="years" value={years} onChange={setYears} step={1} min={1} max={60} />
        <div className={styles.field}>
          <label>Tax on interest</label>
          <select value={rwtPct} onChange={(e) => setRwtPct(Number(e.target.value))}>
            {TAX_OPTIONS.map((t) => (
              <option key={t.pct} value={t.pct}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <NumberField label="Inflation" suffix="% p.a." value={inflationPct} onChange={setInflationPct} step={0.1} max={15} />
      </div>

      <div className={styles.headline}>
        <div>
          <span className={styles.headlineLabel}>Balance after {end.year} years</span>
          <span className={styles.headlineValue}>{nzd(end.balance)}</span>
        </div>
        <div>
          <span className={styles.headlineLabel}>In today&apos;s dollars</span>
          <span className={styles.headlineSub}>{nzd(real)}</span>
        </div>
        <div>
          <span className={styles.headlineLabel}>Interest after tax</span>
          <span className={styles.headlineSub}>{nzd(netInterest)}</span>
        </div>
      </div>

      <GrowthChart
        ariaLabel="Savings balance growth by year"
        xLabel={(i) => `Yr ${i}`}
        series={[
          { label: "Balance", color: "var(--color-primary)", values: points.map((p) => p.balance), area: true },
          { label: "Deposits", color: "var(--color-secondary)", values: points.map((p) => p.contributed), area: true },
          {
            label: "Today's dollars",
            color: "#7a8a99",
            values: points.map((p) => toTodaysDollars(p.balance, p.year, inflationPct)),
            dashed: true,
          },
        ]}
      />

      <div className={styles.resultsGrid}>
        <SpecCard
          title="Breakdown"
          rows={[
            { label: "Starting balance", value: nzd(initial) },
            { label: "Deposits added", value: nzd(end.contributed - initial) },
            { label: "Gross interest", value: nzd(end.grossInterest) },
            { label: `Tax at ${rwtPct}%`, value: `−${nzd(end.tax)}` },
            { label: "Final balance", value: nzd(end.balance) },
          ]}
        />
        <SpecCard
          title="Rates"
          rows={[
            { label: "Nominal rate", value: `${ratePct.toFixed(2)}%` },
            { label: "Effective annual (gross)", value: `${effectiveAnnualRate(ratePct, compounding).toFixed(3)}%` },
            {
              label: "Effective after RWT",
              value: `${effectiveAnnualRate(ratePct * (1 - rwtPct / 100), compounding).toFixed(3)}%`,
            },
            {
              label: "Real (after RWT & inflation)",
              value: `${(
                ((1 + effectiveAnnualRate(ratePct * (1 - rwtPct / 100), compounding) / 100) / (1 + inflationPct / 100) - 1) *
                100
              ).toFixed(2)}%`,
            },
            { label: "Deposits per year", value: nzd(perYear) },
          ]}
          note="If the real rate is negative, the balance is losing buying power even though it's growing."
        />
      </div>

      <button className={styles.linkButton} onClick={() => setShowTable((v) => !v)}>
        {showTable ? "Hide" : "Show"} year-by-year table
      </button>
      {showTable && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Year</th>
                <th>Deposited</th>
                <th>Interest (net)</th>
                <th>Balance</th>
                <th>Today&apos;s $</th>
              </tr>
            </thead>
            <tbody>
              {points.slice(1).map((p) => (
                <tr key={p.year}>
                  <td>{p.year}</td>
                  <td>{nzd(p.contributed)}</td>
                  <td>{nzd(p.grossInterest - p.tax)}</td>
                  <td>{nzd(p.balance)}</td>
                  <td>{nzd(toTodaysDollars(p.balance, p.year, inflationPct))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className={styles.disclaimer}>
        Estimate only. Assumes the rate stays fixed for the whole term. Kiwibank&apos;s Online Call and Notice Saver
        rates can change at any time; term deposit rates are fixed only for the term, and rolling over will pick up
        whatever the rate is then. Breaking a term deposit early costs 2% off the rate.
      </p>
    </section>
  )
}

export default SavingsCalculator
