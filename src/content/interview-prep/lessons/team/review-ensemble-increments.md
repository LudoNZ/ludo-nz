## Explanation

The team does pair and ensemble programming, code review and continuous delivery. You'll be asked how you work with others, and the best answers are concrete. Here's the vocabulary and the habits.

**Code review: what it's for.** Catching defects is only part of it. Review spreads knowledge (more than one person understands each change), keeps the codebase consistent, and is where juniors learn and seniors get challenged. Good reviews are fast (hours, not days: a waiting PR blocks continuous delivery), focused on what matters, and kind.

*As an author:*
- Keep PRs **small**: one idea, ideally under a few hundred lines. Split refactors from behaviour changes.
- Write a description: **what** changed, **why**, **how it was tested**, what's **not** covered, and anything you want specific eyes on. Include screenshots for UI.
- Review your own diff first. You'll catch half the comments yourself.

*As a reviewer:*
- Prioritise: correctness and security (tenant filters! injection! a missing `WHERE` on an `UPDATE`!), then design and tests, then readability, then style. Leave style to the linter and formatter.
- Ask questions rather than issue verdicts: "What happens if this list is empty?" teaches more than "this is wrong".
- Label severity: "blocking", "suggestion", "nit". Approve with nits rather than holding a PR hostage.
- Run it, or at least read the tests, for anything risky. Praise what's good. It's information too.

**Pair programming**: two people, one task, one keyboard (or a shared session). The *driver* types and thinks tactically; the *navigator* thinks strategically (where we're going, what we're missing, the next test). Swap often, every 15–30 minutes or at each green test. Benefits: fewer defects, instant review, shared knowledge, fewer rabbit holes. Costs: tiring, so take breaks, and it needs psychological safety.

**Ensemble (mob) programming**: the whole team (or a sub-team) works on one thing at one computer. One driver, everyone else navigates, and the driver rotates on a timer (often a few minutes). The common rule, from Llewellyn Falco's strong-style pairing, is *"for an idea to go from your head into the computer, it must go through someone else's hands"*: the driver doesn't decide, the navigators do. It sounds inefficient, and the case for it is flow: no waiting on reviews or hand-offs, decisions made once with everyone present, and knowledge spread instantly. It's especially good for tricky problems, onboarding, and design decisions. Your foreman experience maps well here: running a crew where everyone knows the plan, the work is visible and the most experienced person isn't doing all the work.

**Breaking work into increments.** Continuous delivery needs changes small enough to ship daily, and *each one must be safe to deploy on its own*:

- **Vertical slices**: a thin piece of a feature through every layer (DB → API → UI) that delivers something usable, rather than "all the DB work, then all the API work".
- **Expand/contract** for schema changes (SQL module).
- **Feature flags** to merge unfinished work hidden.
- **Walking skeleton first**: the simplest end-to-end version (hard-coded where needed), then flesh it out.
- **Refactor separately**: a behaviour-preserving PR, then the change.

Example: "photo evidence on responses" might ship as (1) a `photos` table and an upload-URL endpoint behind a flag, (2) upload from the response screen online-only, (3) thumbnails, (4) offline queueing, (5) remove the flag. Each step is deployable, testable and reviewable in under a day.

## Worked example

A PR description for increment (2) above:

> **Photos: upload from the response screen (online only, behind `photoEvidence` flag)**
>
> **Why.** Inspectors need photo evidence on responses (#123). This is step 2 of 5. Offline queueing and thumbnails come next.
>
> **What.** Adds an "Add photo" button on a response (flagged). It requests a presigned URL from `POST /photos/upload-url` (merged in #130), uploads directly to S3, then marks the photo uploaded. Shows upload progress and errors.
>
> **Testing.** Unit: `buildPhotoKey` and the retry helper. RTL: the button is hidden when the flag is off, shows progress, and shows an error with a retry on failure. Integration: the endpoint returns 404 for another company's response. Manually tested on a throttled 3G profile in dev tools.
>
> **Not covered.** Offline (next PR). Images over 20 MB are rejected client-side with a message. Is that limit OK?
>
> **Review focus.** The tenant check in `uploadUrl.ts` and the error states.

And a review comment that teaches without lecturing:

> **blocking:** In `uploadUrl.ts`, the response is looked up by `responseId` only. Could a user pass another company's response id and get a URL for it? I think we need the `company_id` join here. The integration test covers this for `GET /responses/:id` but not this route. Happy to pair on it if useful.

## Exercises

### Slice this feature [2]

Feature: *"Engineers can reject a sign-off with a reason; the inspector is notified and can fix and re-request."* Break it into four to six increments, each deployable on its own, and say what each one's test is.

#### Solution

1. **Schema**: add `rejected_by`, `rejected_at` and `rejected_reason` to `sign_offs` (nullable), and a CHECK that a row can't be both signed and rejected. Test: a migration test that the constraint holds.
2. **API**: `POST /sign-offs/:id/reject {reason}` with a conditional update (only if unsigned and unrejected), 409 otherwise. Tests: integration tests for success, conflict, the other-tenant 404 and a missing reason (400).
3. **Signer UI behind a flag**: a reject button with a reason field. Test: RTL for validation and the error state.
4. **Inspector sees rejections**: the checklist shows a "Rejected: reason" banner, and re-request is enabled (re-request creates a new request; history kept). Test: RTL plus an integration test for re-request.
5. **Notification**: a queue message on rejection, and the worker emails the inspector. Tests: unit test for the message builder, plus the worker's idempotency.
6. **Remove the flag** after a week with no errors.

Each increment ships alone. Schema-first with nullable columns is safe for the running code (expand/contract).

### Review this diff [2]

What would you comment on, and with what severity?

```ts norun
export async function handler(event) {
  const body = JSON.parse(event.body)
  const res = await pool.query(`UPDATE lots SET closed_at = now() WHERE id = ${body.lotId}`)
  return { statusCode: 200, body: JSON.stringify({ ok: true }) }
}
```

#### Solution

- **blocking (security):** SQL injection. `body.lotId` is interpolated, so use `$1` parameters.
- **blocking (security):** no tenant or permission check: anyone can close any company's lot. Get the company from the authenticated context and include it in the `WHERE`.
- **blocking (correctness):** no business-rule check. Closing should require every checklist to be signed off (the `bool_and` query), probably in the same conditional statement.
- **suggestion:** handle `rowCount === 0` (404 or 409) instead of always returning `ok: true`. Validate the body (a missing or non-numeric `lotId` is a 400, not a 500 from `JSON.parse` or SQL).
- **suggestion:** the `event` type is implicit `any`, so type it as `APIGatewayProxyEventV2`. Add an integration test for the tenant check and the not-all-signed-off case.
- **nit:** `res` is unused.

Lead with the security issues, keep it to one comment each, and offer to pair if there are several blocking items. A face-to-face fix is faster than a comment thread.

### Your ensemble answer [1]

Write a three-to-four sentence answer to *"Have you done ensemble or mob programming? How do you feel about it?"*, honest about your experience.

#### Solution

A good shape: what you've done that's closest (pairing on hard bugs, working through a problem with the team on a shared screen, or running a site crew); what you understand the practice to be (rotating driver, navigators decide, strong-style); why it appeals (shared context, no hand-offs, faster decisions, juniors learn quickly); and what you'd watch for (energy: breaks and timeboxes, and making sure quieter people get heard). For example: *"I haven't worked in a team that mobs full-time, but I've paired a lot on tricky problems, and on site I ran crews where the whole team needed the same picture of the job, so the idea of everyone working on one thing with a rotating driver makes sense to me. I like that decisions get made once with everyone there instead of in review threads. I'd be keen to learn how your team handles rotation and breaks."*

## Say it aloud

"What makes a good code review, from both sides?"

#### Model answer

As an author I keep pull requests small and focused, ideally one idea, with refactors separate from behaviour changes, and I write a description that says what changed, why, how I tested it, what's not covered, and where I'd like particular attention. I review my own diff before asking anyone else. As a reviewer I aim to respond quickly, because waiting reviews undermine continuous delivery, and I prioritise. First correctness and security, things like tenant filters, injection and missing conditions on updates, then design and tests, then readability, and I leave style to the linter. I phrase comments as questions where I can, label them as blocking, suggestion or nit, and approve with nits rather than holding things up. For anything risky I run it or read the tests properly, and I point out what's good as well. If there are several big issues, I'd rather pair on it for twenty minutes than have a long comment thread.
