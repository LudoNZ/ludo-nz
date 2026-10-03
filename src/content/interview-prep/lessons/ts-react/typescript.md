## Explanation

You use TypeScript daily, so this lesson is about explaining it crisply and handling the type-level questions that come up in pairing. Interviewers typically probe four areas.

**1. Unions and narrowing.** A union (`A | B`) says a value is one of several shapes. *Narrowing* is TypeScript following your control flow to work out which one you have ([narrowing handbook](https://www.typescriptlang.org/docs/handbook/2/narrowing.html)):

- `typeof x === "string"`, `Array.isArray(x)`, `x instanceof Date`
- `"signedAt" in x` (property check)
- **Discriminated unions**: every member has a literal `kind`/`status` field, and a `switch` on it narrows each branch. This is the single most useful pattern: API results, state machines, events.
- **Exhaustiveness**: in the `default` branch, assign to `never`. Add a new member and the compiler shows you every switch that forgot it.
- **Custom type guards**: `function isSigned(s: SignOff): s is SignedSignOff { … }` teaches the compiler your own check.

**2. Generics.** Functions and types parameterised by a type, so they keep precise types instead of falling back to `any` ([generics handbook](https://www.typescriptlang.org/docs/handbook/2/generics.html)). `function groupBy<T, K extends PropertyKey>(items: T[], key: (t: T) => K): Record<K, T[]>`: the caller's types flow through. Constraints (`K extends PropertyKey`, `T extends { id: number }`) say what the generic code relies on. You saw one in `withTransaction<T>`. React's `useState<T>` and `pg`'s `query<Row>` are generics you use every day.

**3. Utility types** ([reference](https://www.typescriptlang.org/docs/handbook/utility-types.html)):

| Type | Gives you | Typical use |
| --- | --- | --- |
| `Partial<T>` / `Required<T>` | all optional / all required | patch payloads, test builders (`item(over: Partial<Item>)`) |
| `Pick<T, K>` / `Omit<T, K>` | subset / without | `Omit<SignOff, "id">` for create inputs. `Pick<PoolClient, "query">` for narrow dependencies |
| `Record<K, V>` | object with keys K | lookup maps, `Record<Status, string>` labels (exhaustive!) |
| `Readonly<T>` | no reassignment | config, props |
| `ReturnType<F>` / `Parameters<F>` / `Awaited<T>` | types derived from functions | typing what a function returns without repeating it |
| `Extract<U, X>` / `Exclude<U, X>` | filter union members | `Extract<Result, { ok: true }>` |
| `NonNullable<T>` | removes null/undefined | after a check |

**4. `unknown` vs `any`, and boundaries.** `any` switches type checking off, and it spreads. `unknown` says "I don't know yet" and forces you to narrow before use. Data crossing a boundary (`JSON.parse`, request bodies, `localStorage`, database rows) is `unknown` until validated. That's where a schema library like Zod fits: parse once at the edge, then trust the types inside. TypeScript types vanish at runtime, which is a common interview point.

**Other phrases to have ready:** `as const` (narrowest literal types, readonly), `satisfies` (check a value against a type without widening its inferred type), structural typing ("if it has the shape, it fits"), `interface` vs `type` (interfaces merge and extend nicely for object shapes; `type` handles unions and mapped types. Pick one convention and be consistent).

## Worked example

A discriminated union for a sign-off's lifecycle, with exhaustive handling and a type guard:

```ts file=src/signOffState.ts group=ts-types
export type SignOffState =
  | { status: "draft" }
  | { status: "requested"; requestedBy: string; requestedAt: Date }
  | { status: "signed"; requestedBy: string; signedBy: string; signedAt: Date }
  | { status: "rejected"; rejectedBy: string; reason: string }

export function label(s: SignOffState): string {
  switch (s.status) {
    case "draft":
      return "Not requested"
    case "requested":
      return `Waiting since ${s.requestedAt.toISOString().slice(0, 10)}` // s narrowed: requestedAt exists
    case "signed":
      return `Signed by ${s.signedBy}`
    case "rejected":
      return `Rejected: ${s.reason}`
    default: {
      const unreachable: never = s // compile error here if a status is added but not handled
      return unreachable
    }
  }
}

export const isSigned = (s: SignOffState): s is Extract<SignOffState, { status: "signed" }> => s.status === "signed"
```

A generic, constrained helper you might be asked to write live:

```ts file=src/groupBy.ts group=ts-types
export function groupBy<T, K extends PropertyKey>(items: readonly T[], key: (item: T) => K): Partial<Record<K, T[]>> {
  const out: Partial<Record<K, T[]>> = {}
  for (const item of items) {
    const k = key(item)
    ;(out[k] ??= []).push(item)
  }
  return out
}
```

`Partial<Record<…>>` is honest: not every possible key will be present. Type-level behaviour can be tested too. Vitest's `expectTypeOf` checks types at compile time:

```ts file=src/types.test.ts group=ts-types
import { describe, expect, expectTypeOf, it } from "vitest"
import { groupBy } from "./groupBy"
import { isSigned, label, type SignOffState } from "./signOffState"

describe("types", () => {
  it("groupBy keeps the item and key types", () => {
    const lots = [
      { code: "L01", project: "TRC-101" },
      { code: "L02", project: "TRC-102" },
      { code: "L03", project: "TRC-101" },
    ] as const
    const byProject = groupBy(lots, (l) => l.project)
    expectTypeOf(byProject).toEqualTypeOf<Partial<Record<"TRC-101" | "TRC-102", (typeof lots)[number][]>>>()
    expect(byProject["TRC-101"]?.map((l) => l.code)).toEqual(["L01", "L03"])
  })

  it("the guard narrows", () => {
    const s: SignOffState = { status: "signed", requestedBy: "dave", signedBy: "chloe", signedAt: new Date() }
    if (isSigned(s)) expectTypeOf(s.signedBy).toEqualTypeOf<string>()
    expect(label(s)).toBe("Signed by chloe")
  })
})
```

## Exercises

### Make illegal states unrepresentable [2]

This type allows nonsense, such as `signedBy` set but `signedAt` missing, or a `fail` with a `measuredValue`. Rewrite it as a discriminated union so those can't be constructed, then write a function `summary(r)` that handles every case.

```ts norun
interface Response {
  kind: "pass_fail" | "measurement" | "text"
  result?: "pass" | "fail" | "na"
  measuredValue?: number
  unit?: string
  notes?: string
}
```

#### Solution

```ts file=src/response.ts group=ts-types
export type Response =
  | { kind: "pass_fail"; result: "pass" | "fail" | "na"; notes?: string }
  | { kind: "measurement"; measuredValue: number; unit: "mm" | "%" | "kPa" | "hours" }
  | { kind: "text"; notes: string }

export function summary(r: Response): string {
  switch (r.kind) {
    case "pass_fail":
      return r.result === "fail" ? `FAIL${r.notes ? `: ${r.notes}` : ""}` : r.result.toUpperCase()
    case "measurement":
      return `${r.measuredValue} ${r.unit}`
    case "text":
      return r.notes
  }
}

// @ts-expect-error a measurement can't carry a pass/fail result
export const invalid: Response = { kind: "measurement", measuredValue: 55, unit: "mm", result: "pass" }
```

The `// @ts-expect-error` line is itself a test: the file only compiles if that line *is* an error. Because `summary` has an explicit `string` return type and covers every `kind`, TypeScript knows the switch is exhaustive without a `default`. Remove a case and it complains that not all paths return a value.

### Type a narrow dependency [2]

You want `notifyOverdue(deps)` to accept anything with a `listUnsigned()` method returning sign-offs, and a `send` function. A teammate typed `deps: any`. Write a better type using utility types, so a full repository object *or* a tiny test stub both fit, but a stub with the wrong return type doesn't.

#### Solution

```ts file=src/deps.ts group=ts-types
export interface SignOffRepository {
  listUnsigned(): Promise<{ id: number; requestedBy: string }[]>
  sign(id: number, by: string): Promise<void>
  get(id: number): Promise<{ id: number } | undefined>
}

export type NotifyDeps = {
  repo: Pick<SignOffRepository, "listUnsigned">
  send: (to: string, message: string) => Promise<void>
}

export async function notifyOverdue({ repo, send }: NotifyDeps): Promise<number> {
  const pending = await repo.listUnsigned()
  await Promise.all(pending.map((p) => send(p.requestedBy, `Sign-off ${p.id} is waiting`)))
  return pending.length
}

// a minimal stub is enough
export const stubDeps: NotifyDeps = {
  repo: { listUnsigned: async () => [{ id: 1, requestedBy: "dave" }] },
  send: async () => {},
}

export const badDeps: NotifyDeps = {
  // @ts-expect-error wrong item shape: requestedBy must be a string
  repo: { listUnsigned: async () => [{ id: 1, requestedBy: 42 }] },
  send: async () => {},
}
```

`Pick<SignOffRepository, "listUnsigned">` says "I need only this method". The real repository is structurally compatible, and test doubles stay tiny. It's the type-level version of the interface segregation principle, and it's why the course's handlers took `Pick<PoolClient, "query">`.

### Derive, don't repeat [1]

Given `const STATUSES = ["not_started", "in_progress", "failed", "complete"]`, derive a `Status` union type from the array, and type a `labels` object that *must* have a label for every status.

#### Solution

```ts file=src/statuses.ts group=ts-types
export const STATUSES = ["not_started", "in_progress", "failed", "complete"] as const
export type Status = (typeof STATUSES)[number] // "not_started" | "in_progress" | "failed" | "complete"

export const labels = {
  not_started: "Not started",
  in_progress: "In progress",
  failed: "Failed",
  complete: "Complete",
} satisfies Record<Status, string>
```

`as const` keeps the array's literal types, `(typeof X)[number]` turns the array into a union, and `satisfies Record<Status, string>` checks every key is present (and no extras) while keeping `labels`' own precise type. Add a status to the array and `labels` stops compiling until you add its label. One source of truth for runtime values and types.

## Say it aloud

"What's a discriminated union and why do you use them? And when would you reach for generics?"

#### Model answer

A discriminated union is a union of object types that share a literal field, like status, whose value tells you which member you have. When I switch on that field, TypeScript narrows each branch, so in the "signed" case it knows signedBy and signedAt exist, and in "draft" it knows they don't. I use them to make illegal states unrepresentable: a sign-off can't have a signer without a signed date, and an API result is either ok with data or an error with a message, never half of each. Adding a never check in the default branch makes the switch exhaustive, so adding a new status shows me every place that needs updating. Generics are for code that works across types while keeping them precise. A groupBy, a typed transaction helper that returns whatever the callback returns, or a typed query function. I add constraints to say what the generic code relies on, like the key being a property key. And at the boundaries, like request bodies, JSON or database rows, I treat data as unknown and validate it, because the types don't exist at runtime.
