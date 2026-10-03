## Explanation

You know React well. What's new is testing it the way the team will expect: **through the user's eyes**. React Testing Library (RTL) renders a component into a simulated DOM (jsdom) and gives you queries that find elements the way a person or a screen reader would: by role, label and text. It deliberately makes it awkward to reach into state or props. If a test needs to know a component uses `useState`, it's testing the wrong thing.

**Setup for this kind of project**, following the [Next.js Vitest guide](https://nextjs.org/docs/app/guides/testing/vitest), [jest-dom](https://github.com/testing-library/jest-dom) and [user-event](https://testing-library.com/docs/user-event/intro):

```bash
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/dom @testing-library/user-event @testing-library/jest-dom vite-tsconfig-paths
```

`vite-tsconfig-paths` makes the `@/…` import alias work in tests. jest-dom adds readable matchers (`toBeInTheDocument`, `toBeDisabled`, `toHaveTextContent`), registered for Vitest by importing `@testing-library/jest-dom/vitest` in a setup file. Next's guide notes that Vitest can't render **async Server Components**. Test client components and plain logic with Vitest, and cover async server components with E2E tests.

**Query priority.** Use the most user-facing query that works:

1. `getByRole("button", { name: /request sign-off/i })`: the best default. It also nudges you toward accessible markup.
2. `getByLabelText("Cover (mm)")`: form fields.
3. `getByText(...)`: non-interactive content.
4. `getByTestId(...)`: the last resort.

Each comes in three flavours ([about queries](https://testing-library.com/docs/queries/about)):

| | Returns | When nothing matches | Use for |
| --- | --- | --- | --- |
| `getBy…` | element | throws | things that should be there now |
| `queryBy…` | element or `null` | returns `null` | asserting something is **absent** |
| `findBy…` | Promise | rejects after a timeout (1s default) | things that appear **asynchronously** |

**User events.** `@testing-library/user-event` simulates real interactions (focus, key presses, pointer events) more faithfully than `fireEvent`. The documented pattern: call `const user = userEvent.setup()` at the start of the test, before rendering, then `await user.click(...)`, `await user.type(...)`.

**Async UI.** Anything that updates after a promise (fetching, saving) is awaited with `findBy…` or `await waitFor(() => expect(...))` ([async methods](https://testing-library.com/docs/dom-testing-library/api-async)). The "not wrapped in act(...)" warning almost always means an async update happened after your test stopped looking. Await the visible result.

**Data fetching in tests.** Three options, from simplest:

1. **Pass the async function as a prop** (or via context) and give the test a `vi.fn()` that resolves or rejects. It's simple and explicit, and it's what the examples here do.
2. **Mock the network** with a tool like Mock Service Worker, which intercepts `fetch` and lets you test the real data layer.
3. **Mock the module** with `vi.mock("./api")`. It's quick, but it couples the test to file layout.

**What to assert:** what's on screen (text, enabled or disabled, a visible error), and calls across the component's boundary (`onRequest` called once). Not internal state, not CSS classes, not snapshot dumps of a whole tree.

## Worked example

A "Request sign-off" button with eligibility, a pending state, success, a 409-style conflict and a generic error:

```tsx file=src/SignOffRequest.tsx group=testing-rtl
import { useState } from "react"

export type RequestResult = { status: "requested" } | { status: "conflict"; requestedBy: string }

interface Props {
  eligibility: { ok: true } | { ok: false; reason: string }
  onRequest: () => Promise<RequestResult>
}

export function SignOffRequest({ eligibility, onRequest }: Props) {
  const [state, setState] = useState<"idle" | "pending" | "done" | "error">("idle")
  const [message, setMessage] = useState<string | null>(null)

  const request = async () => {
    setState("pending")
    try {
      const result = await onRequest()
      setState("done")
      setMessage(result.status === "requested" ? "Sign-off requested" : `Already requested by ${result.requestedBy}`)
    } catch {
      setState("error")
      setMessage("Couldn't request sign-off. Try again.")
    }
  }

  return (
    <div>
      <button type="button" onClick={request} disabled={!eligibility.ok || state === "pending" || state === "done"}>
        {state === "pending" ? "Requesting…" : "Request sign-off"}
      </button>
      {!eligibility.ok && <p>{eligibility.reason}</p>}
      {message && <p role={state === "error" ? "alert" : "status"}>{message}</p>}
    </div>
  )
}
```

The test setup:

```ts file=vitest.config.mts group=testing-rtl
import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
  },
})
```

```ts file=vitest.setup.ts group=testing-rtl
import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach } from "vitest"

// RTL only auto-cleans when the test framework exposes a global afterEach;
// Vitest doesn't by default (globals: false), so unmount between tests here
afterEach(() => {
  cleanup()
})
```

(In this repo you'd add `tsconfigPaths()` to `plugins` too, as the Next guide shows, so `@/` imports resolve.)

```tsx file=src/SignOffRequest.test.tsx group=testing-rtl
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { SignOffRequest } from "./SignOffRequest"

describe("SignOffRequest", () => {
  it("is disabled and explains why when the checklist isn't eligible", () => {
    render(<SignOffRequest eligibility={{ ok: false, reason: "Hold point not released" }} onRequest={vi.fn()} />)

    expect(screen.getByRole("button", { name: /request sign-off/i })).toBeDisabled()
    expect(screen.getByText("Hold point not released")).toBeInTheDocument()
  })

  it("requests sign-off and confirms", async () => {
    const user = userEvent.setup()
    const onRequest = vi.fn().mockResolvedValue({ status: "requested" })
    render(<SignOffRequest eligibility={{ ok: true }} onRequest={onRequest} />)

    await user.click(screen.getByRole("button", { name: /request sign-off/i }))

    expect(await screen.findByRole("status")).toHaveTextContent("Sign-off requested")
    expect(onRequest).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("button", { name: /request sign-off/i })).toBeDisabled()
  })
})
```

The tests read like acceptance criteria. Nothing in them knows about `useState`.

## Exercises

### The pending state [1]

Test that while the request is in flight the button reads "Requesting…" and is disabled. Hint: give `onRequest` a promise you resolve yourself.

#### Solution

```tsx file=src/SignOffRequest.pending.test.tsx group=testing-rtl
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { expect, it } from "vitest"
import { SignOffRequest, type RequestResult } from "./SignOffRequest"

it("shows a disabled pending button until the request settles", async () => {
  const user = userEvent.setup()
  let resolve!: (r: RequestResult) => void
  const onRequest = () => new Promise<RequestResult>((r) => (resolve = r))
  render(<SignOffRequest eligibility={{ ok: true }} onRequest={onRequest} />)

  await user.click(screen.getByRole("button", { name: /request sign-off/i }))
  expect(screen.getByRole("button", { name: "Requesting…" })).toBeDisabled()

  resolve({ status: "requested" })
  expect(await screen.findByText("Sign-off requested")).toBeInTheDocument()
})
```

Controlling the promise yourself ("deferred") is the cleanest way to test in-between states without timers.

### Conflict and failure [2]

Write two tests: (a) when `onRequest` resolves with a conflict from "Dave Wiremu", the user sees "Already requested by Dave Wiremu"; (b) when it rejects, an **alert** appears and the button is enabled again so they can retry. Does (b) pass against the component as written?

#### Solution

```tsx file=src/SignOffRequest.errors.test.tsx group=testing-rtl
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { expect, it, vi } from "vitest"
import { SignOffRequest } from "./SignOffRequest"

it("explains a conflict", async () => {
  const user = userEvent.setup()
  const onRequest = vi.fn().mockResolvedValue({ status: "conflict", requestedBy: "Dave Wiremu" })
  render(<SignOffRequest eligibility={{ ok: true }} onRequest={onRequest} />)

  await user.click(screen.getByRole("button", { name: /request sign-off/i }))

  expect(await screen.findByText("Already requested by Dave Wiremu")).toBeInTheDocument()
})

it("shows an alert and allows a retry when the request fails", async () => {
  const user = userEvent.setup()
  const onRequest = vi.fn().mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce({ status: "requested" })
  render(<SignOffRequest eligibility={{ ok: true }} onRequest={onRequest} />)

  await user.click(screen.getByRole("button", { name: /request sign-off/i }))
  expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't request/i)

  const button = screen.getByRole("button", { name: /request sign-off/i })
  expect(button).toBeEnabled()
  await user.click(button)
  expect(await screen.findByRole("status")).toHaveTextContent("Sign-off requested")
  expect(onRequest).toHaveBeenCalledTimes(2)
})
```

Yes: the `"error"` state isn't in the disabled condition, so the retry works. If you'd written `disabled={state !== "idle"}`, this test would catch the bug. `mockRejectedValueOnce(...).mockResolvedValueOnce(...)` scripts successive calls.

### A form with validation [3]

Build and test a `MeasurementInput` for "Cover to reinforcement (mm)": a labelled number input and a Save button. Saving calls `onSave(value)` with a number. Empty input or a value outside 20–150 shows "Enter a value between 20 and 150" and doesn't call `onSave`. Query by label, not test id.

#### Solution

```tsx file=src/MeasurementInput.tsx group=testing-rtl
import { useId, useState } from "react"

interface Props {
  label: string
  min: number
  max: number
  onSave: (value: number) => void
}

export function MeasurementInput({ label, min, max, onSave }: Props) {
  const id = useId()
  const [raw, setRaw] = useState("")
  const [error, setError] = useState<string | null>(null)

  const save = () => {
    const value = Number(raw)
    if (raw.trim() === "" || !Number.isFinite(value) || value < min || value > max) {
      setError(`Enter a value between ${min} and ${max}`)
      return
    }
    setError(null)
    onSave(value)
  }

  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <input id={id} type="number" value={raw} onChange={(e) => setRaw(e.target.value)} aria-invalid={!!error} />
      <button type="button" onClick={save}>
        Save
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  )
}
```

```tsx file=src/MeasurementInput.test.tsx group=testing-rtl
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { MeasurementInput } from "./MeasurementInput"

const setup = () => {
  const user = userEvent.setup()
  const onSave = vi.fn()
  render(<MeasurementInput label="Cover to reinforcement (mm)" min={20} max={150} onSave={onSave} />)
  const input = screen.getByLabelText("Cover to reinforcement (mm)")
  const save = screen.getByRole("button", { name: "Save" })
  return { user, onSave, input, save }
}

describe("MeasurementInput", () => {
  it("saves a valid number", async () => {
    const { user, onSave, input, save } = setup()
    await user.type(input, "55")
    await user.click(save)
    expect(onSave).toHaveBeenCalledWith(55)
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  it.each(["", "5", "400"])("rejects %j", async (value) => {
    const { user, onSave, input, save } = setup()
    if (value) await user.type(input, value)
    await user.click(save)
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a value between 20 and 150")
    expect(input).toHaveAttribute("aria-invalid", "true")
    expect(onSave).not.toHaveBeenCalled()
  })
})
```

`queryByRole` is used to assert *absence*. `getByLabelText` only works because the label is properly associated with the input (`htmlFor` and `useId`), so the test enforces accessibility for free. A small `setup()` helper keeps each test focused. It runs inside the test, which is what user-event's docs recommend.

## Say it aloud

"How do you test React components? What do you avoid?"

#### Model answer

I use React Testing Library with Vitest and jsdom, and I test the component the way a user experiences it. I render it, find elements by role and accessible name or by label, interact with user-event, and assert on what's visible: text, enabled and disabled states, alerts, and calls to callbacks passed in as props. For async behaviour I await the visible result with findBy, or control the promise myself to check in-between states like a pending button. I keep data fetching injectable, either as a prop or via a mock server, so tests are deterministic. What I avoid is asserting on implementation details like state variables, hook calls, CSS classes or big snapshots, because those break on refactors without catching real bugs. A nice side effect of querying by role and label is that inaccessible markup is hard to test, so the tests push the components toward being accessible. Async server components I'd cover with end-to-end tests, since Vitest can't render them.
