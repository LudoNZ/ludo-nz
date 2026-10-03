## Explanation

This repo has no test runner yet, so the course uses **Vitest** (current major: 5). It's Jest-compatible (`describe`/`it`/`expect`), understands TypeScript natively, and is fast. Install it per the [Vitest guide](https://vitest.dev/guide/) and the [Next.js Vitest guide](https://nextjs.org/docs/app/guides/testing/vitest):

```bash
npm install -D vitest
```

Vitest 5 needs Node 22.12 or newer. Add `"test": "vitest"` to `package.json` scripts. `npm test` then watches, and `npx vitest run` runs once (what CI uses). Test files are `*.test.ts` next to the code, or in `__tests__/`.

**Anatomy:**

```ts norun
import { describe, expect, it } from "vitest"

describe("percentComplete", () => {           // groups related tests
  it("is 0 for a checklist with no items", () => {   // one behaviour, named as a spec
    expect(percentComplete([], [])).toBe(0)          // arrange/act/assert in one line here
  })
})
```

Matchers you'll use constantly: `toBe` (same value or reference), `toEqual` (deep equality, the one for objects and arrays), `toMatchObject` (a subset of fields), `toThrow`, `toHaveLength`, `toBeCloseTo` (floats), and `resolves`/`rejects` for promises. `it.each` runs a table of cases through one test body, which is ideal for business rules.

**Design for testability: push logic into pure functions.** A pure function (output depends only on inputs, no side effects) needs no setup, no mocks and no database. The single best habit is to separate *deciding* from *doing*: a pure `canSignOff(state)` decides, and a thin handler fetches the state, calls it and writes the result. Most of your tests then hit the pure function.

**Dependencies you can't avoid** (time, the database, email, S3) get **injected** rather than imported directly, so a test can pass a double:

```ts norun
// hard to test: reaches out to the real clock and a real email module
export async function remind() { const now = new Date(); await sendEmail(...) }

// easy to test: everything it touches comes in as a parameter
export async function remind(deps: { now: () => Date; notify: Notify; repo: Repo }) { ... }
```

This is ordinary function parameters, not a framework. In React it's props. In a Lambda it's a factory: `makeHandler(deps)` returns the handler.

**Vitest's test doubles:**

- `vi.fn()` creates a mock function: `.mockReturnValue(x)`, `.mockResolvedValue(x)` for async, then assert with `toHaveBeenCalledWith(...)` and `toHaveBeenCalledTimes(n)`.
- `vi.spyOn(obj, "method")` wraps an existing method.
- `vi.mock("./module")` replaces a whole import. It's powerful, but it couples tests to file structure, so prefer injection where you control the code.
- **Time**: `vi.useFakeTimers()` with `vi.setSystemTime(date)` freezes `Date`, and `vi.advanceTimersByTime(ms)` fires timers. Injecting a `now()` function is often simpler.

See [Vitest: mocking](https://vitest.dev/guide/mocking) and [the `vi` API](https://vitest.dev/api/vi).

**Interview habits:** write the test name first ("what should happen?"), make it fail for the right reason, keep each test independent (no shared mutable state between `it`s), and keep fixtures small and *visible*. A builder function like `item({ isHoldPoint: true })` beats a 200-line JSON fixture.

## Worked example

Domain logic for checklist progress, as a pure module:

```ts file=src/checklist.ts group=testing-unit
export type ResponseType = "pass_fail" | "measurement" | "text"

export interface Item {
  id: number
  responseType: ResponseType
  isHoldPoint: boolean
}

export interface Response {
  id: number
  itemId: number
  result: "pass" | "fail" | "na" | null
  measuredValue: number | null
  notes: string | null
  respondedAt: Date
}

/** Latest response per item: by time, then id, so ties are deterministic. */
export function latestByItem(responses: Response[]): Map<number, Response> {
  const latest = new Map<number, Response>()
  for (const r of responses) {
    const cur = latest.get(r.itemId)
    if (!cur || r.respondedAt > cur.respondedAt || (+r.respondedAt === +cur.respondedAt && r.id > cur.id)) {
      latest.set(r.itemId, r)
    }
  }
  return latest
}

export function isComplete(item: Item, latest: Response | undefined): boolean {
  if (!latest) return false
  switch (item.responseType) {
    case "pass_fail":
      return latest.result === "pass" || latest.result === "na"
    case "measurement":
      return latest.measuredValue !== null
    case "text":
      return !!latest.notes?.trim()
  }
}

/** Whole-number percentage of items whose current response completes them. */
export function percentComplete(items: Item[], responses: Response[]): number {
  if (items.length === 0) return 0
  const latest = latestByItem(responses)
  const done = items.filter((i) => isComplete(i, latest.get(i.id))).length
  return Math.round((100 * done) / items.length)
}
```

And its tests. Note the small builders, and that each test describes one behaviour:

```ts file=src/checklist.test.ts group=testing-unit
import { describe, expect, it } from "vitest"
import { percentComplete, type Item, type Response } from "./checklist"

const item = (over: Partial<Item> = {}): Item => ({ id: 1, responseType: "pass_fail", isHoldPoint: false, ...over })

let nextId = 1
const response = (over: Partial<Response> = {}): Response => ({
  id: nextId++,
  itemId: 1,
  result: "pass",
  measuredValue: null,
  notes: null,
  respondedAt: new Date("2026-09-01T09:00:00Z"),
  ...over,
})

describe("percentComplete", () => {
  it("is 0 for a checklist with no items", () => {
    expect(percentComplete([], [])).toBe(0)
  })

  it("counts an item as complete when its latest response passes", () => {
    const items = [item({ id: 1 }), item({ id: 2 })]
    expect(percentComplete(items, [response({ itemId: 1 })])).toBe(50)
  })

  it("uses the latest response, so a fixed failure counts as complete", () => {
    const responses = [
      response({ result: "fail", respondedAt: new Date("2026-09-01T09:00:00Z") }),
      response({ result: "pass", respondedAt: new Date("2026-09-02T09:00:00Z") }),
    ]
    expect(percentComplete([item()], responses)).toBe(100)
  })

  it("treats a pass followed by a failed re-inspection as incomplete", () => {
    const responses = [
      response({ result: "pass", respondedAt: new Date("2026-09-01T09:00:00Z") }),
      response({ result: "fail", respondedAt: new Date("2026-09-02T09:00:00Z") }),
    ]
    expect(percentComplete([item()], responses)).toBe(0)
  })

  it.each([
    ["measurement with a value", item({ responseType: "measurement" }), response({ result: null, measuredValue: 55 }), 100],
    ["measurement without a value", item({ responseType: "measurement" }), response({ result: null }), 0],
    ["text with notes", item({ responseType: "text" }), response({ result: null, notes: "Docket #1" }), 100],
    ["text with only whitespace", item({ responseType: "text" }), response({ result: null, notes: "  " }), 0],
    ["pass/fail marked n/a", item(), response({ result: "na" }), 100],
  ])("%s", (_name, it_, r, expected) => {
    expect(percentComplete([it_], [r])).toBe(expected)
  })
})
```

Run `npx vitest run`. Then break `isComplete` on purpose (say, make `"na"` incomplete) and watch exactly one named test fail. That's what a useful suite feels like.

## Exercises

### Hold-point eligibility [1]

Add `canRequestSignOff(items, responses)` returning `{ ok: true }` or `{ ok: false, reason: string }`. It's not ok if any item is incomplete (reason `"3 items incomplete"`) or any hold point's latest result isn't pass/na (reason `"Hold point not released"`, which takes priority). Write the tests.

#### Solution

```ts file=src/signOffRules.ts group=testing-unit
import { isComplete, latestByItem, type Item, type Response } from "./checklist"

export type Eligibility = { ok: true } | { ok: false; reason: string }

export function canRequestSignOff(items: Item[], responses: Response[]): Eligibility {
  const latest = latestByItem(responses)
  const holdBlocked = items.some(
    (i) => i.isHoldPoint && !["pass", "na"].includes(latest.get(i.id)?.result ?? ""),
  )
  if (holdBlocked) return { ok: false, reason: "Hold point not released" }
  const incomplete = items.filter((i) => !isComplete(i, latest.get(i.id))).length
  if (incomplete > 0) return { ok: false, reason: `${incomplete} item${incomplete === 1 ? "" : "s"} incomplete` }
  return { ok: true }
}
```

```ts file=src/signOffRules.test.ts group=testing-unit
import { describe, expect, it } from "vitest"
import { canRequestSignOff } from "./signOffRules"
import type { Item, Response } from "./checklist"

const item = (id: number, over: Partial<Item> = {}): Item => ({ id, responseType: "pass_fail", isHoldPoint: false, ...over })
const pass = (itemId: number, at = "2026-09-01T09:00:00Z"): Response => ({
  id: itemId * 10, itemId, result: "pass", measuredValue: null, notes: null, respondedAt: new Date(at),
})
const fail = (itemId: number, at = "2026-09-01T09:00:00Z"): Response => ({ ...pass(itemId, at), id: itemId * 10 + 1, result: "fail" })

describe("canRequestSignOff", () => {
  it("allows a fully passed checklist", () => {
    expect(canRequestSignOff([item(1), item(2)], [pass(1), pass(2)])).toEqual({ ok: true })
  })

  it("counts incomplete items", () => {
    expect(canRequestSignOff([item(1), item(2), item(3)], [pass(1)])).toEqual({ ok: false, reason: "2 items incomplete" })
  })

  it("blocks on an unreleased hold point, ahead of other reasons", () => {
    const items = [item(1, { isHoldPoint: true }), item(2)]
    expect(canRequestSignOff(items, [fail(1)])).toEqual({ ok: false, reason: "Hold point not released" })
  })

  it("allows a hold point that failed and was then passed", () => {
    const items = [item(1, { isHoldPoint: true })]
    expect(canRequestSignOff(items, [fail(1, "2026-09-01T09:00:00Z"), pass(1, "2026-09-02T09:00:00Z")])).toEqual({ ok: true })
  })
})
```

The discriminated union return type (`{ ok: true } | { ok: false; reason }`) makes callers handle both cases. That's a TypeScript habit worth pointing out in a pairing session.

### Inject the clock and the notifier [2]

Write `remindOverdue(deps)` that loads unsigned sign-off requests from `deps.repo.listUnsigned()` and calls `deps.notify(userId, message)` once per request older than 7 days, using `deps.now()`. It returns the number of reminders sent. Test it with `vi.fn()`, with no real time and no real repo.

#### Solution

```ts file=src/remindOverdue.ts group=testing-unit
export interface UnsignedRequest {
  id: number
  lotCode: string
  requestedBy: number
  requestedAt: Date
}

export interface RemindDeps {
  now: () => Date
  repo: { listUnsigned: () => Promise<UnsignedRequest[]> }
  notify: (userId: number, message: string) => Promise<void>
}

const DAY_MS = 24 * 60 * 60 * 1000

export async function remindOverdue({ now, repo, notify }: RemindDeps): Promise<number> {
  const cutoff = now().getTime() - 7 * DAY_MS
  const overdue = (await repo.listUnsigned()).filter((r) => r.requestedAt.getTime() < cutoff)
  for (const r of overdue) {
    const days = Math.floor((now().getTime() - r.requestedAt.getTime()) / DAY_MS)
    await notify(r.requestedBy, `Sign-off for ${r.lotCode} has waited ${days} days`)
  }
  return overdue.length
}
```

```ts file=src/remindOverdue.test.ts group=testing-unit
import { expect, it, vi } from "vitest"
import { remindOverdue } from "./remindOverdue"

const NOW = new Date("2026-10-01T00:00:00Z")
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 24 * 60 * 60 * 1000)

it("notifies only requests older than seven days, with the wait in the message", async () => {
  const notify = vi.fn().mockResolvedValue(undefined)
  const repo = {
    listUnsigned: vi.fn().mockResolvedValue([
      { id: 1, lotCode: "TRC-101-L05", requestedBy: 6, requestedAt: daysAgo(12) },
      { id: 2, lotCode: "TRC-102-L07", requestedBy: 7, requestedAt: daysAgo(3) },
    ]),
  }

  const sent = await remindOverdue({ now: () => NOW, repo, notify })

  expect(sent).toBe(1)
  expect(notify).toHaveBeenCalledTimes(1)
  expect(notify).toHaveBeenCalledWith(6, "Sign-off for TRC-101-L05 has waited 12 days")
})

it("treats exactly seven days as not yet overdue", async () => {
  const notify = vi.fn()
  const repo = { listUnsigned: async () => [{ id: 1, lotCode: "X", requestedBy: 1, requestedAt: daysAgo(7) }] }
  expect(await remindOverdue({ now: () => NOW, repo, notify })).toBe(0)
  expect(notify).not.toHaveBeenCalled()
})
```

The boundary test (exactly seven days) is the one interviewers look for. `repo` here is a **stub** (canned data) and `notify` is a **mock** (we assert on its calls).

### Fake timers [2]

A `debounce(fn, ms)` helper delays calls to save the photo caption while typing. Test that three rapid calls result in one call with the last argument, after the delay, without actually waiting.

#### Solution

```ts file=src/debounce.ts group=testing-unit
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined
  return (...args: A) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
}
```

```ts file=src/debounce.test.ts group=testing-unit
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { debounce } from "./debounce"

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

it("calls once with the last arguments after the quiet period", () => {
  const save = vi.fn()
  const debounced = debounce(save, 500)

  debounced("Cr")
  debounced("Crack")
  debounced("Crack at grid C")
  expect(save).not.toHaveBeenCalled()

  vi.advanceTimersByTime(499)
  expect(save).not.toHaveBeenCalled()

  vi.advanceTimersByTime(1)
  expect(save).toHaveBeenCalledTimes(1)
  expect(save).toHaveBeenCalledWith("Crack at grid C")
})
```

Always restore real timers in `afterEach`, or later tests inherit fake time, which is a classic source of baffling failures.

## Say it aloud

"How do you make code easy to unit test? Give an example."

#### Model answer

Mainly by separating deciding from doing. I keep business rules in pure functions that take plain data and return a result, like "can this checklist be signed off" taking items and responses and returning ok or a reason. Those need no mocks, so I can cover every edge case in a few milliseconds, like a hold point that failed then passed, or exactly-seven-days boundaries. The code that has side effects, like the database, the clock, email or S3, gets passed in as dependencies instead of being imported directly. So a reminder job takes a now function, a repository and a notify function, and in the test I pass a fixed date, a stubbed repo and a vi.fn notifier I can assert on. In React it's the same idea through props or a custom hook. I avoid module-level mocking where I control the code, because it ties tests to file structure. And I keep fixtures small with builder functions, so each test shows only the data that matters to it.
