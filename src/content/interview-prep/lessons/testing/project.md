## Explanation

Time to apply all of this to code you wrote. The target is a real feature in **this repo**: the Tightline Tension calculator (`src/components/tension/tension.ts` and `src/app/tension/tensionPage.tsx`). It's a good first candidate:

- **The logic is already pure.** `calculateTension({ spanM, sagM, loadKg })` takes numbers and returns numbers, with no I/O. That's ideal for unit tests.
- **The rules are safety-relevant.** The warning thresholds (caution above 10×, danger above 20×) and the sag floor that prevents division by zero are exactly the edge cases tests should pin down.
- **The page wires logic to UI.** Presets, unit toggles and a warning message are good material for a component-level integration test with React Testing Library: the real calculation and the real component together, with only the browser simulated.

A database-backed integration test for your own work follows the *integration tests* lesson's pattern: the sign-off handler against Postgres. If your current job's codebase has a feature with SQL behind it, that's an even better second project.

**Setup in this repo.** The repo has no test runner yet. Following the Next.js Vitest guide (verified in the RTL lesson):

```bash
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/dom @testing-library/user-event @testing-library/jest-dom vite-tsconfig-paths
```

Then add `vitest.config.mts` and `vitest.setup.ts` at the repo root (below), and `"test": "vitest"` to `package.json`. The `tsconfigPaths()` plugin makes the `@/…` imports resolve exactly as they do in Next.

**How to approach it, as you would at work:**

1. **Read the code and write down its rules as test names** before writing any test. Look for the comments that state invariants. `tension.ts` has several ("sag is floored", "the factor is independent of the load").
2. **Pick expected values independently of the code.** Work out `T = W / (2 sin θ)` by hand or in a calculator, not by copying what the function returns. Otherwise the test just freezes today's behaviour, bugs included.
3. **Floating point**: use `toBeCloseTo(value, digits)`, not `toBe`.
4. **Test the boundaries** of each warning level, not just values comfortably inside each band.
5. **Component test through the UI**: click a preset by its visible label, assert on the visible result and warning.
6. **Commit the tests with a short note** in the PR saying what they cover and what they deliberately don't (the SVG diagram's geometry, for example).

**The deliverable** is two test files, a config, a passing `npx vitest run`, and a two-minute explanation you could give in the interview: "here's a feature I own, here's how I tested it, here's what I chose not to test and why".

## Worked example

Config at the repo root:

```ts file=vitest.config.mts group=testing-project
import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import tsconfigPaths from "vite-tsconfig-paths"

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
  },
})
```

```ts file=vitest.setup.ts group=testing-project
import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach } from "vitest"

afterEach(() => {
  cleanup()
})
```

Unit tests for the physics, with expected values worked out by hand. For a 10 m span with 1 m sag, θ = atan(1 / 5) ≈ 11.31°, sin θ ≈ 0.1961, so each leg carries 80 / (2 × 0.1961) ≈ 204 kgf, and the factor is 1 / sin θ ≈ 5.10:

```ts file=src/components/tension/tension.test.ts group=testing-project
import { describe, expect, it } from "vitest"
import { calculateTension, minSagM, sagFromAngle } from "@/components/tension/tension"

describe("calculateTension", () => {
  it("matches a hand calculation for a 10 m span, 1 m sag, 80 kg", () => {
    const r = calculateTension({ spanM: 10, sagM: 1, loadKg: 80 })
    expect(r.sagAngleDeg).toBeCloseTo(11.31, 2)
    expect(r.tensionPerLegKgf).toBeCloseTo(203.96, 1)
    expect(r.tensionPerLegN).toBeCloseTo(2000.17, 1)
    expect(r.multiplicationFactor).toBeCloseTo(5.099, 3)
    expect(r.warningLevel).toBe("none")
  })

  it("increases tension as the line is pulled tighter", () => {
    const slack = calculateTension({ spanM: 10, sagM: 1, loadKg: 80 })
    const tight = calculateTension({ spanM: 10, sagM: 0.2, loadKg: 80 })
    expect(tight.tensionPerLegN).toBeGreaterThan(slack.tensionPerLegN)
  })

  it("floors zero sag instead of dividing by zero", () => {
    const r = calculateTension({ spanM: 10, sagM: 0, loadKg: 80 })
    expect(r.sagM).toBe(minSagM(10))
    expect(Number.isFinite(r.tensionPerLegN)).toBe(true)
  })

  it("keeps the multiplication factor meaningful with no load", () => {
    const r = calculateTension({ spanM: 10, sagM: 1, loadKg: 0 })
    expect(r.tensionPerLegN).toBe(0)
    expect(r.multiplicationFactor).toBeCloseTo(5.099, 3)
  })
})

describe("sagFromAngle", () => {
  it("is the inverse of the sag angle", () => {
    const r = calculateTension({ spanM: 12, sagM: 1.5, loadKg: 50 })
    expect(sagFromAngle(12, r.sagAngleRad)).toBeCloseTo(1.5, 10)
  })
})
```

## Exercises

### Pin the warning boundaries [2]

The warning level is `caution` above 10× and `danger` above 20×. Write tests that place inputs just either side of each threshold. Hint: the factor is 1 / sin θ, so for a span of 20 m, sag `d` gives θ = atan(d / 10). Work out the sag that gives exactly 10× and exactly 20×, then step a little each way.

#### Solution

For factor *k*, sin θ = 1/k. For a half-span *h*, d = h · tan(asin(1/k)). With h = 10 m: k = 10 → d ≈ 1.0050 m, and k = 20 → d ≈ 0.5006 m.

```ts file=src/components/tension/tension.warnings.test.ts group=testing-project
import { describe, expect, it } from "vitest"
import { calculateTension } from "@/components/tension/tension"

// sag that gives exactly factor k on a 20 m span (half-span 10 m)
const sagForFactor = (k: number) => 10 * Math.tan(Math.asin(1 / k))
const level = (sagM: number) => calculateTension({ spanM: 20, sagM, loadKg: 80 }).warningLevel

describe("warning levels", () => {
  it("is none just under 10×", () => {
    expect(level(sagForFactor(10) + 0.001)).toBe("none")
  })
  it("is caution just over 10×", () => {
    expect(level(sagForFactor(10) - 0.001)).toBe("caution")
  })
  it("is caution just under 20×", () => {
    expect(level(sagForFactor(20) + 0.001)).toBe("caution")
  })
  it("is danger just over 20×", () => {
    expect(level(sagForFactor(20) - 0.001)).toBe("danger")
  })
})
```

More sag means a *smaller* factor, which is why `+` lands below each threshold. The thresholds use strict `>`, so exactly 10× is still "none", but floating point makes "exactly" unreliable. Test a hair either side, and if the product rule at exactly 10× matters, make the code and a test say so explicitly.

### A component integration test [2]

Write a React Testing Library test for the tension page: it shows about 204 kgf per leg with the defaults; choosing the **Tow strap, rigged too tight** preset shows a danger warning mentioning infinite tension; choosing **Highline** shows the "add more sag" caution.

#### Solution

```tsx file=src/app/tension/tensionPage.test.tsx group=testing-project
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import TensionPage from "@/app/tension/tensionPage"

describe("Tension page", () => {
  it("shows the tension for the default setup", () => {
    render(<TensionPage />)
    expect(screen.getByText("204 kgf")).toBeInTheDocument()
    expect(screen.queryByText(/⚠/)).not.toBeInTheDocument()
  })

  it("warns of danger for a tow strap rigged too tight", async () => {
    const user = userEvent.setup()
    render(<TensionPage />)

    await user.click(screen.getByRole("button", { name: "Tow strap, rigged too tight" }))

    // the diagram also labels itself "approaching infinite tension", so match the warning sentence
    expect(screen.getByText(/the straight-hang load — approaching infinite tension/)).toBeInTheDocument()
    expect(screen.getByText("10,012 kgf")).toBeInTheDocument()
  })

  it("cautions on a highline", async () => {
    const user = userEvent.setup()
    render(<TensionPage />)

    await user.click(screen.getByRole("button", { name: "Highline" }))

    expect(screen.getByText(/add more sag if you can/)).toBeInTheDocument()
  })
})
```

The first version of this test matched `/approaching infinite tension/` and failed with *"Found multiple elements"*: the SVG diagram carries the same phrase. RTL's strictness caught an ambiguity. Being more specific (the warning sentence) is better than switching to `getAllByText`. It's an *integration* test in the sense that matters: the real component, the real calculation and the real formatting run together. Note that `"10,012 kgf"` depends on `toLocaleString()`'s locale. If CI runs with a different default locale it would format differently, which is a real flake risk. A sturdier fix is to pass an explicit locale in the code (`toLocaleString("en-NZ")`). Spotting that is worth mentioning in a review.

### Write the PR description [1]

Write the three-to-five line PR description for these tests, as you would for the team.

#### Solution

> **Add Vitest + RTL, with tests for the tension calculator**
> Sets up Vitest (jsdom, RTL, `@/` paths) and `npm test`.
> Unit tests pin the physics against hand-calculated values, the zero-sag floor, and both warning thresholds just either side of 10× and 20×.
> A page test checks presets end to end (default result, caution, danger).
> Not covered: the SVG diagram's geometry (visual, low risk). Follow-up: format numbers with an explicit locale so results don't depend on the machine's.

Short, says what is covered and what isn't, and flags the follow-up. Reviewers love the "not covered" line.

## Say it aloud

"Tell me about a time you added tests to existing code. How did you decide what to test?"

#### Model answer

On my own site I have a tightline tension calculator, which works out the anchor load for a line with a weight hung in the middle. It had no tests, so I added Vitest and React Testing Library. I started by reading the code and listing its rules as test names: the core formula, the sag floor that stops a division by zero when someone types zero, the factor staying meaningful with no load, and the caution and danger thresholds. I worked out the expected values by hand rather than copying the function's output, so the tests check the physics, not just today's behaviour. I tested the warning thresholds just either side of 10 and 20 times, because boundaries are where bugs live. Then I wrote a page-level test that clicks the presets the way a user would and checks the visible warning and result, which exercises the calculation and UI together. The interesting finding was that one assertion depended on number formatting via the machine's locale, a potential CI flake, so I noted that as a follow-up. I deliberately didn't test the SVG diagram's geometry. It's visual and low-risk.
