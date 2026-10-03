## Explanation

You use LLM coding tools every day, and so does this team. But in a live pairing interview you need to show *your* reasoning, and some interviews ask you to work without AI, at least for part of the session. The skills that atrophy fastest without practice are recalling exact syntax, holding a small design in your head, and talking while typing. These six exercises rebuild them.

**Rules for every exercise:**

1. **No AI, no autocomplete beyond basic editor IntelliSense.** Turn Copilot or any AI completion off in your editor for the session. Docs (MDN, TypeScript handbook, react.dev) are allowed, as they usually are in interviews.
2. **Set a visible timer** for the time box. When it rings, stop and assess, even if unfinished. Running out of time with a clear plan and working tests for half the cases is a *good* interview outcome.
3. **Talk out loud the whole time.** Record yourself (phone audio is enough) for at least two of them, and listen back for long silences and for jumping into code before clarifying.
4. **Start with questions and examples.** Even alone, write two or three example inputs and outputs before coding. That's what you'd agree with the interviewer.
5. **Test early.** Write the first test within the first five minutes. Run it constantly.
6. **Review after.** Compare with the solution: what did you miss, where did you stall, what would you say differently?

**A narration template**, to use until it's habit:

- "Let me restate the problem…" → "A couple of questions: …" → "Here's an example I'll use as a test…"
- "I'll start with the simplest case…" → "That passes; next I'll handle…"
- When stuck: "I'm not sure about X. My options are A or B. I'll go with A because…, and we can revisit."
- At the end: "What I'd do with more time: …"

**Setup:** a scratch folder with `npm init -y`, `npm i -D vitest typescript @types/node` (plus the React Testing Library packages from the RTL lesson for exercises 4 and 5), and one `*.test.ts(x)` file per exercise. Practise in the same editor you'll use in the interview, and check beforehand whether they'll want you sharing your screen or using their environment.

**The six:**

| # | Exercise | Time box | Grade |
| --- | --- | --- | --- |
| 1 | Parse a measurement | 10 min | 1 |
| 2 | Outstanding sign-offs report | 15 min | 2 |
| 3 | Retry with backoff | 15 min | 2 |
| 4 | Pass/fail/n/a control (React) | 15 min | 2 |
| 5 | Filterable defect list (React) | 20 min | 2 |
| 6 | Merge an offline edit queue | 25 min | 3 |

## Worked example

Here's what the first two minutes of exercise 1 should *sound* like, before any code:

> "So I get a string from a text box and need millimetres as a number, or an error. Questions: which units? Say mm, cm and m. Decimals? Yes. Spaces between number and unit? Allowed. No unit, do we assume mm? I'll assume yes and confirm. Negative values? Cover can't be negative, so that's an error. Let me write examples: `'55'` → 55, `'55mm'` → 55, `'5.5 cm'` → 55, `'0.055m'` → 55, `'abc'` → error, `'-3mm'` → error. I'll return a discriminated union, `{ ok: true, mm }` or `{ ok: false, error }`, so callers have to handle the error. First test: plain number."

Notice: units, edge cases, the return type and the first test are all decided out loud in under two minutes. Floating point gets a mention when it comes up: `1.005 * 1000` is `1004.9999999999999` in JavaScript, so round to a sensible precision.

## Exercises

### 1. Parse a measurement (10 min) [1]

Write `parseMm(input: string)` returning `{ ok: true; mm: number }` or `{ ok: false; error: string }`. Accept an optional unit of `mm`, `cm` or `m` (default mm), optional whitespace, and decimals. Reject empty, negative, non-numeric and unknown units. Round to 0.1 mm.

#### Solution

```ts file=src/parseMm.ts group=timed
export type ParsedMm = { ok: true; mm: number } | { ok: false; error: string }

const FACTORS = { mm: 1, cm: 10, m: 1000 } as const

export function parseMm(input: string): ParsedMm {
  const match = input.trim().match(/^(\d+(?:\.\d+)?)\s*(mm|cm|m)?$/i)
  if (!match) return { ok: false, error: `Can't read "${input}" as a measurement` }
  const unit = (match[2]?.toLowerCase() ?? "mm") as keyof typeof FACTORS
  const mm = Math.round(Number(match[1]) * FACTORS[unit] * 10) / 10
  return { ok: true, mm }
}
```

```ts file=src/parseMm.test.ts group=timed
import { expect, it } from "vitest"
import { parseMm } from "./parseMm"

it.each([
  ["55", 55],
  ["55mm", 55],
  ["5.5 cm", 55],
  ["0.055m", 55],
  ["  12.25 MM ", 12.3],
  ["1.005m", 1005],
])("reads %j as %d mm", (input, mm) => {
  expect(parseMm(input)).toEqual({ ok: true, mm })
})

it.each(["", "abc", "-3mm", "5 inches", "5..5"])("rejects %j", (input) => {
  expect(parseMm(input).ok).toBe(false)
})
```

The regex rejects negatives by not allowing a sign at all. Say so rather than adding a separate check. `1.005 * 1000` is `1004.9999999999999` in floating point, which is why the rounding is there, and why `1.005m` is a test case.

### 2. Outstanding sign-offs report (15 min) [2]

Given `signOffs: { id: number; projectCode: string; requestedAt: Date; signedAt: Date | null }[]` and `now: Date`, return one row per project that has sign-offs unsigned for **more than 7 days**: `{ projectCode, count, oldestDays }`, sorted by `oldestDays` descending, then `projectCode`. (It's the SQL drill's question, in TypeScript.)

#### Solution

```ts file=src/outstanding.ts group=timed
export interface SignOffRow {
  id: number
  projectCode: string
  requestedAt: Date
  signedAt: Date | null
}

export interface OutstandingRow {
  projectCode: string
  count: number
  oldestDays: number
}

const DAY = 24 * 60 * 60 * 1000

export function outstandingByProject(signOffs: SignOffRow[], now: Date, olderThanDays = 7): OutstandingRow[] {
  const byProject = new Map<string, OutstandingRow>()
  for (const s of signOffs) {
    if (s.signedAt) continue
    const ageDays = (now.getTime() - s.requestedAt.getTime()) / DAY
    if (ageDays <= olderThanDays) continue
    const row = byProject.get(s.projectCode) ?? { projectCode: s.projectCode, count: 0, oldestDays: 0 }
    row.count++
    row.oldestDays = Math.max(row.oldestDays, Math.floor(ageDays))
    byProject.set(s.projectCode, row)
  }
  return [...byProject.values()].sort((a, b) => b.oldestDays - a.oldestDays || a.projectCode.localeCompare(b.projectCode))
}
```

```ts file=src/outstanding.test.ts group=timed
import { expect, it } from "vitest"
import { outstandingByProject } from "./outstanding"

const NOW = new Date("2026-10-01T00:00:00Z")
const ago = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000)

it("groups unsigned requests older than seven days, oldest first", () => {
  const rows = outstandingByProject(
    [
      { id: 1, projectCode: "TRC-101", requestedAt: ago(97), signedAt: null },
      { id: 2, projectCode: "TRC-101", requestedAt: ago(10), signedAt: null },
      { id: 3, projectCode: "IB-24-09", requestedAt: ago(57), signedAt: null },
      { id: 4, projectCode: "TRC-102", requestedAt: ago(30), signedAt: ago(29) }, // signed
      { id: 5, projectCode: "HCW-031", requestedAt: ago(7), signedAt: null }, // exactly 7: not "more than"
    ],
    NOW,
  )
  expect(rows).toEqual([
    { projectCode: "TRC-101", count: 2, oldestDays: 97 },
    { projectCode: "IB-24-09", count: 1, oldestDays: 57 },
  ])
})

it("returns an empty list when nothing is overdue", () => {
  expect(outstandingByProject([], NOW)).toEqual([])
})
```

Things to say: `now` is a parameter, so the test controls time. "More than" means exactly seven days is excluded, and the test pins that. The `a || b` comparator gives a stable secondary sort. In production this belongs in SQL (one query, indexed). In the interview, mention that trade-off.

### 3. Retry with backoff (15 min) [2]

Write `retry(fn, { attempts, baseMs, sleep })` that calls async `fn` until it succeeds, up to `attempts` times total, waiting `baseMs`, then `2×baseMs`, then `4×baseMs`… between tries, and rethrows the last error. Only retry when `shouldRetry(err)` (default: always) returns true. Make waiting injectable so tests are instant.

#### Solution

```ts file=src/retry.ts group=timed
export interface RetryOptions {
  attempts: number
  baseMs: number
  shouldRetry?: (err: unknown) => boolean
  sleep?: (ms: number) => Promise<void>
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export async function retry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  const { attempts, baseMs, shouldRetry = () => true, sleep = realSleep } = opts
  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (attempt === attempts || !shouldRetry(err)) break
      await sleep(baseMs * 2 ** (attempt - 1))
    }
  }
  throw lastError
}
```

```ts file=src/retry.test.ts group=timed
import { expect, it, vi } from "vitest"
import { retry } from "./retry"

it("retries with exponential waits and returns the first success", async () => {
  const sleep = vi.fn().mockResolvedValue(undefined)
  const fn = vi.fn().mockRejectedValueOnce(new Error("503")).mockRejectedValueOnce(new Error("503")).mockResolvedValue("ok")

  await expect(retry(fn, { attempts: 5, baseMs: 100, sleep })).resolves.toBe("ok")
  expect(fn).toHaveBeenCalledTimes(3)
  expect(sleep.mock.calls.map((c) => c[0])).toEqual([100, 200])
})

it("gives up after the last attempt and rethrows its error", async () => {
  const sleep = vi.fn().mockResolvedValue(undefined)
  const fn = vi.fn().mockRejectedValue(new Error("down"))
  await expect(retry(fn, { attempts: 3, baseMs: 10, sleep })).rejects.toThrow("down")
  expect(fn).toHaveBeenCalledTimes(3)
  expect(sleep).toHaveBeenCalledTimes(2)
})

it("doesn't retry errors that aren't retryable", async () => {
  const fn = vi.fn().mockRejectedValue(Object.assign(new Error("bad request"), { status: 400 }))
  const shouldRetry = (e: unknown) => (e as { status?: number }).status !== 400
  await expect(retry(fn, { attempts: 3, baseMs: 10, shouldRetry, sleep: async () => {} })).rejects.toThrow("bad request")
  expect(fn).toHaveBeenCalledTimes(1)
})
```

Mention what you'd add for production: **jitter** (randomise waits so many clients don't retry in lockstep), a maximum delay, and only retrying **idempotent** operations or ones carrying an idempotency key. That links straight back to the AWS lesson.

### 4. Pass / fail / n/a control (15 min) [2]

Build `ResultPicker({ label, value, onChange })`: three options (Pass, Fail, N/A) as an accessible radio group. Picking calls `onChange` with `"pass" | "fail" | "na"`. Choosing **Fail** reveals a required "What failed?" note field, and `onChange` for a fail includes the note once it's typed. Test it with React Testing Library.

#### Solution

```tsx file=src/ResultPicker.tsx group=timed
import { useId, useState } from "react"

export type Result = "pass" | "fail" | "na"
export type Change = { result: "pass" | "na" } | { result: "fail"; note: string }

const OPTIONS: { value: Result; label: string }[] = [
  { value: "pass", label: "Pass" },
  { value: "fail", label: "Fail" },
  { value: "na", label: "N/A" },
]

export function ResultPicker({ label, onChange }: { label: string; onChange: (c: Change) => void }) {
  const name = useId()
  const [result, setResult] = useState<Result | null>(null)
  const [note, setNote] = useState("")

  const pick = (r: Result) => {
    setResult(r)
    onChange(r === "fail" ? { result: "fail", note } : { result: r })
  }

  return (
    <fieldset>
      <legend>{label}</legend>
      {OPTIONS.map((o) => (
        <label key={o.value}>
          <input type="radio" name={name} value={o.value} checked={result === o.value} onChange={() => pick(o.value)} />
          {o.label}
        </label>
      ))}
      {result === "fail" && (
        <label>
          What failed?
          <textarea
            required
            value={note}
            onChange={(e) => {
              setNote(e.target.value)
              onChange({ result: "fail", note: e.target.value })
            }}
          />
        </label>
      )}
    </fieldset>
  )
}
```

```tsx file=src/ResultPicker.test.tsx group=timed
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { expect, it, vi } from "vitest"
import { ResultPicker } from "./ResultPicker"

it("reports a pass", async () => {
  const user = userEvent.setup()
  const onChange = vi.fn()
  render(<ResultPicker label="Formwork clean, braced and to line" onChange={onChange} />)

  await user.click(screen.getByRole("radio", { name: "Pass" }))

  expect(onChange).toHaveBeenLastCalledWith({ result: "pass" })
  expect(screen.queryByLabelText("What failed?")).not.toBeInTheDocument()
})

it("asks what failed and reports the note", async () => {
  const user = userEvent.setup()
  const onChange = vi.fn()
  render(<ResultPicker label="Formwork clean, braced and to line" onChange={onChange} />)

  await user.click(screen.getByRole("radio", { name: "Fail" }))
  const note = screen.getByLabelText("What failed?")
  expect(note).toBeRequired()
  await user.type(note, "Edge form out of line")

  expect(onChange).toHaveBeenLastCalledWith({ result: "fail", note: "Edge form out of line" })
  expect(screen.getByRole("group", { name: "Formwork clean, braced and to line" })).toBeInTheDocument()
})
```

Native radios inside a `fieldset`/`legend` give you keyboard support and a labelled group for free, which beats div-buttons with click handlers. The `Change` union makes it impossible for the parent to receive a fail without a note field. Large hit areas matter for gloved hands on site. Mention it, but don't burn time styling.

### 5. Filterable defect list (20 min) [2]

Build `DefectList({ defects })` where a defect is `{ id, lotCode, description, severity: "minor" | "major" | "critical", closed: boolean }`. It has a search box (matches lot code or description, case-insensitive), a "Hide closed" checkbox (on by default), and shows "N defects" for the visible count. Critical defects are listed first. Test search, the toggle and the ordering.

#### Solution

```tsx file=src/DefectList.tsx group=timed
import { useState } from "react"

export interface Defect {
  id: number
  lotCode: string
  description: string
  severity: "minor" | "major" | "critical"
  closed: boolean
}

const RANK = { critical: 0, major: 1, minor: 2 } as const

export function DefectList({ defects }: { defects: Defect[] }) {
  const [query, setQuery] = useState("")
  const [hideClosed, setHideClosed] = useState(true)

  const q = query.trim().toLowerCase()
  const visible = defects
    .filter((d) => !(hideClosed && d.closed))
    .filter((d) => !q || d.lotCode.toLowerCase().includes(q) || d.description.toLowerCase().includes(q))
    .sort((a, b) => RANK[a.severity] - RANK[b.severity] || a.id - b.id)

  return (
    <section>
      <label>
        Search defects
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <label>
        <input type="checkbox" checked={hideClosed} onChange={(e) => setHideClosed(e.target.checked)} />
        Hide closed
      </label>
      <p role="status">
        {visible.length} {visible.length === 1 ? "defect" : "defects"}
      </p>
      <ul>
        {visible.map((d) => (
          <li key={d.id}>
            [{d.severity}] {d.lotCode}: {d.description}
          </li>
        ))}
      </ul>
    </section>
  )
}
```

```tsx file=src/DefectList.test.tsx group=timed
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { expect, it } from "vitest"
import { DefectList, type Defect } from "./DefectList"

const defects: Defect[] = [
  { id: 1, lotCode: "TRC-101-L03", description: "Honeycombing at slab edge", severity: "major", closed: false },
  { id: 2, lotCode: "TRC-101-L08", description: "Membrane lap too short", severity: "critical", closed: false },
  { id: 3, lotCode: "TRC-102-L04", description: "Lintel undersized", severity: "minor", closed: true },
]

it("hides closed defects by default and lists critical first", () => {
  render(<DefectList defects={defects} />)
  expect(screen.getByRole("status")).toHaveTextContent("2 defects")
  const items = within(screen.getByRole("list")).getAllByRole("listitem")
  expect(items[0]).toHaveTextContent("Membrane lap too short")
})

it("searches lot codes and descriptions, case-insensitively", async () => {
  const user = userEvent.setup()
  render(<DefectList defects={defects} />)
  await user.type(screen.getByLabelText("Search defects"), "HONEY")
  expect(screen.getByRole("status")).toHaveTextContent("1 defect")
  expect(screen.getByText(/Honeycombing/)).toBeInTheDocument()
})

it("shows closed defects when the toggle is off", async () => {
  const user = userEvent.setup()
  render(<DefectList defects={defects} />)
  await user.click(screen.getByLabelText("Hide closed"))
  await user.type(screen.getByLabelText("Search defects"), "trc-102")
  expect(screen.getByText(/Lintel undersized/)).toBeInTheDocument()
})
```

The filtered list is *derived during render*, with no effect and no second state (previous lesson). `.filter()` creates a new array, so `.sort()` doesn't mutate the prop. Point that out, because sorting a prop array in place is a classic bug. `role="status"` makes the count announce to screen readers and gives tests a clean handle.

### 6. Merge an offline edit queue (25 min) [3]

Field devices queue edits while offline. Write `merge(server, pending)` where both are lists of `{ id: string; value: string; updatedAt: number; deleted?: boolean }`. For each id, the version with the later `updatedAt` wins. Ties go to the **server**. A winning `deleted: true` removes the record. Return the merged live records sorted by id, plus `conflicts`: ids where the local edit lost to a newer server version (so the UI can tell the foreman).

#### Solution

```ts file=src/merge.ts group=timed
export interface Rec {
  id: string
  value: string
  updatedAt: number
  deleted?: boolean
}

export function merge(server: Rec[], pending: Rec[]): { records: Rec[]; conflicts: string[] } {
  const winners = new Map<string, Rec>(server.map((r) => [r.id, r]))
  const conflicts: string[] = []

  for (const local of pending) {
    const remote = winners.get(local.id)
    if (!remote || local.updatedAt > remote.updatedAt) {
      winners.set(local.id, local)
    } else if (remote.value !== local.value || !!remote.deleted !== !!local.deleted) {
      conflicts.push(local.id) // the local edit lost, and it actually differed
    }
  }

  const records = [...winners.values()].filter((r) => !r.deleted).sort((a, b) => a.id.localeCompare(b.id))
  return { records, conflicts: conflicts.sort() }
}
```

```ts file=src/merge.test.ts group=timed
import { describe, expect, it } from "vitest"
import { merge } from "./merge"

describe("merge", () => {
  it("keeps newer local edits and adds new local records", () => {
    const { records, conflicts } = merge(
      [{ id: "a", value: "server", updatedAt: 1 }],
      [{ id: "a", value: "local", updatedAt: 2 }, { id: "b", value: "new", updatedAt: 3 }],
    )
    expect(records.map((r) => r.value)).toEqual(["local", "new"])
    expect(conflicts).toEqual([])
  })

  it("lets a newer server version win and reports the conflict", () => {
    const { records, conflicts } = merge([{ id: "a", value: "server", updatedAt: 5 }], [{ id: "a", value: "local", updatedAt: 4 }])
    expect(records[0].value).toBe("server")
    expect(conflicts).toEqual(["a"])
  })

  it("breaks ties in favour of the server", () => {
    const { records } = merge([{ id: "a", value: "server", updatedAt: 5 }], [{ id: "a", value: "local", updatedAt: 5 }])
    expect(records[0].value).toBe("server")
  })

  it("applies a winning delete and doesn't flag identical edits as conflicts", () => {
    const { records, conflicts } = merge(
      [{ id: "a", value: "x", updatedAt: 1 }, { id: "b", value: "same", updatedAt: 9 }],
      [{ id: "a", value: "x", updatedAt: 2, deleted: true }, { id: "b", value: "same", updatedAt: 3 }],
    )
    expect(records.map((r) => r.id)).toEqual(["b"])
    expect(conflicts).toEqual([])
  })
})
```

The discussion matters more than the code. Last-write-wins on *client* clocks is fragile, because device clocks drift. Prefer server-assigned versions (a counter, or the row's `updated_at` that the client echoes back when editing, i.e. optimistic concurrency) and merge per *field* rather than per record where possible. And for QA records specifically, many things shouldn't be "edited" at all. Responses are append-only, so two offline inspectors produce two responses rather than a conflict. That's the bridge into the offline-sync design case. Raise it, because it shows domain judgement.

## Say it aloud

"You use AI coding tools daily. How do you make sure you still understand the code, and how would you work in a session without them?"

#### Model answer

I use them a lot, for boilerplate, test scaffolding, exploring an unfamiliar API, and as a reviewer. But I treat the output as a draft from a fast junior: I read every line, run it, and I own it once it's merged. The habits that keep that honest are writing or at least reading the tests myself, checking anything security- or data-related very carefully, and verifying APIs against the real docs, because tools confidently invent flags and options. To keep the underlying skills sharp, I've been doing timed exercises with AI turned off: parsing input, a report grouping, retry with backoff, a couple of React components with Testing Library, and an offline merge. I talk out loud and record myself. Without the tools I work the same way, just more visibly. I clarify the problem and write a couple of examples first, write the first test early, take small steps, and narrate the trade-offs, like why I'd prefer server-side versions to client clocks for conflict resolution. If I forget exact syntax I'll say so and check the docs rather than guess.
