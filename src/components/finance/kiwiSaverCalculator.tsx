"use client"

import { useMemo, useState } from "react"
import SpecCard from "@/components/structures/specCard"
import GrowthChart, { ChartSeries } from "./growthChart"
import NumberField from "./numberField"
import styles from "./finance.module.scss"
import {
  DEFAULT_FUNDS,
  EMPLOYEE_RATES,
  FundId,
  FundProfile,
  GOV_MAX,
  PIR_RATES,
  netReturnPct,
  nzd,
  projectKiwiSaver,
  toTodaysDollars,
} from "./finance"

/** ± this many points of net return for the "rough / good decades" band. */
const SPREAD_PCT = 2

/** KiwiSaver projection focused on the higher-risk schemes (Growth and
 * Aggressive), with Balanced alongside as the baseline. */
const KiwiSaverCalculator = () => {
  const [age, setAge] = useState(30)
  const [retireAge, setRetireAge] = useState(65)
  const [balance, setBalance] = useState(25000)
  const [salary, setSalary] = useState(75000)
  const [salaryGrowthPct, setSalaryGrowthPct] = useState(2.5)
  const [employeePct, setEmployeePct] = useState(3.5)
  const [employerPct, setEmployerPct] = useState(3.5)
  const [follow2028Rise, setFollow2028Rise] = useState(true)
  const [voluntaryMonthly, setVoluntaryMonthly] = useState(0)
  const [feePct, setFeePct] = useState(1)
  const [pirPct, setPirPct] = useState(28)
  const [inflationPct, setInflationPct] = useState(2)
  const [govContribution, setGovContribution] = useState(true)
  const [funds, setFunds] = useState<FundProfile[]>(DEFAULT_FUNDS)
  const [selected, setSelected] = useState<FundId>("aggressive")
  const [todaysDollars, setTodaysDollars] = useState(false)
  const [showTable, setShowTable] = useState(false)

  const inputs = {
    age,
    retireAge: Math.max(retireAge, age + 1),
    balance,
    salary,
    salaryGrowthPct,
    employeePct,
    employerPct,
    follow2028Rise,
    voluntaryMonthly,
    feePct,
    pirPct,
    inflationPct,
    govContribution,
  }

  const results = useMemo(
    () =>
      funds.map((f) => {
        const net = netReturnPct(f.grossPct, feePct, pirPct)
        return {
          fund: f,
          net,
          points: projectKiwiSaver(inputs, net),
          low: projectKiwiSaver(inputs, net - SPREAD_PCT),
          high: projectKiwiSaver(inputs, net + SPREAD_PCT),
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [funds, JSON.stringify(inputs)],
  )

  const adj = (v: number, year: number) => (todaysDollars ? toTodaysDollars(v, year, inflationPct) : v)
  const sel = results.find((r) => r.fund.id === selected)!
  const end = sel.points[sel.points.length - 1]
  const yearsToGo = end.year
  const contributed = balance + end.employee + end.employer + end.government + end.voluntary

  const series: ChartSeries[] = results.map((r) => ({
    label: r.fund.label,
    color: r.fund.color,
    values: r.points.map((p) => adj(p.balance, p.year)),
    dashed: r.fund.id === "balanced",
  }))
  series.push({
    label: "Contributions only",
    color: "#7a8a99",
    values: sel.points.map((p) =>
      adj(balance + p.employee + p.employer + p.government + p.voluntary, p.year),
    ),
    area: true,
  })

  const setGross = (id: FundId, v: number) =>
    setFunds((fs) => fs.map((f) => (f.id === id ? { ...f, grossPct: v } : f)))

  return (
    <section className={styles.calculator}>
      <p className={styles.intro}>
        Projects your KiwiSaver to retirement in the higher-risk funds — set up for the Fisher Funds KiwiSaver Plan,
        Kiwibank&apos;s KiwiSaver provider. Growth and Aggressive funds hold mostly shares,
        so they swing harder year to year but have historically compounded faster over long horizons. Balanced is shown
        dashed for comparison.
      </p>

      <h3 className={styles.subhead}>You</h3>
      <div className={styles.formGrid}>
        <NumberField label="Current age" value={age} onChange={setAge} min={16} max={64} />
        <NumberField label="Retire at" value={retireAge} onChange={setRetireAge} min={17} max={90} />
        <NumberField label="Current balance" prefix="$" value={balance} onChange={setBalance} step={1000} />
        <NumberField label="Salary (before tax)" prefix="$" value={salary} onChange={setSalary} step={1000} />
        <NumberField label="Pay rises" suffix="% p.a." value={salaryGrowthPct} onChange={setSalaryGrowthPct} step={0.5} max={15} />
        <NumberField label="Extra voluntary" prefix="$" suffix="/ mo" value={voluntaryMonthly} onChange={setVoluntaryMonthly} step={25} />
      </div>

      <h3 className={styles.subhead}>Contributions</h3>
      <div className={styles.formGrid}>
        <div className={styles.field}>
          <label>Your rate</label>
          <select value={employeePct} onChange={(e) => setEmployeePct(Number(e.target.value))}>
            {EMPLOYEE_RATES.map((r) => (
              <option key={r} value={r}>
                {r}%{r === 3 ? " (opt-down)" : r === 3.5 ? " (default)" : ""}
              </option>
            ))}
          </select>
        </div>
        <NumberField label="Employer rate" suffix="%" value={employerPct} onChange={setEmployerPct} step={0.5} max={20} />
        <div className={styles.field}>
          <label>Inflation</label>
          <NumberField bare suffix="% p.a." value={inflationPct} onChange={setInflationPct} step={0.1} max={15} />
        </div>
      </div>
      <div className={styles.checks}>
        <label>
          <input type="checkbox" checked={follow2028Rise} onChange={(e) => setFollow2028Rise(e.target.checked)} />
          Rates rise to 4% from 1 April 2028
        </label>
        <label>
          <input type="checkbox" checked={govContribution} onChange={(e) => setGovContribution(e.target.checked)} />
          Government contribution (25c per $1, up to {nzd(GOV_MAX, true)}/yr)
        </label>
      </div>

      <h3 className={styles.subhead}>Fund assumptions</h3>
      <div className={styles.formGrid}>
        <div className={styles.field}>
          <label>Fees</label>
          <NumberField bare suffix="% p.a." value={feePct} onChange={setFeePct} step={0.05} max={5} />
          <span className={styles.hint}>Fisher Funds Aggressive: est. 0.85–1.23%</span>
        </div>
        <div className={styles.field}>
          <label>PIR (tax on returns)</label>
          <select value={pirPct} onChange={(e) => setPirPct(Number(e.target.value))}>
            {PIR_RATES.map((r) => (
              <option key={r} value={r}>
                {r}%
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={styles.fundGrid}>
        {results.map((r) => {
          const last = r.points[r.points.length - 1]
          return (
            <div
              key={r.fund.id}
              role="button"
              tabIndex={0}
              className={`${styles.fundCard} ${selected === r.fund.id ? styles.fundSelected : ""}`}
              style={{ borderColor: selected === r.fund.id ? r.fund.color : undefined }}
              onClick={() => setSelected(r.fund.id)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setSelected(r.fund.id)}
            >
              <div className={styles.fundHead}>
                <span className={styles.swatch} style={{ background: r.fund.color, borderColor: r.fund.color }} />
                <strong>{r.fund.label}</strong>
                <span className={styles.hint}>{r.fund.growthAssets} growth assets</span>
              </div>
              <div className={styles.inline} onClick={(e) => e.stopPropagation()}>
                <NumberField
                  bare
                  label={`${r.fund.label} gross return`}
                  suffix="% gross"
                  value={r.fund.grossPct}
                  onChange={(v) => setGross(r.fund.id, v)}
                  step={0.25}
                  max={20}
                />
              </div>
              <span className={styles.hint}>{r.net.toFixed(2)}% net of fees &amp; tax</span>
              <span className={styles.fundValue}>{nzd(adj(last.balance, last.year))}</span>
            </div>
          )
        })}
      </div>

      <div className={styles.headline}>
        <div>
          <span className={styles.headlineLabel}>
            {sel.fund.label} at {retireAge} ({yearsToGo.toFixed(0)} yrs)
          </span>
          <span className={styles.headlineValue}>{nzd(adj(end.balance, yearsToGo))}</span>
        </div>
        <div>
          <span className={styles.headlineLabel}>Rough to good decades (±{SPREAD_PCT}%)</span>
          <span className={styles.headlineSub}>
            {nzd(adj(sel.low[sel.low.length - 1].balance, yearsToGo))} –{" "}
            {nzd(adj(sel.high[sel.high.length - 1].balance, yearsToGo))}
          </span>
        </div>
        <div className={styles.modeToggle}>
          <button className={!todaysDollars ? styles.modeActive : ""} onClick={() => setTodaysDollars(false)}>
            Future $
          </button>
          <button className={todaysDollars ? styles.modeActive : ""} onClick={() => setTodaysDollars(true)}>
            Today&apos;s $
          </button>
        </div>
      </div>

      <GrowthChart
        ariaLabel="KiwiSaver balance by age for each fund type"
        xLabel={(i) => `${Math.round(age + (sel.points[i]?.year ?? i))}`}
        series={series}
        band={{
          label: `${sel.fund.label} ±${SPREAD_PCT}%`,
          color: sel.fund.color,
          low: sel.low.map((p) => adj(p.balance, p.year)),
          high: sel.high.map((p) => adj(p.balance, p.year)),
        }}
      />

      <div className={styles.resultsGrid}>
        <SpecCard
          title={`${sel.fund.label}: where it comes from`}
          rows={[
            { label: "Starting balance", value: nzd(balance) },
            { label: "Your contributions", value: nzd(end.employee) },
            { label: "Employer (after ESCT)", value: nzd(end.employer) },
            { label: "Government", value: nzd(end.government) },
            ...(end.voluntary > 0 ? [{ label: "Voluntary", value: nzd(end.voluntary) }] : []),
            { label: "Investment returns", value: nzd(end.returns) },
            { label: "Total at retirement", value: nzd(end.balance) },
          ]}
          note={`Returns are ${Math.round((end.returns / Math.max(1, end.balance)) * 100)}% of the final balance (future dollars).`}
        />
        <SpecCard
          title="High-risk vs balanced"
          rows={results.map((r) => {
            const last = r.points[r.points.length - 1].balance
            const base = results.find((x) => x.fund.id === "balanced")!.points.at(-1)!.balance
            return {
              label: r.fund.label,
              value: r.fund.id === "balanced" ? nzd(adj(last, yearsToGo)) : `${nzd(adj(last, yearsToGo))} (+${nzd(adj(last - base, yearsToGo))})`,
            }
          })}
          note={`Total you, your employer and the government put in: ${nzd(adj(contributed, yearsToGo))}.`}
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
                <th>Age</th>
                {results.map((r) => (
                  <th key={r.fund.id}>{r.fund.label}</th>
                ))}
                <th>Put in</th>
              </tr>
            </thead>
            <tbody>
              {sel.points.slice(1).map((p, k) => (
                <tr key={p.year}>
                  <td>{Math.round(p.age)}</td>
                  {results.map((r) => (
                    <td key={r.fund.id}>{nzd(adj(r.points[k + 1].balance, p.year))}</td>
                  ))}
                  <td>{nzd(adj(balance + p.employee + p.employer + p.government + p.voluntary, p.year))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className={styles.disclaimer}>
        Estimate only, not financial advice. Returns are smooth long-run averages; real Growth and Aggressive funds can
        drop 20–30% in a bad year. Net return is approximated as gross × (1 − PIR) − fees. Employer contributions are
        taxed at ESCT; the government contribution stops at 65 and isn&apos;t paid on income over $180,000. Withdrawals
        (e.g. first home) aren&apos;t modelled.
      </p>
    </section>
  )
}

export default KiwiSaverCalculator
