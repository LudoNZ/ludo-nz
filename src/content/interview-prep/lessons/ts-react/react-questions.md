## Explanation

You know React. The risk in an interview is answering from habit ("I'd add a useEffect") rather than from the model interviewers want to hear. Here are the five topics that come up most, with the crisp version of each answer.

**1. Effects.** `useEffect` is for *synchronising with something outside React*: a subscription, a timer, the DOM, a network request. It's not a general "run when X changes" hook. The questions:

- *Dependencies*: every reactive value the effect reads goes in the array. The lint rule is right far more often than it's wrong. If adding a dependency causes a loop, the effect is probably doing something it shouldn't.
- *Cleanup*: return a function that undoes the effect (unsubscribe, clear the interval, abort the fetch). In development, Strict Mode deliberately mounts, unmounts and re-mounts components to surface missing cleanup.
- *You might not need an effect* ([react.dev](https://react.dev/learn/you-might-not-need-an-effect)): derived values should be computed during render, not copied into state with an effect. Responding to a user action belongs in the event handler. Resetting state when a prop changes is done with a `key`.

**2. Keys.** Keys tell React which item is which across renders, so state and DOM nodes stay attached to the right item ([preserving and resetting state](https://react.dev/learn/preserving-and-resetting-state)). Use a stable id from the data. The array index is wrong whenever items can be inserted, removed or reordered: state such as a half-typed note sticks to the *position*, not the item. Changing a component's `key` deliberately remounts it, which is the clean way to reset a form when you switch to a different checklist.

**3. Memoisation.** `useMemo` caches a computed value, `useCallback` caches a function identity, and `React.memo` skips re-rendering a component when its props are shallowly equal ([useMemo](https://react.dev/reference/react/useMemo), [memo](https://react.dev/reference/react/memo)). They're optimisations: use them when you've measured an expensive computation or a costly re-render, or when a stable identity matters (an effect dependency, a memoised child's prop). Wrapping everything adds noise for little gain. The [React Compiler](https://react.dev/learn/react-compiler) can add memoisation automatically, which shifts the emphasis further toward writing plain, pure components.

**4. Custom hooks.** A function starting with `use` that calls other hooks, to *reuse stateful logic* (not UI) ([reusing logic](https://react.dev/learn/reusing-logic-with-custom-hooks)). Each component calling it gets its own state. Good hooks have a narrow, named purpose (`useDebouncedValue`, `useOnlineStatus`, `useChecklist(id)`) and hide effects behind a simple API. They're also where you put the fetch-race and cleanup logic once, correctly.

**5. Data fetching.** Fetching in an effect has pitfalls you should name: **race conditions** (a slow response for the *previous* id arrives after the new one and overwrites it), no caching or deduplication, loading and error states to manage, and waterfalls. The fix in a hand-written effect is an `ignore` flag or `AbortController` in the cleanup. In real apps, prefer a data library (TanStack Query, SWR) for caching, retries and invalidation, or framework data loading: in Next.js App Router, fetch in Server Components and pass data down. You've done all of these. Say which you'd choose and *why*.

**React 19 points worth knowing:** Actions and `useActionState` for form submissions, `useOptimistic` for instant UI updates that roll back on failure, and `use()` to read a promise or context. Mention them if relevant, but don't lead with them.

## Worked example

A hook that loads a checklist's responses safely: it ignores stale responses, reports errors, and lets you inject the fetcher for tests.

```tsx file=src/useResponses.ts group=react-q
import { useEffect, useState } from "react"

export interface ResponseRow {
  id: number
  itemId: number
  result: string | null
}

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; responses: ResponseRow[] }

export function useResponses(lotChecklistId: number, fetchResponses: (id: number) => Promise<ResponseRow[]>): State {
  const [state, setState] = useState<State>({ status: "loading" })

  useEffect(() => {
    let ignore = false // set by cleanup when the id changes or the component unmounts
    setState({ status: "loading" })
    fetchResponses(lotChecklistId).then(
      (responses) => {
        if (!ignore) setState({ status: "ready", responses })
      },
      (err: unknown) => {
        if (!ignore) setState({ status: "error", message: err instanceof Error ? err.message : "Failed to load" })
      },
    )
    return () => {
      ignore = true
    }
  }, [lotChecklistId, fetchResponses])

  return state
}
```

The test that proves the race is handled: request A is slow, the user switches to B, B resolves, *then* A resolves. The screen must show B.

```tsx file=src/useResponses.test.tsx group=react-q
import { act, render, screen } from "@testing-library/react"
import { expect, it } from "vitest"
import { useResponses, type ResponseRow } from "./useResponses"

function Viewer({ id, fetcher }: { id: number; fetcher: (id: number) => Promise<ResponseRow[]> }) {
  const state = useResponses(id, fetcher)
  if (state.status === "loading") return <p>Loading…</p>
  if (state.status === "error") return <p role="alert">{state.message}</p>
  return <p>Checklist {id}: {state.responses.length} responses</p>
}

it("ignores a slow response for a checklist the user has left", async () => {
  const pending = new Map<number, (rows: ResponseRow[]) => void>()
  const fetcher = (id: number) => new Promise<ResponseRow[]>((resolve) => pending.set(id, resolve))

  const { rerender } = render(<Viewer id={1} fetcher={fetcher} />)
  rerender(<Viewer id={2} fetcher={fetcher} />)

  await act(async () => pending.get(2)!([{ id: 10, itemId: 1, result: "pass" }]))
  await act(async () => pending.get(1)!([{ id: 1, itemId: 1, result: "pass" }, { id: 2, itemId: 2, result: "fail" }]))

  expect(screen.getByText("Checklist 2: 1 responses")).toBeInTheDocument()
})
```

`fetcher` is defined once outside the components, so its identity is stable. If a parent passed `(id) => api.get(id)` inline on every render, the effect would re-run every render. That's when `useCallback` earns its place, and a good thing to explain if asked "when would you use useCallback?".

(This group uses the same `vitest.config.mts` and `vitest.setup.ts` as the React Testing Library lesson.)

```ts file=vitest.config.mts group=react-q
import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  test: { environment: "jsdom", setupFiles: ["./vitest.setup.ts"] },
})
```

```ts file=vitest.setup.ts group=react-q
import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach } from "vitest"

afterEach(() => {
  cleanup()
})
```

## Exercises

### The index-key bug [2]

A list of defect notes renders `notes.map((n, i) => <NoteRow key={i} … />)`, where `NoteRow` keeps a local "editing" draft in state. Users report that after deleting the first note, the draft they were typing in note 2 appears under note 3. Explain why, fix it, and write a test that would have caught it.

#### Solution

With index keys, deleting item 0 makes the old item 1 render at index 0, so React reuses index 1's component, *with its state*, for what is now a different note. State follows the key, and the key followed the position. Fix: key by the note's stable id.

```tsx file=src/NoteList.tsx group=react-q
import { useState } from "react"

export interface Note {
  id: string
  text: string
}

function NoteRow({ note, onDelete }: { note: Note; onDelete: () => void }) {
  const [draft, setDraft] = useState(note.text)
  return (
    <li>
      <input aria-label={`Note ${note.id}`} value={draft} onChange={(e) => setDraft(e.target.value)} />
      <button type="button" onClick={onDelete}>
        Delete {note.id}
      </button>
    </li>
  )
}

export function NoteList({ initial }: { initial: Note[] }) {
  const [notes, setNotes] = useState(initial)
  return (
    <ul>
      {notes.map((n) => (
        <NoteRow key={n.id} note={n} onDelete={() => setNotes((ns) => ns.filter((x) => x.id !== n.id))} />
      ))}
    </ul>
  )
}
```

```tsx file=src/NoteList.test.tsx group=react-q
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { expect, it } from "vitest"
import { NoteList } from "./NoteList"

it("keeps an in-progress edit with its note when an earlier note is deleted", async () => {
  const user = userEvent.setup()
  render(<NoteList initial={[{ id: "a", text: "Crack" }, { id: "b", text: "Honeycomb" }, { id: "c", text: "Spalling" }]} />)

  await user.type(screen.getByLabelText("Note b"), " at grid C")
  await user.click(screen.getByRole("button", { name: "Delete a" }))

  expect(screen.getByLabelText("Note b")).toHaveValue("Honeycomb at grid C")
  expect(screen.getByLabelText("Note c")).toHaveValue("Spalling")
})
```

With `key={i}` this test fails. Try it: the label follows the props, but the input's value follows the state at that *position*. "Note b" now shows "Crack" (the deleted note's text), and your "Honeycomb at grid C" edit has moved to the row labelled "Note c". That's exactly the user's bug report.

### Remove the unnecessary effect [1]

What's wrong with this, and what's the fix?

```tsx norun
const [items, setItems] = useState<Item[]>([])
const [percent, setPercent] = useState(0)
useEffect(() => {
  setPercent(Math.round((100 * items.filter((i) => i.done).length) / Math.max(items.length, 1)))
}, [items])
```

#### Solution

`percent` is *derived* from `items`, so storing it in state means an extra render (render with the stale percent, run the effect, render again) and a second source of truth that can drift. Compute it during render:

```tsx norun
const percent = Math.round((100 * items.filter((i) => i.done).length) / Math.max(items.length, 1))
```

Only reach for `useMemo` if the calculation is measurably expensive. Filtering a checklist isn't.

### A custom hook: debounced value [2]

Write `useDebouncedValue(value, ms)` that returns `value` only after it hasn't changed for `ms`, for a lot-search box that shouldn't query on every keystroke. Test it with fake timers.

#### Solution

```tsx file=src/useDebouncedValue.ts group=react-q
import { useEffect, useState } from "react"

export function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t) // a newer value cancels the pending update
  }, [value, ms])
  return debounced
}
```

```tsx file=src/useDebouncedValue.test.tsx group=react-q
import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { useDebouncedValue } from "./useDebouncedValue"

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

it("only updates after the value settles", () => {
  const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 300), { initialProps: { v: "s" } })

  rerender({ v: "sl" })
  rerender({ v: "slab" })
  act(() => {
    vi.advanceTimersByTime(299)
  })
  expect(result.current).toBe("s")

  act(() => {
    vi.advanceTimersByTime(1)
  })
  expect(result.current).toBe("slab")
})
```

`renderHook` renders a hook inside a throwaway test component. The generic `<T>` means the hook works for strings, numbers or filter objects, and the cleanup function is what makes it a debounce rather than a delay.

## Say it aloud

"How do you fetch data in React, and what can go wrong?"

#### Model answer

It depends on the app. In Next.js App Router I'd fetch in a Server Component where I can, so the data arrives with the page and there's no client waterfall. On the client, for anything non-trivial, I'd use a library like TanStack Query, which gives caching, deduplication, retries, and invalidation after mutations. If I'm writing it by hand in an effect, the things that go wrong are race conditions, where a slow response for the previous id arrives last and overwrites the current data. I handle that with an ignore flag or an AbortController in the effect's cleanup. Then missing loading and error states, refetching on every render because a dependency like an inline function changes identity, and request waterfalls where children wait on parents. I put that logic in a custom hook with a small typed state, like loading, error or ready as a discriminated union, so components just render the state. And I test it, including the race, by controlling when each promise resolves.
