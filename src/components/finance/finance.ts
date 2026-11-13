/* NZ savings + KiwiSaver projection maths. Pure functions, no React. */

// ── Savings account / term deposit ─────────────────────────────────────

export type Compounding = "daily" | "monthly" | "quarterly" | "sixmonthly" | "annually"
export type ContributionFrequency = "none" | "weekly" | "fortnightly" | "monthly"

/** Tax on interest: RWT rates for ordinary accounts, plus 28% — the top PIR,
 * which caps tax on PIE accounts (e.g. Kiwibank PIE Online Call). */
export const TAX_OPTIONS: { pct: number; label: string }[] = [
  { pct: 0, label: "0% (RWT-exempt)" },
  { pct: 10.5, label: "10.5% RWT" },
  { pct: 17.5, label: "17.5% RWT" },
  { pct: 28, label: "28% PIR (PIE account)" },
  { pct: 30, label: "30% RWT" },
  { pct: 33, label: "33% RWT" },
  { pct: 39, label: "39% RWT" },
]

export interface SavingsInputs {
  initial: number
  contribution: number
  frequency: ContributionFrequency
  ratePct: number
  compounding: Compounding
  years: number
  rwtPct: number
  inflationPct: number
}

export interface YearPoint {
  year: number
  balance: number
  contributed: number
  grossInterest: number
  tax: number
}

const DAYS_PER_YEAR = 365

const creditEvery: Record<Compounding, number> = {
  daily: 1,
  monthly: DAYS_PER_YEAR / 12,
  quarterly: DAYS_PER_YEAR / 4,
  sixmonthly: DAYS_PER_YEAR / 2,
  annually: DAYS_PER_YEAR,
}

/** Day-by-day simulation the way NZ banks actually do it: interest accrues
 * daily on the balance (rate / 365) and is credited — less RWT — at the end
 * of each compounding period. Contributions land on their own schedule. */
export function projectSavings(i: SavingsInputs): YearPoint[] {
  const years = Math.max(0, Math.min(60, Math.round(i.years)))
  const dailyRate = i.ratePct / 100 / DAYS_PER_YEAR
  const rwt = i.rwtPct / 100
  const period = creditEvery[i.compounding]

  let balance = i.initial
  let contributed = i.initial
  let accrued = 0
  let grossInterest = 0
  let tax = 0
  let nextCredit = period
  let nextMonthly = 1

  const points: YearPoint[] = [{ year: 0, balance, contributed, grossInterest: 0, tax: 0 }]
  const totalDays = years * DAYS_PER_YEAR

  const credit = () => {
    const t = accrued * rwt
    balance += accrued - t
    grossInterest += accrued
    tax += t
    accrued = 0
  }

  for (let day = 1; day <= totalDays; day++) {
    accrued += balance * dailyRate

    if (day + 1e-9 >= nextCredit) {
      credit()
      nextCredit += period
    }

    if (i.contribution > 0) {
      let pay = false
      if (i.frequency === "weekly") pay = day % 7 === 0
      else if (i.frequency === "fortnightly") pay = day % 14 === 0
      else if (i.frequency === "monthly" && day + 1e-9 >= (nextMonthly * DAYS_PER_YEAR) / 12) {
        pay = true
        nextMonthly++
      }
      if (pay) {
        balance += i.contribution
        contributed += i.contribution
      }
    }

    if (day % DAYS_PER_YEAR === 0) {
      if (accrued > 0) credit() // year-end snapshot shows interest earned to date
      points.push({ year: day / DAYS_PER_YEAR, balance, contributed, grossInterest, tax })
    }
  }
  return points
}

/** The single equivalent annual rate after compounding, before tax. */
export function effectiveAnnualRate(ratePct: number, compounding: Compounding): number {
  const r = ratePct / 100
  const n = { daily: 365, monthly: 12, quarterly: 4, sixmonthly: 2, annually: 1 }[compounding]
  return (Math.pow(1 + r / n, n) - 1) * 100
}

export const toTodaysDollars = (value: number, years: number, inflationPct: number) =>
  value / Math.pow(1 + inflationPct / 100, years)

// ── KiwiSaver ──────────────────────────────────────────────────────────

/** Employee rate options. 3.5% is the default from 1 Apr 2026, rising to 4%
 * on 1 Apr 2028; 3% is the temporary opt-down rate. */
export const EMPLOYEE_RATES = [3, 3.5, 4, 6, 8, 10] as const
export const PIR_RATES = [10.5, 17.5, 28] as const

export type FundId = "balanced" | "growth" | "aggressive"

export interface FundProfile {
  id: FundId
  label: string
  /** Long-run assumed return, before fees and PIR tax. */
  grossPct: number
  /** Rough share in growth assets (shares/property), for the label. */
  growthAssets: string
  color: string
}

export const DEFAULT_FUNDS: FundProfile[] = [
  { id: "balanced", label: "Balanced", grossPct: 6, growthAssets: "~50–60%", color: "#7a8a99" },
  { id: "growth", label: "Growth", grossPct: 7, growthAssets: "~75–80%", color: "var(--color-secondary)" },
  { id: "aggressive", label: "Aggressive", grossPct: 8, growthAssets: "~90–100%", color: "var(--color-primary)" },
]

export interface KiwiSaverInputs {
  age: number
  retireAge: number
  balance: number
  salary: number
  salaryGrowthPct: number
  employeePct: number
  employerPct: number
  /** Lift 3/3.5% rates to the 4% default from 1 April 2028. */
  follow2028Rise: boolean
  voluntaryMonthly: number
  feePct: number
  pirPct: number
  inflationPct: number
  /** Whether to model the government contribution. */
  govContribution: boolean
}

export interface KsYearPoint {
  year: number
  age: number
  balance: number
  employee: number
  employer: number
  government: number
  voluntary: number
  returns: number
}

/** ESCT bands (2024 onward) on salary + gross employer contributions. */
export function esctRate(salaryPlusEmployer: number): number {
  if (salaryPlusEmployer <= 18720) return 0.105
  if (salaryPlusEmployer <= 64200) return 0.175
  if (salaryPlusEmployer <= 93720) return 0.3
  if (salaryPlusEmployer <= 216000) return 0.33
  return 0.39
}

/** After fees and PIR tax — tax roughly scales returns, fees come off the top. */
export const netReturnPct = (grossPct: number, feePct: number, pirPct: number) =>
  grossPct * (1 - pirPct / 100) - feePct

/** Government contribution from 1 July 2025: 25c per $1, max $260.72/yr,
 * aged 16 to under 65, and not for income over $180,000. */
export const GOV_RATE = 0.25
export const GOV_MAX = 260.72
export const GOV_INCOME_CAP = 180000

const START = { year: 2026, month: 10 } // Nov 2026 (0-based month)
const RISE_2028 = 2028 * 12 + 3 // April 2028

/** Monthly simulation from today until retirement age. */
export function projectKiwiSaver(i: KiwiSaverInputs, netPct: number): KsYearPoint[] {
  const months = Math.max(0, Math.round((i.retireAge - i.age) * 12))
  const mRate = Math.pow(1 + netPct / 100, 1 / 12) - 1

  let balance = i.balance
  const tot = { employee: 0, employer: 0, government: 0, voluntary: 0, returns: 0 }
  let employeeThisYear = 0
  const points: KsYearPoint[] = [{ year: 0, age: i.age, balance, ...tot }]

  for (let m = 1; m <= months; m++) {
    const yearIdx = Math.floor((m - 1) / 12)
    const age = i.age + (m - 1) / 12
    const salary = i.salary * Math.pow(1 + i.salaryGrowthPct / 100, yearIdx)
    const calMonth = START.year * 12 + START.month + m - 1
    const rise = i.follow2028Rise && calMonth >= RISE_2028

    const empPct = rise ? Math.max(i.employeePct, 4) : i.employeePct
    const erPct = rise ? Math.max(i.employerPct, 4) : i.employerPct

    const returns = balance * mRate
    const employee = (salary * empPct) / 100 / 12
    const erGross = (salary * erPct) / 100 / 12
    const employer = erGross * (1 - esctRate(salary + (salary * erPct) / 100))

    balance += returns + employee + employer + i.voluntaryMonthly
    tot.returns += returns
    tot.employee += employee
    tot.employer += employer
    tot.voluntary += i.voluntaryMonthly
    employeeThisYear += employee + i.voluntaryMonthly

    if (m % 12 === 0 || m === months) {
      if (i.govContribution && age >= 16 && age < 65 && salary <= GOV_INCOME_CAP) {
        const gov = Math.min(employeeThisYear * GOV_RATE, GOV_MAX * ((m - 1) % 12 + 1) / 12)
        balance += gov
        tot.government += gov
      }
      employeeThisYear = 0
      points.push({ year: m / 12, age: i.age + m / 12, balance, ...tot })
    }
  }
  return points
}

// ── Formatting ─────────────────────────────────────────────────────────

export const nzd = (v: number, cents = false) =>
  v.toLocaleString("en-NZ", {
    style: "currency",
    currency: "NZD",
    maximumFractionDigits: cents ? 2 : 0,
    minimumFractionDigits: cents ? 2 : 0,
  })

export const nzdShort = (v: number) => {
  const a = Math.abs(v)
  if (a >= 1e6) return `$${(v / 1e6).toFixed(a >= 1e7 ? 1 : 2)}m`
  if (a >= 1e3) return `$${(v / 1e3).toFixed(a >= 1e5 ? 0 : 1)}k`
  return `$${Math.round(v)}`
}
