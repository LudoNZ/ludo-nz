## Explanation

A 30-minute rehearsal of the live pairing exercise. Conditions: **no AI tools**, a visible timer, talking the whole time, and ideally a friend as the "interviewer" who reads the brief, answers clarifying questions from the cheat sheet below, and drops in the two change requests at the times shown. Solo? Record your screen and audio, and read the change requests yourself at those times.

**Setup (before starting the timer):** an empty folder with `npm init -y`, `npm i -D vitest typescript @types/node`, an empty `src/closeout.ts` and `src/closeout.test.ts`, and `npx vitest` running in watch mode.

**The brief (read it aloud, then start the timer):**

> "Site managers want a close-out summary for a lot. Write `closeoutSummary(lot)` that takes a lot with its checklists (each with items and responses) and its sign-off requests, and returns: whether the lot can be closed, and if not, a list of human-readable reasons. A lot can close when every checklist is complete and fully signed off."

**Interviewer's cheat sheet** (answers only if asked; not asking is the thing being scored):

- *What counts as complete?* Latest response per item: pass/na for pass/fail items, a value for measurements, non-blank notes for text.
- *Latest how?* By `respondedAt`, ties by higher id.
- *Signed off?* Has at least one sign-off request, and all of them are signed.
- *A lot with no checklists?* Can't close: reason "No checklists".
- *Reason format?* One per problem, like `"Pre-pour inspection: 2 items incomplete"` and `"Pre-pour inspection: awaiting engineer sign-off"`.
- *Input shape?* Up to you, so propose one.

**Change requests:**
- **At 15 minutes:** "Hold points: if a hold-point item's latest result is a fail, the reason should say `"<checklist>: hold point failed: <prompt>"`, listed before other reasons for that checklist."
- **At 22 minutes:** "Product says a lot that's been closeable for more than 14 days should also return `overdue: true`. Can you add that?" (You'll need *when* it became closeable. Notice it, and say what data you'd need. Partial delivery is fine.)

**What's being scored** (rate yourself 1–3 on each afterwards): clarified before coding · proposed types first · first test within 5 minutes · small steps, tests run often · handled change requests calmly, re-planning out loud · code readable · narration continuous · summary at the end.

## Worked example

A strong first five minutes, condensed:

1. Ask four or five clarifying questions (complete? latest? signed off? empty lot? reason format?).
2. Propose the types out loud and type them:

```ts norun
type Result = "pass" | "fail" | "na" | null
interface Item { id: number; prompt: string; type: "pass_fail" | "measurement" | "text"; isHoldPoint: boolean }
interface Resp { id: number; itemId: number; result: Result; value: number | null; notes: string | null; respondedAt: Date }
interface SignOff { role: "foreman" | "engineer"; signedAt: Date | null }
interface Checklist { name: string; items: Item[]; responses: Resp[]; signOffs: SignOff[] }
interface Summary { canClose: boolean; reasons: string[] }
```

3. First test: `closeoutSummary({ checklists: [] })` gives `{ canClose: false, reasons: ["No checklists"] }`. Make it pass with the simplest code.
4. Say the plan: "Next a fully complete, signed-off checklist → canClose true. Then incomplete items, then sign-offs. Hold points if we get to them."

## Exercises

### Run the round (30 min) [3]

Do the full exercise under the conditions above, including both change requests. Then compare with the reference solution and score yourself.

#### Solution

A reference solution at about the 25-minute mark, including the hold-point change. The `overdue` request is answered in conversation (see below).

```ts file=src/closeout.ts group=mock-pairing
export type Result = "pass" | "fail" | "na" | null

export interface Item {
  id: number
  prompt: string
  type: "pass_fail" | "measurement" | "text"
  isHoldPoint: boolean
}
export interface Resp {
  id: number
  itemId: number
  result: Result
  value: number | null
  notes: string | null
  respondedAt: Date
}
export interface SignOff {
  role: "foreman" | "engineer"
  signedAt: Date | null
}
export interface Checklist {
  name: string
  items: Item[]
  responses: Resp[]
  signOffs: SignOff[]
}
export interface Summary {
  canClose: boolean
  reasons: string[]
}

function latestByItem(responses: Resp[]): Map<number, Resp> {
  const latest = new Map<number, Resp>()
  for (const r of responses) {
    const cur = latest.get(r.itemId)
    if (!cur || r.respondedAt > cur.respondedAt || (+r.respondedAt === +cur.respondedAt && r.id > cur.id)) latest.set(r.itemId, r)
  }
  return latest
}

function isComplete(item: Item, r: Resp | undefined): boolean {
  if (!r) return false
  if (item.type === "pass_fail") return r.result === "pass" || r.result === "na"
  if (item.type === "measurement") return r.value !== null
  return !!r.notes?.trim()
}

function checklistReasons(c: Checklist): string[] {
  const latest = latestByItem(c.responses)
  const reasons: string[] = []

  for (const item of c.items) {
    if (item.isHoldPoint && latest.get(item.id)?.result === "fail") reasons.push(`${c.name}: hold point failed: ${item.prompt}`)
  }

  const incomplete = c.items.filter((i) => !isComplete(i, latest.get(i.id))).length
  if (incomplete > 0) reasons.push(`${c.name}: ${incomplete} item${incomplete === 1 ? "" : "s"} incomplete`)

  if (c.signOffs.length === 0) reasons.push(`${c.name}: sign-off not requested`)
  for (const s of c.signOffs) if (!s.signedAt) reasons.push(`${c.name}: awaiting ${s.role} sign-off`)

  return reasons
}

export function closeoutSummary(lot: { checklists: Checklist[] }): Summary {
  if (lot.checklists.length === 0) return { canClose: false, reasons: ["No checklists"] }
  const reasons = lot.checklists.flatMap(checklistReasons)
  return { canClose: reasons.length === 0, reasons }
}
```

```ts file=src/closeout.test.ts group=mock-pairing
import { describe, expect, it } from "vitest"
import { closeoutSummary, type Checklist, type Item, type Resp } from "./closeout"

const item = (id: number, over: Partial<Item> = {}): Item => ({ id, prompt: `Item ${id}`, type: "pass_fail", isHoldPoint: false, ...over })
let nextId = 1
const resp = (itemId: number, over: Partial<Resp> = {}): Resp => ({
  id: nextId++,
  itemId,
  result: "pass",
  value: null,
  notes: null,
  respondedAt: new Date("2026-09-01T09:00:00Z"),
  ...over,
})
const checklist = (over: Partial<Checklist> = {}): Checklist => ({
  name: "Pre-pour inspection",
  items: [item(1), item(2)],
  responses: [resp(1), resp(2)],
  signOffs: [{ role: "engineer", signedAt: new Date("2026-09-02T09:00:00Z") }],
  ...over,
})

describe("closeoutSummary", () => {
  it("can't close a lot with no checklists", () => {
    expect(closeoutSummary({ checklists: [] })).toEqual({ canClose: false, reasons: ["No checklists"] })
  })

  it("closes when every checklist is complete and signed off", () => {
    expect(closeoutSummary({ checklists: [checklist()] })).toEqual({ canClose: true, reasons: [] })
  })

  it("explains incomplete items and missing sign-offs", () => {
    const c = checklist({ responses: [resp(1)], signOffs: [{ role: "engineer", signedAt: null }] })
    expect(closeoutSummary({ checklists: [c] }).reasons).toEqual([
      "Pre-pour inspection: 1 item incomplete",
      "Pre-pour inspection: awaiting engineer sign-off",
    ])
  })

  it("requires a sign-off request to exist", () => {
    expect(closeoutSummary({ checklists: [checklist({ signOffs: [] })] }).reasons).toEqual(["Pre-pour inspection: sign-off not requested"])
  })

  it("uses the latest response, so a fixed failure is complete", () => {
    const c = checklist({
      responses: [
        resp(1, { result: "fail", respondedAt: new Date("2026-09-01T09:00:00Z") }),
        resp(1, { result: "pass", respondedAt: new Date("2026-09-01T12:00:00Z") }),
        resp(2),
      ],
    })
    expect(closeoutSummary({ checklists: [c] }).canClose).toBe(true)
  })

  it("lists a failed hold point first (change request 1)", () => {
    const c = checklist({
      items: [item(1, { isHoldPoint: true, prompt: "Engineer's pre-pour inspection complete" }), item(2)],
      responses: [resp(1, { result: "fail" }), resp(2)],
    })
    expect(closeoutSummary({ checklists: [c] }).reasons).toEqual([
      "Pre-pour inspection: hold point failed: Engineer's pre-pour inspection complete",
      "Pre-pour inspection: 1 item incomplete",
    ])
  })
})
```

**The overdue change request**, answered in conversation: "To know a lot has been closeable for 14 days, I need *when* it became closeable, which is the latest of its sign-off times (and the last response time). I can derive that from the data we have: `max(signedAt)` across all sign-offs when `canClose` is true. I'd add a `now` parameter so it's testable, return `closeableSince`, and compute `overdue` from it. Shall I do that now, or wrap up?" That's a better answer than silently hacking it in, because it surfaces the data dependency and keeps time visible.

**Self-review prompts:** Did you ask about the empty lot, or discover it from a failing test? Did you propose the types before writing logic? How long until your first green test? When the hold-point request came in, did you re-plan out loud? Did you summarise at the end?

## Say it aloud

"We're out of time. Give me a one-minute summary of where you got to."

#### Model answer

"Where we got to: closeoutSummary returns whether a lot can close and a list of readable reasons. It handles the empty lot, incomplete items using the latest response per item with a tie-break on id, sign-offs not requested or still awaiting a role, and the hold-point change, where a failed hold point is listed first for its checklist. There are six tests covering those, and they're all green. Not done: the overdue flag. I'd derive 'closeable since' from the latest sign-off time, pass in now so it's testable, and add tests either side of the 14-day boundary. Things I'd raise: the reasons are plain strings, which is fine for display, but if the UI needs to link to the problem item, I'd return structured reasons with a type and an id and format them in the UI. And if this runs over many lots, I'd push it into SQL, since it's essentially the lot-readiness query from earlier."
