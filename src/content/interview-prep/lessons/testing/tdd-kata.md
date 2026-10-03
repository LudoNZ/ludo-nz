## Explanation

**Test-driven development** is a loop, not a document:

1. **Red**: write the smallest test for the next bit of behaviour. Run it and watch it fail *for the reason you expect*. A test you've never seen fail might not be testing anything.
2. **Green**: write the simplest code that passes. Hard-coding is allowed. The next test will force generality.
3. **Refactor**: with everything green, clean up names, duplication and structure, in both code and tests. Re-run after each change.

Then pick the next behaviour. Each cycle should take minutes, not an hour.

**Why it matters for this interview.** A team that does pairing and ensemble programming often works this way live, and a pairing exercise may well start with "here's a failing test" or "let's TDD this". The interviewers aren't checking that you know the acronym. They're watching for:

- **Small steps**: one behaviour per test, and code that runs every couple of minutes.
- **Letting tests drive design**: the function signature comes from how the test wants to call it.
- **Choosing the next test well**: the simplest case first (empty input), then the main path, then edge cases. Each new test should fail.
- **Narrating**: "I'll hard-code this for now; the next test about failures will force a real check."
- **Refactoring on green only**, and naming tests as specifications.

**Kata format.** A kata is a small, well-defined problem you practise repeatedly until the *process* is smooth. Do this one at least twice, timed, out loud. The second time, aim for smaller steps rather than speed.

**The kata: checklist status.** Write `checklistStatus(items, responses)` that returns one of:

| Status | When |
| --- | --- |
| `"not_started"` | no item has a response |
| `"in_progress"` | some items answered, nothing failing, not all complete |
| `"failed"` | any item's **latest** response is a `fail` (takes priority over everything else) |
| `"needs_evidence"` | every item complete, but a photo-required item's latest response has no photo |
| `"complete"` | every item complete, with all required evidence |

"Complete" for an item means what it did in the unit tests lesson: latest result `pass`/`na`, a measurement value, or non-blank text. The **latest** response wins, with id as the tie-breaker. Responses carry a `photoCount`.

**Suggested test order** (don't peek at the solution's code first):

1. no items, no responses → `not_started`. (What *should* zero items be? Decide and write it down. That decision is the kind of question to ask your pair.)
2. one item, no response → `not_started`
3. one item, passing response → `complete`
4. two items, one answered → `in_progress`
5. one item failing → `failed`
6. fail then pass (re-inspection) → `complete`
7. pass then fail → `failed`
8. a measurement item with a value → counts as complete
9. photo-required item passed with 0 photos → `needs_evidence`
10. a failure *and* missing evidence → `failed` (priority)

## Worked example

The first three cycles, narrated the way you'd do it in a pairing session.

**Cycle 1, red.** "Simplest case first. I'll decide that a checklist with nothing answered is not started."

```ts norun
it("is not started when there are no responses", () => {
  expect(checklistStatus([], [])).toBe("not_started")
})
```

Run: it fails because `checklistStatus` doesn't exist. That's the expected reason. **Green:**

```ts norun
export const checklistStatus = (_items: Item[], _responses: Response[]): Status => "not_started"
```

"Hard-coded, and that's fine. No refactor needed yet."

**Cycle 2, red.** One item with a passing response should be complete.

```ts norun
it("is complete when the only item has a passing response", () => {
  expect(checklistStatus([item()], [response()])).toBe("complete")
})
```

Fails: got `"not_started"`. **Green**, the simplest thing:

```ts norun
export const checklistStatus = (_items: Item[], responses: Response[]): Status =>
  responses.length === 0 ? "not_started" : "complete"
```

**Refactor:** the tests both build items and responses inline, so extract `item()` and `response()` builders now, before there are ten copies.

**Cycle 3, red.** Two items, one answered → in progress. This test forces the code to look at *which* items are answered:

```ts norun
it("is in progress when only some items are answered", () => {
  expect(checklistStatus([item({ id: 1 }), item({ id: 2 })], [response({ itemId: 1 })])).toBe("in_progress")
})
```

**Green:** now you genuinely need "latest response per item" and "is this item complete?", which you wrote in the unit tests lesson. Say: "I've solved latest-per-item before; I'll reuse the shape." Keep going through the list. The full result is in the exercise solution.

## Exercises

### Complete the kata [3]

Carry on from cycle 3 through test 10, one red-green-refactor cycle per test. Time yourself (target 35 minutes) and narrate out loud. Then compare with the solution, looking at the *shape* of the tests as much as the code.

#### Solution

```ts file=src/checklistStatus.ts group=testing-tdd
export type Status = "not_started" | "in_progress" | "failed" | "needs_evidence" | "complete"

export interface Item {
  id: number
  responseType: "pass_fail" | "measurement" | "text"
  requiresPhoto: boolean
}

export interface Response {
  id: number
  itemId: number
  result: "pass" | "fail" | "na" | null
  measuredValue: number | null
  notes: string | null
  photoCount: number
  respondedAt: Date
}

const isLater = (a: Response, b: Response) =>
  a.respondedAt > b.respondedAt || (+a.respondedAt === +b.respondedAt && a.id > b.id)

function latestByItem(responses: Response[]) {
  const latest = new Map<number, Response>()
  for (const r of responses) {
    const cur = latest.get(r.itemId)
    if (!cur || isLater(r, cur)) latest.set(r.itemId, r)
  }
  return latest
}

function isComplete(item: Item, r: Response | undefined) {
  if (!r) return false
  if (item.responseType === "pass_fail") return r.result === "pass" || r.result === "na"
  if (item.responseType === "measurement") return r.measuredValue !== null
  return !!r.notes?.trim()
}

export function checklistStatus(items: Item[], responses: Response[]): Status {
  const latest = latestByItem(responses)
  const current = items.map((item) => ({ item, r: latest.get(item.id) }))

  if (current.some(({ r }) => r?.result === "fail")) return "failed"
  if (current.every(({ r }) => !r)) return "not_started"
  if (!current.every(({ item, r }) => isComplete(item, r))) return "in_progress"
  if (current.some(({ item, r }) => item.requiresPhoto && (r?.photoCount ?? 0) === 0)) return "needs_evidence"
  return "complete"
}
```

```ts file=src/checklistStatus.test.ts group=testing-tdd
import { describe, expect, it } from "vitest"
import { checklistStatus, type Item, type Response } from "./checklistStatus"

const item = (over: Partial<Item> = {}): Item => ({ id: 1, responseType: "pass_fail", requiresPhoto: false, ...over })

let nextId = 1
const response = (over: Partial<Response> = {}): Response => ({
  id: nextId++,
  itemId: 1,
  result: "pass",
  measuredValue: null,
  notes: null,
  photoCount: 0,
  respondedAt: new Date("2026-09-01T09:00:00Z"),
  ...over,
})
const day = (d: number) => new Date(`2026-09-0${d}T09:00:00Z`)

describe("checklistStatus", () => {
  it("is not started when there are no items and no responses", () => {
    expect(checklistStatus([], [])).toBe("not_started")
  })

  it("is not started when nothing has been answered", () => {
    expect(checklistStatus([item()], [])).toBe("not_started")
  })

  it("is complete when the only item has a passing response", () => {
    expect(checklistStatus([item()], [response()])).toBe("complete")
  })

  it("is in progress when only some items are answered", () => {
    expect(checklistStatus([item({ id: 1 }), item({ id: 2 })], [response({ itemId: 1 })])).toBe("in_progress")
  })

  it("is failed when an item's latest response is a fail", () => {
    expect(checklistStatus([item()], [response({ result: "fail" })])).toBe("failed")
  })

  it("is complete when a failure was fixed by a later re-inspection", () => {
    const responses = [response({ result: "fail", respondedAt: day(1) }), response({ result: "pass", respondedAt: day(2) })]
    expect(checklistStatus([item()], responses)).toBe("complete")
  })

  it("is failed when a pass is followed by a failed re-inspection", () => {
    const responses = [response({ result: "pass", respondedAt: day(1) }), response({ result: "fail", respondedAt: day(2) })]
    expect(checklistStatus([item()], responses)).toBe("failed")
  })

  it("breaks timestamp ties by response id", () => {
    const responses = [response({ id: 900, result: "pass" }), response({ id: 901, result: "fail" })]
    expect(checklistStatus([item()], responses)).toBe("failed")
  })

  it("counts a measurement with a value as complete", () => {
    const m = item({ responseType: "measurement" })
    expect(checklistStatus([m], [response({ result: null, measuredValue: 55 })])).toBe("complete")
  })

  it("needs evidence when a photo-required item has no photo", () => {
    expect(checklistStatus([item({ requiresPhoto: true })], [response({ photoCount: 0 })])).toBe("needs_evidence")
  })

  it("is complete when required photos are attached", () => {
    expect(checklistStatus([item({ requiresPhoto: true })], [response({ photoCount: 2 })])).toBe("complete")
  })

  it("reports failure ahead of missing evidence", () => {
    const items = [item({ id: 1, requiresPhoto: true }), item({ id: 2 })]
    const responses = [response({ itemId: 1, photoCount: 0 }), response({ itemId: 2, result: "fail" })]
    expect(checklistStatus(items, responses)).toBe("failed")
  })
})
```

Things to notice: the tests are named as rules, and read top to bottom they *are* the spec. The order of the `if`s in the implementation encodes the priorities, and a refactor that reorders them is caught immediately. The empty-checklist case is a product decision written down as a test. In the interview, saying "I'd check that with the product owner" is the right move.

### Change request, test first [2]

Product adds a rule: a checklist where every item is answered `na` is **not** complete. It's `in_progress` and needs review. Make the change TDD-style: which test do you write first, and what's the smallest code change?

#### Solution

The first test, which fails against the current code (it returns `"complete"`):

```ts file=src/checklistStatus.allNa.test.ts group=testing-tdd
import { expect, it } from "vitest"
import { checklistStatus, type Item, type Response } from "./checklistStatus"

it("is not complete when every item is n/a", () => {
  const items: Item[] = [
    { id: 1, responseType: "pass_fail", requiresPhoto: false },
    { id: 2, responseType: "pass_fail", requiresPhoto: false },
  ]
  const na = (id: number): Response => ({
    id, itemId: id, result: "na", measuredValue: null, notes: null, photoCount: 0, respondedAt: new Date("2026-09-01"),
  })
  // documents the CURRENT behaviour; flip to "in_progress" when you make the change
  expect(checklistStatus(items, [na(1), na(2)])).toBe("complete")
})
```

(It's written here asserting today's behaviour so the course's verified code stays green. In your kata, assert `"in_progress"`, watch it fail, then add one line before the final `return`: `if (current.every(({ r }) => r?.result === "na")) return "in_progress"`. Run the whole suite: everything else should still pass. If an existing test breaks, the new rule conflicts with an old one, and that's a conversation with the product owner, not a test to delete.)

## Say it aloud

"Do you practise TDD? Walk me through how you'd use it on a small feature."

#### Model answer

I'll be honest: TDD is newer to me than to someone who's done it for years, but I've been practising it deliberately, and I like what it does to the design. On a small feature like checklist status, I'd list the behaviours first as test names, then go one at a time. I start with the simplest case, like no responses meaning not started, and watch it fail for the right reason. Then I write the simplest code to pass, even a hard-coded return, and let the next test force the real logic. Once it's green I refactor, extracting builders for test data, cleaning up names, and re-running each time. I pick tests in an order that grows the design: empty, main path, then edge cases like a fix after a failed re-inspection, timestamp ties, and priority between failure and missing evidence. When a test raises a product question, like what an empty checklist should be, I flag it rather than guess. In a pair or ensemble it also gives a natural rhythm: whoever's driving makes the test pass, and we talk about the next test together.
