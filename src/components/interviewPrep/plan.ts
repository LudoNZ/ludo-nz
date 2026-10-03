import type { Course, Lesson, Module } from "./types"

export type Done = Record<string, boolean>
export type Confidence = Record<string, number>

export interface ModuleProgress {
  module: Module
  done: number
  total: number
  coreDone: number
  coreTotal: number
  minutesLeft: number
  confidence: number | null
}

export function moduleProgress(module: Module, done: Done, confidence: Confidence): ModuleProgress {
  const core = module.lessons.filter((l) => l.core)
  return {
    module,
    done: module.lessons.filter((l) => done[l.id]).length,
    total: module.lessons.length,
    coreDone: core.filter((l) => done[l.id]).length,
    coreTotal: core.length,
    minutesLeft: module.lessons.filter((l) => !done[l.id]).reduce((sum, l) => sum + l.minutes, 0),
    confidence: confidence[module.id] ?? null,
  }
}

/** Weakest first: rated modules by confidence, then unrated ones (the
 * summary separately nudges you to rate those), then by how much is left
 * to do. Ties keep course order, which is already priority order. */
export function weakestModules(progress: ModuleProgress[], count = 3): ModuleProgress[] {
  return progress
    .map((p, order) => ({ p, order }))
    .sort((a, b) => {
      const ca = a.p.confidence ?? 6
      const cb = b.p.confidence ?? 6
      if (ca !== cb) return ca - cb
      const fa = a.p.done / a.p.total
      const fb = b.p.done / b.p.total
      if (fa !== fb) return fa - fb
      return a.order - b.order
    })
    .slice(0, count)
    .map(({ p }) => p)
}

export interface PlanDay {
  date: Date
  lessons: Lesson[]
  minutes: number
}

export interface StudyPlan {
  days: PlanDay[]
  /** True when everything left didn't fit, so only core lessons were planned. */
  coreOnly: boolean
  /** Minutes planned beyond the daily budget across all days (0 when it fits). */
  overBudgetMinutes: number
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Parses "YYYY-MM-DD" as a local date (not UTC midnight). */
export function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(y, m - 1, d)
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

/** Packs the lessons still to do into the days between `today` and the
 * interview (not including interview day), in course order. The mock
 * interview module is held back for the last study day so it stays a
 * genuine rehearsal. Falls back to core lessons only if everything won't
 * fit in the daily budget. */
export function buildPlan(course: Course, done: Done, today: Date): StudyPlan | null {
  if (!course.interviewDate) return null
  const start = startOfDay(today)
  const interview = parseLocalDate(course.interviewDate)
  const dayCount = Math.round((interview.getTime() - start.getTime()) / MS_PER_DAY)
  if (dayCount < 1) return { days: [], coreOnly: false, overBudgetMinutes: 0 }

  const budget = course.hoursPerDay * 60
  const mockId = course.modules[course.modules.length - 1].id
  const remaining = (coreOnly: boolean) =>
    course.modules.flatMap((m) => m.lessons.filter((l) => !done[l.id] && (!coreOnly || l.core)).map((l) => ({ l, mock: m.id === mockId })))

  const sumMinutes = (xs: { l: Lesson }[]) => xs.reduce((s, x) => s + x.l.minutes, 0)
  let coreOnly = false
  let todo = remaining(false)
  if (sumMinutes(todo) > dayCount * budget) {
    coreOnly = true
    todo = remaining(true)
  }

  const days: PlanDay[] = Array.from({ length: dayCount }, (_, i) => ({
    date: new Date(start.getFullYear(), start.getMonth(), start.getDate() + i),
    lessons: [],
    minutes: 0,
  }))

  const mock = todo.filter((x) => x.mock).map((x) => x.l)
  const rest = todo.filter((x) => !x.mock).map((x) => x.l)

  // the last day is the rehearsal; with only one day it shares with study
  const lastDay = days[days.length - 1]
  for (const l of mock) {
    lastDay.lessons.push(l)
    lastDay.minutes += l.minutes
  }

  const studyDays = days.length > 1 ? days.slice(0, -1) : days
  let d = 0
  for (const l of rest) {
    // move on when this lesson would overflow the day — unless the day is
    // empty (a lesson longer than the budget still has to go somewhere) or
    // this is the final study day (overflow piles up there and is reported)
    while (d < studyDays.length - 1 && studyDays[d].minutes > 0 && studyDays[d].minutes + l.minutes > budget) d++
    studyDays[d].lessons.push(l)
    studyDays[d].minutes += l.minutes
  }

  const overBudgetMinutes = days.reduce((s, day) => s + Math.max(0, day.minutes - budget), 0)
  return { days, coreOnly, overBudgetMinutes }
}
