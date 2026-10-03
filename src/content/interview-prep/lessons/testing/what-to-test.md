## Explanation

You've shipped features end to end without much automated testing, so you already know the *cost* of not having tests: the nervous manual click-through before a deploy, and the bug that came back. This lesson gives you the vocabulary and a way to decide what to test. That's exactly what a team practising continuous delivery will probe.

**The three levels:**

| Level | Exercises | Speed | Catches | Example here |
| --- | --- | --- | --- | --- |
| **Unit** | One function or component in isolation; collaborators replaced or absent | Milliseconds | Logic errors, edge cases | "a checklist with an unreleased hold point can't be signed off" |
| **Integration** | Several real pieces together: your code + a real database, or a handler + its SQL | Tens to hundreds of ms | Wrong SQL, wiring, constraints, transactions | "POST sign-off writes the row and returns 409 if it's already signed" |
| **End-to-end (E2E)** | The deployed app through a real browser or HTTP | Seconds | Broken deploys, config, cross-service flows | "a foreman logs in, ticks a checklist, requests sign-off" (Playwright) |

The **test pyramid** says to have many unit tests, fewer integration tests and a handful of E2E tests, because they get slower and flakier as you go up. A popular refinement (the "testing trophy") puts the most weight on **integration** tests for typical web apps, because most bugs live in the seams. For an app whose core is SQL, the integration tests against a real Postgres are where much of the value is. Don't be dogmatic: say *why* you'd put a given test at a given level.

**Deciding what to test.** Spend tests where risk × change frequency is high:

- **Business rules** that would be expensive to get wrong: completion percentages, sign-off eligibility, hold points, permission checks, tenant isolation. In construction QA a wrong "signed off" is a real-world problem, which is a good point to make in this interview.
- **Edge cases**: empty lists, NULLs, re-inspections, time zones, the boundary of "seven days".
- **Bugs you've fixed.** Write the failing test first, then fix. It never comes back.
- **The contract at boundaries**: an API's status codes and response shape, which the frontend relies on.

Less valuable: trivial getters, framework behaviour (React renders a `<div>`), and implementation details such as which internal function was called, or component state.

**Test behaviour, not implementation.** A good test fails when the *behaviour* breaks and survives a refactor. If you rename an internal helper and twenty tests fail, those tests were coupled to implementation. That costs you on every change, and teams quietly stop trusting them.

**Anatomy of a good test:** one behaviour, a name that reads as a specification ("refuses sign-off when a hold point has failed"), and three visible parts: **Arrange** (set up), **Act** (do the thing), **Assert** (check the outcome). It should be deterministic: no real clock, no network, no dependence on test order.

**Test doubles**, by name:

- **Stub**: returns canned answers ("the repo returns these three sign-offs").
- **Mock**: records calls so you can assert on them ("the notifier was called once with…").
- **Fake**: a working lightweight implementation (an in-memory repository).
- **Spy**: wraps a real function and records calls.

In Vitest, `vi.fn()` covers stubs, mocks and spies. Prefer doubles at *your own* boundaries (a repository, a notifier, a clock) over mocking libraries you don't own.

**How it connects to how the team works.** Continuous delivery means every merge can go to production. That's only safe when the automated suite gives fast, trustworthy feedback, and tests are what make small, frequent changes cheap.

## Worked example

Feature: **"Request sign-off" button on a checklist.** Rules: every item must have a current response, every hold point's current result must be `pass` or `na`, and you can't request twice. Here's how to plan the tests out loud:

1. **Unit, pure logic**: `canRequestSignOff(items, latestResponses, existingRequests)` returns `{ ok: true }` or `{ ok: false, reason }`. Cover: all good; one item unanswered; a hold point currently failing; a hold point that failed then passed (should be OK); a request already open. Five or six fast tests that document the rule.
2. **Unit, React component**: the button is disabled with the reason shown when `ok` is false, calls `onRequest` when clicked, and shows "Requested" afterwards. It's tested with React Testing Library, with the API call passed in as a prop.
3. **Integration, handler + Postgres**: `POST /checklists/:id/sign-off-requests` inserts a row; a second call returns 409; a checklist from *another company* returns 404 (tenant isolation, which you never want to rely on a unit test for).
4. **E2E**: one happy-path test in CI against a deployed preview: log in, open a checklist, request sign-off, see it in the foreman's queue.
5. **Not tested**: that the button has a particular CSS class, or that `useState` was called.

Notice the shape: the rule is tested exhaustively and cheaply at the unit level, the SQL and security once at the integration level, and the whole flow once end to end.

## Exercises

### Place the test [1]

For each, choose unit, integration or E2E, and give a one-line reason:
1. `percentComplete()` returns 0 for a checklist with no items, not `NaN`.
2. The "outstanding sign-offs" SQL excludes other companies' data.
3. After deploying, the login page loads and the dashboard renders for a real user.
4. A migration adds a NOT NULL column without breaking inserts from the existing handler.
5. The date shown on a response is in the site's time zone (Pacific/Auckland), not UTC.

#### Solution

1. **Unit.** It's pure logic with an edge case, so it's fast and exhaustive.
2. **Integration.** Only a real database proves the SQL's `WHERE` is right. A mocked repository would just echo your assumptions.
3. **E2E (smoke test).** It's about deploy and config, which only exists in a real environment.
4. **Integration.** Run migrations against a real test database, then exercise the handler.
5. **Unit**, with the time zone passed in explicitly (or the formatter tested with a fixed date). Don't depend on the CI machine's time zone.

### Spot the implementation-detail test [2]

What's wrong with this test, and how would you rewrite its intent?

```ts norun
it("sets isSigning state then calls api.post", async () => {
  const setState = vi.spyOn(React, "useState")
  render(<SignOffButton id={1} />)
  fireEvent.click(screen.getByText("Sign"))
  expect(setState).toHaveBeenCalledWith(true)
  expect(api.post).toHaveBeenCalledTimes(1)
})
```

#### Solution

It asserts *how* the component works (that `useState` was called with `true`) rather than what the user sees. Refactor to `useReducer` and it fails, though nothing visible changed. It also mocks a module-level `api`, which hides the contract. Rewrite around behaviour: "when I click Sign, the button shows a pending state and is disabled; when the request resolves, I see 'Signed by you'; if it fails with 409, I see 'Already signed by Dave'". Pass the request function in as a prop (or use a fake server), and assert on what's on screen via accessible queries (`getByRole("button", { name: /sign/i })`). The next lesson covers exactly this.

### A test plan for a bug [2]

Bug report: *"Lot showed 100% complete but an item had actually failed its re-inspection."* Write the list of tests you'd add (names only), and say which level each sits at.

#### Solution

- Unit: `percentComplete` counts an item as complete only if its **latest** response passes.
- Unit: an item that passed and then failed on re-inspection is incomplete.
- Unit: when two responses share a timestamp, the later id wins (a deterministic tie-break).
- Integration: the SQL/view that computes lot completion returns < 100 for a lot whose latest response is a fail (seeded with exactly that case).
- Write the first one **before** fixing, watch it fail for the reported reason, then fix. The bug report becomes a regression test, and the fix comes with proof.

## Say it aloud

"How do you decide what to test, and at what level?"

#### Model answer

I start from risk. What would hurt if it broke, and how often does that code change? In a QA product that's the business rules: completion, sign-off eligibility, hold points, permissions and especially tenant isolation. Those get the most attention. Pure rules get thorough unit tests, because they're fast and I can cover the edge cases cheaply. Anything whose correctness depends on SQL, transactions or constraints gets integration tests against a real Postgres, because mocking the database just tests my assumptions back to me. Then a small number of end-to-end tests cover the critical journeys and catch deploy or config problems. I test behaviour rather than implementation, so I assert on outputs, responses and what the user sees, not on which internal function was called. That way refactors don't break the suite. And every bug fix starts with a failing test that reproduces it. The goal is a suite that's fast and trustworthy enough that we're comfortable deploying on every merge.
