"use client"

import { useMemo, useState } from "react"
import SpecCard from "@/components/structures/specCard"
import GrowthChart from "./growthChart"
import NumberField from "./numberField"
import styles from "./finance.module.scss"
import {
  Compounding,
  ContributionFrequency,
  RWT_RATES,
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
  { id: "annually", label: "Annually" },
]

const PRESETS: { label: string; rate: number; compounding: Compounding; hint: string }[] = [
  { label: "Bonus saver", rate: 3.5, compounding: "monthly", hint: "Monthly, conditions apply" },
  { label: "Notice saver", rate: 3.75, compounding: "monthly", hint: "32–90 day notice" },
  { label: "Term deposit", rate: 4, compounding: "annually", hint: "Interest compounded on rollover" },
  { label: "On-call", rate: 1.5, compounding: "monthly", hint: "Everyday online saver" },
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
        Interest accrues daily and is credited — after resident withholding tax — at the end of each
        compounding period, the same way NZ banks run savings accounts and term deposits.
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
          <label>RWT rate</label>
          <select value={rwtPct} onChange={(e) => setRwtPct(Number(e.target.value))}>
            {RWT_RATES.map((r) => (
              <option key={r} value={r}>
                {r === 0 ? "0% (RWT-exempt)" : `${r}%`}
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
            { label: `RWT at ${rwtPct}%`, value: `−${nzd(end.tax)}` },
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
        Estimate only. Assumes the rate stays fixed for the whole term; bank rates change, bonus-saver rates usually
        need conditions met each month, and term deposits typically pay interest at maturity or annually.
      </p>
    </section>
  )
}

export default SavingsCalculator
